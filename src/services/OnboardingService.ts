import { favoritePersonsService } from '@/src/services/FavoritePersonsService';
import { listService, type ListMediaItem } from '@/src/services/ListService';
import { preferencesService } from '@/src/services/PreferencesService';
import { auth, db } from '@/src/firebase/config';
import { mergeUserDocumentCache } from '@/src/services/UserDocumentCache';
import { resolvePreferredDisplayName } from '@/src/utils/userUtils';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import type { OnboardingSelections } from '@/src/types/onboarding';

/**
 * OnboardingService
 *
 * Orchestrates all data persistence for the personalized onboarding flow.
 * Keeps core setup writes strict, while saving optional personalization picks
 * on a best-effort basis so slow item writes do not trap users in onboarding.
 */
type OnboardingFailure = {
  label: string;
  reason: unknown;
};

type OnboardingTask = {
  label: string;
  required: boolean;
  run: () => Promise<unknown>;
};

const RETRYABLE_FIRESTORE_CODES = new Set([
  'deadline-exceeded',
  'firestore/deadline-exceeded',
  'unavailable',
  'firestore/unavailable',
]);

const getErrorMessage = (reason: unknown): string => {
  if (reason instanceof Error) {
    return reason.message;
  }

  if (typeof reason === 'string') {
    return reason;
  }

  return '';
};

const isRetryableOnboardingError = (reason: unknown): boolean => {
  const code = (reason as { code?: string } | null)?.code;
  if (code && RETRYABLE_FIRESTORE_CODES.has(code)) {
    return true;
  }

  const message = getErrorMessage(reason).toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('deadline exceeded') ||
    message.includes('deadline-exceeded') ||
    message.includes('network error') ||
    message.includes('unavailable')
  );
};

const runTask = async (task: OnboardingTask): Promise<OnboardingFailure | null> => {
  try {
    await task.run();
    return null;
  } catch (reason) {
    return {
      label: task.label,
      reason,
    };
  }
};

const runOptionalTaskWithRetry = async (
  task: OnboardingTask
): Promise<OnboardingFailure | null> => {
  const firstFailure = await runTask(task);
  if (!firstFailure || !isRetryableOnboardingError(firstFailure.reason)) {
    return firstFailure;
  }

  return runTask(task);
};

const collectFailures = async (
  tasks: OnboardingTask[],
  runner: (task: OnboardingTask) => Promise<OnboardingFailure | null>
): Promise<OnboardingFailure[]> => {
  const results = await Promise.all(tasks.map((task) => runner(task)));
  return results.filter((failure): failure is OnboardingFailure => failure !== null);
};

class OnboardingService {
  /**
   * Save all onboarding selections.
   * Region and accent color are saved in their respective steps via context.
   * Language is applied locally during onboarding and persisted here on completion.
   */
  async saveOnboarding(selections: OnboardingSelections): Promise<void> {
    const tasks: OnboardingTask[] = [];

    // 0. Display Name + Language — update Firebase Auth profile + Firestore user doc
    if (auth.currentUser) {
      const currentUser = auth.currentUser;
      const resolvedDisplayName = resolvePreferredDisplayName(
        selections.displayName,
        currentUser.displayName,
        currentUser.email
      );
      tasks.push({
        label: 'user-profile',
        required: true,
        run: async () => {
          const currentAuthDisplayName = currentUser.displayName?.trim() ?? '';
          if (resolvedDisplayName && currentAuthDisplayName !== resolvedDisplayName) {
            await updateProfile(currentUser, { displayName: resolvedDisplayName });
          }

          const userRef = doc(db, 'users', currentUser.uid);
          const userDocUpdates: Record<string, unknown> = {};

          if (resolvedDisplayName) {
            userDocUpdates.displayName = resolvedDisplayName;
          }

          if (selections.language) {
            userDocUpdates.language = selections.language;
          }

          if (Object.keys(userDocUpdates).length > 0) {
            await setDoc(userRef, userDocUpdates, { merge: true });
            mergeUserDocumentCache(currentUser.uid, userDocUpdates);
          }
        },
      });
    }

    // 1. Home Screen Lists
    if (selections.homeScreenLists.length > 0) {
      tasks.push({
        label: 'home-screen-lists',
        required: true,
        run: () => preferencesService.updatePreference('homeScreenLists', selections.homeScreenLists),
      });
    }

    // 2. TV Shows → Currently Watching list
    for (const show of selections.selectedTVShows) {
      const mediaItem: Omit<ListMediaItem, 'addedAt'> = {
        id: show.id,
        title: show.name,
        name: show.name,
        poster_path: show.poster_path,
        media_type: 'tv',
        vote_average: show.vote_average,
        release_date: show.first_air_date || '',
        first_air_date: show.first_air_date,
        genre_ids: show.genre_ids,
      };
      tasks.push({
        label: `tv-show-${show.id}`,
        required: false,
        run: () => listService.addToList('currently-watching', mediaItem, 'Watching'),
      });
    }

    // 3. Movies → Favorites + Already Watched
    for (const movie of selections.selectedMovies) {
      const mediaItem: Omit<ListMediaItem, 'addedAt'> = {
        id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
        media_type: 'movie',
        vote_average: movie.vote_average,
        release_date: movie.release_date || '',
        genre_ids: movie.genre_ids,
      };
      tasks.push({
        label: `movie-favorites-${movie.id}`,
        required: false,
        run: () => listService.addToList('favorites', mediaItem, 'Favorites'),
      });
      tasks.push({
        label: `movie-already-watched-${movie.id}`,
        required: false,
        run: () => listService.addToList('already-watched', mediaItem, 'Already Watched'),
      });
    }

    // 4. Actors → Favorite Persons
    for (const actor of selections.selectedActors) {
      tasks.push({
        label: `actor-${actor.id}`,
        required: false,
        run: () =>
          favoritePersonsService.addFavoritePerson({
            id: actor.id,
            name: actor.name,
            profile_path: actor.profile_path,
            known_for_department: actor.known_for_department,
          }),
      });
    }

    const requiredTasks = tasks.filter((task) => task.required);
    const optionalTasks = tasks.filter((task) => !task.required);
    const [failures, optionalFailures] = await Promise.all([
      collectFailures(requiredTasks, runTask),
      collectFailures(optionalTasks, runOptionalTaskWithRetry),
    ]);

    if (optionalFailures.length > 0) {
      console.warn('[OnboardingService] Optional onboarding operations failed:', optionalFailures);
    }

    if (failures.length > 0) {
      console.error('[OnboardingService] Failed onboarding operations:', failures);
      const failureLabels = failures.map(({ label }) => label).join(', ');
      const error = new Error(
        `[OnboardingService] Failed onboarding operations: ${failureLabels}`
      ) as Error & { failures: OnboardingFailure[] };
      error.failures = failures;
      throw error;
    }
  }
}

export const onboardingService = new OnboardingService();
