import { DEFAULT_HOME_LISTS } from '@/src/constants/homeScreenLists';
import { favoritePersonsService } from '@/src/services/FavoritePersonsService';
import { listService, type ListMediaItem } from '@/src/services/ListService';
import { preferencesService } from '@/src/services/PreferencesService';
import type { Movie, Person, TVShow } from '@/src/api/tmdb';
import type { OnboardingSelections } from '@/src/types/onboarding';

/**
 * OnboardingService
 *
 * Orchestrates all data persistence for the personalized onboarding flow.
 * Uses fire-and-forget pattern with Promise.allSettled so partial failures
 * don't block completion.
 */
class OnboardingService {
  /**
   * Save all onboarding selections in parallel.
   * Region and accent color are saved in their respective steps via context,
   * so are not persisted here.
   */
  async saveOnboarding(selections: OnboardingSelections): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    // 1. Home Screen Lists
    if (selections.homeScreenLists.length > 0) {
      tasks.push(
        preferencesService
          .updatePreference('homeScreenLists', selections.homeScreenLists)
          .catch((e) => console.error('[OnboardingService] Failed to save home lists:', e))
      );
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
      tasks.push(
        listService
          .addToList('currently-watching', mediaItem, 'Watching')
          .catch((e) =>
            console.error(`[OnboardingService] Failed to add TV show ${show.id} to watching:`, e)
          )
      );
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
      tasks.push(
        listService
          .addToList('favorites', mediaItem, 'Favorites')
          .catch((e) =>
            console.error(`[OnboardingService] Failed to add movie ${movie.id} to favorites:`, e)
          )
      );
      tasks.push(
        listService
          .addToList('already-watched', mediaItem, 'Already Watched')
          .catch((e) =>
            console.error(
              `[OnboardingService] Failed to add movie ${movie.id} to already-watched:`,
              e
            )
          )
      );
    }

    // 4. Actors → Favorite Persons
    for (const actor of selections.selectedActors) {
      tasks.push(
        favoritePersonsService
          .addFavoritePerson({
            id: actor.id,
            name: actor.name,
            profile_path: actor.profile_path,
            known_for_department: actor.known_for_department,
          })
          .catch((e) =>
            console.error(
              `[OnboardingService] Failed to add actor ${actor.id} to favorites:`,
              e
            )
          )
      );
    }

    // Fire all in parallel, don't throw on partial failures
    await Promise.allSettled(tasks);
  }
}

export const onboardingService = new OnboardingService();
