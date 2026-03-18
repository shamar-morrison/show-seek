import { DEFAULT_HOME_LISTS } from '@/src/constants/homeScreenLists';
import { favoritePersonsService } from '@/src/services/FavoritePersonsService';
import { listService, type ListMediaItem } from '@/src/services/ListService';
import { preferencesService } from '@/src/services/PreferencesService';
import { auth, db } from '@/src/firebase/config';
import { mergeUserDocumentCache } from '@/src/services/UserDocumentCache';
import { updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import type { Movie, Person, TVShow } from '@/src/api/tmdb';
import type { OnboardingSelections } from '@/src/types/onboarding';

/**
 * OnboardingService
 *
 * Orchestrates all data persistence for the personalized onboarding flow.
 * Runs writes in parallel and surfaces a summary if any operation fails.
 */
class OnboardingService {
  /**
   * Save all onboarding selections in parallel.
   * Region and accent color are saved in their respective steps via context,
   * so are not persisted here.
   */
  async saveOnboarding(selections: OnboardingSelections): Promise<void> {
    const tasks: Array<{ label: string; promise: Promise<unknown> }> = [];

    // 0. Display Name — update Firebase Auth profile + Firestore user doc
    const trimmedDisplayName = selections.displayName.trim();
    if (trimmedDisplayName && auth.currentUser) {
      const currentUser = auth.currentUser;
      tasks.push({
        label: 'display-name',
        promise: (async () => {
          await updateProfile(currentUser, { displayName: trimmedDisplayName });
          const userRef = doc(db, 'users', currentUser.uid);
          await setDoc(userRef, { displayName: trimmedDisplayName }, { merge: true });
          mergeUserDocumentCache(currentUser.uid, { displayName: trimmedDisplayName });
        })(),
      });
    }

    // 1. Home Screen Lists
    if (selections.homeScreenLists.length > 0) {
      tasks.push({
        label: 'home-screen-lists',
        promise: preferencesService.updatePreference('homeScreenLists', selections.homeScreenLists),
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
        promise: listService.addToList('currently-watching', mediaItem, 'Watching'),
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
        promise: listService.addToList('favorites', mediaItem, 'Favorites'),
      });
      tasks.push({
        label: `movie-already-watched-${movie.id}`,
        promise: listService.addToList('already-watched', mediaItem, 'Already Watched'),
      });
    }

    // 4. Actors → Favorite Persons
    for (const actor of selections.selectedActors) {
      tasks.push({
        label: `actor-${actor.id}`,
        promise: favoritePersonsService.addFavoritePerson({
          id: actor.id,
          name: actor.name,
          profile_path: actor.profile_path,
          known_for_department: actor.known_for_department,
        }),
      });
    }

    const results = await Promise.allSettled(tasks.map((task) => task.promise));
    const failures = results
      .map((result, index) =>
        result.status === 'rejected'
          ? {
              label: tasks[index].label,
              reason: result.reason,
            }
          : null
      )
      .filter((failure): failure is { label: string; reason: unknown } => failure !== null);

    if (failures.length > 0) {
      console.error('[OnboardingService] Failed onboarding operations:', failures);
    }
  }
}

export const onboardingService = new OnboardingService();
