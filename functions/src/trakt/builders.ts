import { Timestamp } from 'firebase-admin/firestore';
import { buildListItemKey } from '../shared/listItemKeys';
import {
  isListMediaType,
  stripUndefinedDeep,
  transformFavorite,
  transformListItem,
  transformRating,
  transformWatchedMovie,
  transformWatchedShow,
  transformWatchlistItem,
} from './transforms';
import type {
  TraktFavorite,
  TraktListItem,
  TraktRating,
  TraktWatchedMovie,
  TraktWatchedShow,
  TraktWatchlistItem,
} from './types';

export const buildManagedListItemsMap = (
  items: (Record<string, unknown> | null)[]
): Record<string, Record<string, unknown>> => {
  const mappedItems: Record<string, Record<string, unknown>> = {};

  if (!Array.isArray(items)) {
    return mappedItems;
  }

  items.forEach((item) => {
    if (!item || typeof item !== 'object') {
      return;
    }

    const mediaType = item.media_type;
    const mediaId = item.id;
    if (!isListMediaType(mediaType) || typeof mediaId !== 'number') {
      return;
    }

    mappedItems[buildListItemKey(mediaType, mediaId)] = item;
  });

  return mappedItems;
};

export const buildAlreadyWatchedItemsMap = (
  watchedMovies: TraktWatchedMovie[],
  watchedShows: TraktWatchedShow[]
): Record<string, Record<string, unknown>> => {
  const safeMovies = Array.isArray(watchedMovies) ? watchedMovies : [];
  const safeShows = Array.isArray(watchedShows) ? watchedShows : [];
  return buildManagedListItemsMap([
    ...safeMovies.map((item) => (item ? transformWatchedMovie(item) : null)),
    ...safeShows.map((item) => (item ? transformWatchedShow(item) : null)),
  ]);
};

export const buildWatchlistItemsMap = (
  traktWatchlist: TraktWatchlistItem[]
): Record<string, Record<string, unknown>> => {
  const safeWatchlist = Array.isArray(traktWatchlist) ? traktWatchlist : [];
  return buildManagedListItemsMap(safeWatchlist.map((item) => (item ? transformWatchlistItem(item) : null)));
};

export const buildFavoriteItemsMap = (
  traktFavorites: TraktFavorite[]
): Record<string, Record<string, unknown>> => {
  const safeFavorites = Array.isArray(traktFavorites) ? traktFavorites : [];
  return buildManagedListItemsMap(safeFavorites.map((item) => (item ? transformFavorite(item) : null)));
};

export const buildCustomListItemsMap = (
  traktItems: TraktListItem[]
): Record<string, Record<string, unknown>> => {
  const items: Record<string, Record<string, unknown>> = {};

  if (!Array.isArray(traktItems)) {
    return items;
  }

  for (const traktItem of traktItems) {
    if (!traktItem) {
      continue;
    }
    const transformed = transformListItem(traktItem);
    if (!transformed) {
      continue;
    }

    items[buildListItemKey(transformed.mediaType, transformed.tmdbId)] = stripUndefinedDeep(
      {
        addedAt: transformed.addedAt,
        id: transformed.tmdbId,
        media_type: transformed.mediaType,
        title: transformed.title,
        traktId: transformed.traktId,
      },
      true
    ) as Record<string, unknown>;
  }

  return items;
};

export const buildEpisodeTrackingDoc = (
  traktShow: TraktWatchedShow
): { metadata: { tvShowName: string }; showId: string; episodes: Record<string, Record<string, unknown>> } | null => {
  if (!traktShow?.show?.ids?.tmdb) {
    return null;
  }

  const episodes: Record<string, Record<string, unknown>> = {};

  if (Array.isArray(traktShow.seasons)) {
    traktShow.seasons.forEach((season) => {
      if (!season) {
        return;
      }
      if (Array.isArray(season.episodes)) {
        season.episodes.forEach((episode) => {
          if (!episode || typeof season.number !== 'number' || typeof episode.number !== 'number') {
            return;
          }
          const key = `${season.number}_${episode.number}`;
          const episodeDate = episode.last_watched_at ? new Date(episode.last_watched_at) : null;
          const validEpisodeDate = episodeDate && !Number.isNaN(episodeDate.getTime()) ? episodeDate : null;
          const showDate = traktShow.last_watched_at ? new Date(traktShow.last_watched_at) : null;
          const validShowDate = showDate && !Number.isNaN(showDate.getTime()) ? showDate : null;
          const validDate = validEpisodeDate ?? validShowDate;
          episodes[key] = {
            watched: true,
            ...(validDate ? { watchedAt: Timestamp.fromDate(validDate) } : {}),
          };
        });
      } else if (season.episodes !== undefined && season.episodes !== null) {
        console.warn(
          `[TraktSync] Expected season.episodes to be an array for season ${season.number} of show "${traktShow.show.title}" (endpoint: /sync/watched/shows?extended=progress)`
        );
      }
    });
  } else if (traktShow.seasons !== undefined && traktShow.seasons !== null) {
    console.warn(
      `[TraktSync] Expected traktShow.seasons to be an array for show "${traktShow.show.title}" (endpoint: /sync/watched/shows?extended=progress)`
    );
  }

  return {
    episodes,
    metadata: {
      tvShowName: traktShow.show.title ?? '',
    },
    showId: traktShow.show.ids.tmdb.toString(),
  };
};

export const buildRatingsMap = (traktRatings: TraktRating[]): Record<string, Record<string, unknown>> => {
  const remoteRatings: Record<string, Record<string, unknown>> = {};

  if (!Array.isArray(traktRatings)) {
    return remoteRatings;
  }

  traktRatings.forEach((traktRating) => {
    if (!traktRating) {
      return;
    }
    const transformed = transformRating(traktRating);
    if (!transformed) {
      return;
    }

    const docId = transformed.docId;
    if (typeof docId !== 'string' || docId.trim() === '') {
      return;
    }

    const { docId: _docId, ...ratingData } = transformed;
    remoteRatings[docId] = ratingData;
  });

  return remoteRatings;
};
