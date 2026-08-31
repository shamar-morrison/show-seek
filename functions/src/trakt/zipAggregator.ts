import type {
  TraktFavorite,
  TraktIds,
  TraktList,
  TraktListItem,
  TraktMovie,
  TraktRating,
  TraktShow,
  TraktWatchedEpisode,
  TraktWatchedMovie,
  TraktWatchedSeason,
  TraktWatchedShow,
  TraktWatchlistItem,
} from './types';

/**
 * Deterministically constructs the Firestore watch document ID for an imported movie watch event.
 * Format: trakt-{tmdbMovieId}-{watchedAtMs}
 * Matching the precision and format pattern established by IMDb import (imdb-{movieId}-{watchedAt}).
 */
export const buildTraktMovieWatchDocId = (
  tmdbMovieId: string | number,
  watchedAtMs: number
): string => {
  const safeMovieId = String(tmdbMovieId).trim();
  const safeWatchedAt = Math.trunc(Number(watchedAtMs));
  return `trakt-${safeMovieId}-${safeWatchedAt}`;
};

/**
 * Safely parses any date string, ISO timestamp, or millisecond number to a finite millisecond timestamp.
 */
export const parseTraktDateToMs = (dateValue: unknown): number | null => {
  if (typeof dateValue === 'number' && Number.isFinite(dateValue) && dateValue > 0) {
    return Math.trunc(dateValue);
  }

  if (typeof dateValue === 'string' && dateValue.trim() !== '') {
    const directParse = Date.parse(dateValue.trim());
    if (!Number.isNaN(directParse) && directParse > 0) {
      return directParse;
    }
  }

  return null;
};

export interface AggregatedMovieWatch {
  docId: string;
  movieId: number;
  title: string;
  watchedAt: number;
}

export interface RawMovieHistoryEvent {
  action?: string;
  id?: number;
  last_watched_at?: string;
  movie?: {
    ids?: Partial<TraktIds>;
    title?: string;
    year?: number;
  };
  plays?: number;
  type?: string;
  watched_at?: string;
}

export interface RawEpisodeHistoryEvent {
  action?: string;
  episode?: {
    ids?: Partial<TraktIds>;
    number?: number;
    season?: number;
    title?: string;
  };
  id?: number;
  last_watched_at?: string;
  plays?: number;
  show?: {
    ids?: Partial<TraktIds>;
    title?: string;
    year?: number;
  };
  type?: string;
  watched_at?: string;
}

export interface RawRatingEvent {
  episode?: {
    ids?: Partial<TraktIds>;
    number?: number;
    season?: number;
    title?: string;
  };
  movie?: {
    ids?: Partial<TraktIds>;
    title?: string;
    year?: number;
  };
  rated_at?: string;
  rating?: number;
  season?: {
    ids?: Partial<TraktIds>;
    number?: number;
  };
  show?: {
    ids?: Partial<TraktIds>;
    title?: string;
    year?: number;
  };
  type?: 'movie' | 'show' | 'season' | 'episode' | string;
}

export interface RawWatchlistItem {
  episode?: {
    ids?: Partial<TraktIds>;
    number?: number;
    season?: number;
    title?: string;
  };
  id?: number;
  listed_at?: string;
  movie?: {
    ids?: Partial<TraktIds>;
    title?: string;
    year?: number;
  };
  notes?: string;
  rank?: number;
  season?: {
    ids?: Partial<TraktIds>;
    number?: number;
  };
  show?: {
    ids?: Partial<TraktIds>;
    title?: string;
    year?: number;
  };
  type?: 'movie' | 'show' | 'season' | 'episode' | string;
}

export interface RawFavoriteItem {
  id?: number;
  listed_at?: string;
  movie?: {
    ids?: Partial<TraktIds>;
    title?: string;
    year?: number;
  };
  notes?: string;
  rank?: number;
  season?: {
    ids?: Partial<TraktIds>;
    number?: number;
  };
  show?: {
    ids?: Partial<TraktIds>;
    title?: string;
    year?: number;
  };
  type?: 'movie' | 'show' | 'season' | 'episode' | string;
}

export interface RawCustomListMetadata {
  allow_comments?: boolean;
  comment_count?: number;
  created_at?: string;
  description?: string;
  display_numbers?: boolean;
  ids?: Partial<TraktIds>;
  item_count?: number;
  likes?: number;
  name?: string;
  privacy?: 'friends' | 'private' | 'public' | string;
  share_link?: string;
  sort_by?: string;
  sort_how?: string;
  type?: string;
  updated_at?: string;
}

export interface RawCustomList {
  created_at?: string;
  description?: string;
  ids?: Partial<TraktIds>;
  items?: RawWatchlistItem[];
  name?: string;
  privacy?: 'friends' | 'private' | 'public' | string;
  updated_at?: string;
}

export interface AggregatedTraktStats {
  customLists: number;
  episodes: number;
  favorites: number;
  movieWatches: number;
  movies: number;
  ratings: number;
  shows: number;
  watchlistItems: number;
}

export interface AggregatedTraktData {
  customLists: {
    items: TraktListItem[];
    list: TraktList;
  }[];
  favorites: TraktFavorite[];
  ratings: TraktRating[];
  stats: AggregatedTraktStats;
  watchedMovieEvents: AggregatedMovieWatch[];
  watchedMovies: TraktWatchedMovie[];
  watchedShows: TraktWatchedShow[];
  watchlist: TraktWatchlistItem[];
}

/**
 * Aggregates flat movie watch history events into TraktWatchedMovie[] (for list sync)
 * and individual AggregatedMovieWatch[] (for granular subcollection watch logs).
 */
export const aggregateMovieHistory = (
  rawEvents: RawMovieHistoryEvent[]
): {
  movieWatches: AggregatedMovieWatch[];
  watchedMovies: TraktWatchedMovie[];
} => {
  if (!Array.isArray(rawEvents)) {
    return { movieWatches: [], watchedMovies: [] };
  }

  const eventsByMovieTmdbId = new Map<
    number,
    {
      movie: TraktMovie;
      playsDeclared: number;
      watches: { event: RawMovieHistoryEvent; watchedAtMs: number }[];
    }
  >();
  const uniqueWatchesByDocId = new Map<string, AggregatedMovieWatch>();

  for (const rawEvent of rawEvents) {
    if (!rawEvent || typeof rawEvent !== 'object') {
      continue;
    }

    const tmdbId = rawEvent.movie?.ids?.tmdb;
    if (typeof tmdbId !== 'number' || !Number.isFinite(tmdbId) || tmdbId <= 0) {
      continue;
    }

    const watchedAtRaw = rawEvent.watched_at || rawEvent.last_watched_at;
    const watchedAtMs = parseTraktDateToMs(watchedAtRaw);
    if (watchedAtMs === null) {
      continue;
    }

    const docId = buildTraktMovieWatchDocId(tmdbId, watchedAtMs);
    const title = rawEvent.movie?.title?.trim() || 'Untitled Movie';
    const year = typeof rawEvent.movie?.year === 'number' ? rawEvent.movie.year : 0;

    if (!uniqueWatchesByDocId.has(docId)) {
      uniqueWatchesByDocId.set(docId, {
        docId,
        movieId: tmdbId,
        title,
        watchedAt: watchedAtMs,
      });
    }

    const existingGroup = eventsByMovieTmdbId.get(tmdbId);
    const eventPlays = typeof rawEvent.plays === 'number' && rawEvent.plays > 0 ? rawEvent.plays : 1;
    if (existingGroup) {
      existingGroup.watches.push({ event: rawEvent, watchedAtMs });
      existingGroup.playsDeclared = Math.max(existingGroup.playsDeclared, eventPlays);
    } else {
      eventsByMovieTmdbId.set(tmdbId, {
        movie: {
          ids: {
            imdb: rawEvent.movie?.ids?.imdb,
            slug: rawEvent.movie?.ids?.slug || String(tmdbId),
            tmdb: tmdbId,
            trakt: rawEvent.movie?.ids?.trakt ?? 0,
            tvdb: rawEvent.movie?.ids?.tvdb,
          },
          title,
          year,
        },
        playsDeclared: eventPlays,
        watches: [{ event: rawEvent, watchedAtMs }],
      });
    }
  }

  const watchedMovies: TraktWatchedMovie[] = [];

  for (const [tmdbId, { movie, playsDeclared, watches }] of eventsByMovieTmdbId.entries()) {
    const latestWatchedAtMs = Math.max(...watches.map((w) => w.watchedAtMs));
    const latestWatchedAtIso = new Date(latestWatchedAtMs).toISOString();

    watchedMovies.push({
      last_updated_at: latestWatchedAtIso,
      last_watched_at: latestWatchedAtIso,
      movie: {
        ids: {
          ...movie.ids,
          tmdb: tmdbId,
        },
        title: movie.title,
        year: movie.year,
      },
      plays: Math.max(watches.length, playsDeclared),
    });
  }

  return {
    movieWatches: Array.from(uniqueWatchesByDocId.values()),
    watchedMovies,
  };
};

/**
 * Aggregates flat episode watch history events into TraktWatchedShow[] with nested seasons and episodes.
 */
export const aggregateEpisodeHistory = (
  rawEvents: RawEpisodeHistoryEvent[]
): TraktWatchedShow[] => {
  if (!Array.isArray(rawEvents)) {
    return [];
  }

  interface EpisodeAggregate {
    lastWatchedAtMs: number;
    number: number;
    plays: number;
    season: number;
  }

  interface ShowAggregate {
    episodesByKey: Map<string, EpisodeAggregate>;
    latestWatchedAtMs: number;
    playsDeclared: number;
    show: TraktShow;
    totalWatches: number;
  }

  const showsByTmdbId = new Map<number, ShowAggregate>();

  for (const rawEvent of rawEvents) {
    if (!rawEvent || typeof rawEvent !== 'object') {
      continue;
    }

    const showTmdbId = rawEvent.show?.ids?.tmdb;
    if (typeof showTmdbId !== 'number' || !Number.isFinite(showTmdbId) || showTmdbId <= 0) {
      continue;
    }

    const seasonNumber = rawEvent.episode?.season;
    const episodeNumber = rawEvent.episode?.number;
    if (
      typeof seasonNumber !== 'number' ||
      !Number.isInteger(seasonNumber) ||
      seasonNumber < 0 ||
      typeof episodeNumber !== 'number' ||
      !Number.isInteger(episodeNumber) ||
      episodeNumber < 0
    ) {
      continue;
    }

    const watchedAtRaw = rawEvent.watched_at || rawEvent.last_watched_at;
    const watchedAtMs = parseTraktDateToMs(watchedAtRaw);
    if (watchedAtMs === null) {
      continue;
    }

    const showTitle = rawEvent.show?.title?.trim() || 'Untitled Show';
    const showYear = typeof rawEvent.show?.year === 'number' ? rawEvent.show.year : 0;
    const eventPlays = typeof rawEvent.plays === 'number' && rawEvent.plays > 0 ? rawEvent.plays : 1;

    let showAgg = showsByTmdbId.get(showTmdbId);
    if (!showAgg) {
      showAgg = {
        episodesByKey: new Map<string, EpisodeAggregate>(),
        latestWatchedAtMs: watchedAtMs,
        playsDeclared: eventPlays,
        show: {
          ids: {
            imdb: rawEvent.show?.ids?.imdb,
            slug: rawEvent.show?.ids?.slug || String(showTmdbId),
            tmdb: showTmdbId,
            trakt: rawEvent.show?.ids?.trakt ?? 0,
            tvdb: rawEvent.show?.ids?.tvdb,
          },
          title: showTitle,
          year: showYear,
        },
        totalWatches: 0,
      };
      showsByTmdbId.set(showTmdbId, showAgg);
    } else {
      showAgg.playsDeclared = Math.max(showAgg.playsDeclared, eventPlays);
    }

    showAgg.latestWatchedAtMs = Math.max(showAgg.latestWatchedAtMs, watchedAtMs);
    showAgg.totalWatches += 1;

    const episodeKey = `${seasonNumber}_${episodeNumber}`;
    const existingEp = showAgg.episodesByKey.get(episodeKey);
    if (existingEp) {
      existingEp.plays += 1;
      existingEp.lastWatchedAtMs = Math.max(existingEp.lastWatchedAtMs, watchedAtMs);
    } else {
      showAgg.episodesByKey.set(episodeKey, {
        lastWatchedAtMs: watchedAtMs,
        number: episodeNumber,
        plays: 1,
        season: seasonNumber,
      });
    }
  }

  const watchedShows: TraktWatchedShow[] = [];

  for (const [, showAgg] of showsByTmdbId.entries()) {
    const seasonsByNumber = new Map<number, TraktWatchedEpisode[]>();

    for (const ep of showAgg.episodesByKey.values()) {
      let seasonEpisodes = seasonsByNumber.get(ep.season);
      if (!seasonEpisodes) {
        seasonEpisodes = [];
        seasonsByNumber.set(ep.season, seasonEpisodes);
      }

      seasonEpisodes.push({
        last_watched_at: new Date(ep.lastWatchedAtMs).toISOString(),
        number: ep.number,
        plays: ep.plays,
      });
    }

    const seasons: TraktWatchedSeason[] = Array.from(seasonsByNumber.entries())
      .map(([number, episodes]) => ({
        episodes: episodes.sort((a, b) => a.number - b.number),
        number,
      }))
      .sort((a, b) => a.number - b.number);

    const showLastWatchedIso = new Date(showAgg.latestWatchedAtMs).toISOString();

    watchedShows.push({
      last_updated_at: showLastWatchedIso,
      last_watched_at: showLastWatchedIso,
      plays: Math.max(showAgg.totalWatches, showAgg.playsDeclared),
      seasons: seasons.length > 0 ? seasons : undefined,
      show: showAgg.show,
    });
  }

  return watchedShows;
};

/**
 * Aggregates summary show entries (fallback when granular episode history is absent).
 */
export const aggregateShowSummaries = (
  rawShows: RawEpisodeHistoryEvent[]
): TraktWatchedShow[] => {
  if (!Array.isArray(rawShows)) {
    return [];
  }

  const showsByTmdbId = new Map<number, TraktWatchedShow>();

  for (const rawShow of rawShows) {
    if (!rawShow || typeof rawShow !== 'object') {
      continue;
    }

    const showTmdbId = rawShow.show?.ids?.tmdb;
    if (typeof showTmdbId !== 'number' || !Number.isFinite(showTmdbId) || showTmdbId <= 0) {
      continue;
    }

    const watchedAtRaw = rawShow.watched_at || rawShow.last_watched_at;
    const watchedAtMs = parseTraktDateToMs(watchedAtRaw) ?? Date.now();
    const watchedAtIso = new Date(watchedAtMs).toISOString();

    const showTitle = rawShow.show?.title?.trim() || 'Untitled Show';
    const showYear = typeof rawShow.show?.year === 'number' ? rawShow.show.year : 0;
    const plays = typeof rawShow.plays === 'number' && rawShow.plays > 0 ? rawShow.plays : 1;

    showsByTmdbId.set(showTmdbId, {
      last_updated_at: watchedAtIso,
      last_watched_at: watchedAtIso,
      plays,
      show: {
        ids: {
          imdb: rawShow.show?.ids?.imdb,
          slug: rawShow.show?.ids?.slug || String(showTmdbId),
          tmdb: showTmdbId,
          trakt: rawShow.show?.ids?.trakt ?? 0,
          tvdb: rawShow.show?.ids?.tvdb,
        },
        title: showTitle,
        year: showYear,
      },
    });
  }

  return Array.from(showsByTmdbId.values());
};

/**
 * Aggregates raw rating entries into valid, deduplicated TraktRating[] items.
 */
export const aggregateRatings = (rawRatings: RawRatingEvent[]): TraktRating[] => {
  if (!Array.isArray(rawRatings)) {
    return [];
  }

  const ratingsByKey = new Map<string, { rating: TraktRating; ratedAtMs: number }>();

  for (const rawRating of rawRatings) {
    if (!rawRating || typeof rawRating !== 'object') {
      continue;
    }

    const ratingValue = rawRating.rating;
    if (
      typeof ratingValue !== 'number' ||
      !Number.isInteger(ratingValue) ||
      ratingValue < 1 ||
      ratingValue > 10
    ) {
      continue;
    }

    const ratedAtMs = parseTraktDateToMs(rawRating.rated_at);
    if (ratedAtMs === null) {
      continue;
    }

    const ratedAtIso = new Date(ratedAtMs).toISOString();
    const movieTmdbId = rawRating.movie?.ids?.tmdb;
    const showTmdbId = rawRating.show?.ids?.tmdb;

    if (rawRating.type === 'movie' || (movieTmdbId && !rawRating.type)) {
      if (typeof movieTmdbId !== 'number' || movieTmdbId <= 0) {
        continue;
      }

      const key = `movie-${movieTmdbId}`;
      const existing = ratingsByKey.get(key);
      if (!existing || ratedAtMs >= existing.ratedAtMs) {
        ratingsByKey.set(key, {
          ratedAtMs,
          rating: {
            movie: {
              ids: {
                imdb: rawRating.movie?.ids?.imdb,
                slug: rawRating.movie?.ids?.slug || String(movieTmdbId),
                tmdb: movieTmdbId,
                trakt: rawRating.movie?.ids?.trakt ?? 0,
                tvdb: rawRating.movie?.ids?.tvdb,
              },
              title: rawRating.movie?.title?.trim() || 'Untitled Movie',
              year: rawRating.movie?.year ?? 0,
            },
            rated_at: ratedAtIso,
            rating: ratingValue,
            type: 'movie',
          },
        });
      }
      continue;
    }

    if (rawRating.type === 'show' || (showTmdbId && !rawRating.type && !rawRating.episode && !rawRating.season)) {
      if (typeof showTmdbId !== 'number' || showTmdbId <= 0) {
        continue;
      }

      const key = `show-${showTmdbId}`;
      const existing = ratingsByKey.get(key);
      if (!existing || ratedAtMs >= existing.ratedAtMs) {
        ratingsByKey.set(key, {
          ratedAtMs,
          rating: {
            rated_at: ratedAtIso,
            rating: ratingValue,
            show: {
              ids: {
                imdb: rawRating.show?.ids?.imdb,
                slug: rawRating.show?.ids?.slug || String(showTmdbId),
                tmdb: showTmdbId,
                trakt: rawRating.show?.ids?.trakt ?? 0,
                tvdb: rawRating.show?.ids?.tvdb,
              },
              title: rawRating.show?.title?.trim() || 'Untitled Show',
              year: rawRating.show?.year ?? 0,
            },
            type: 'show',
          },
        });
      }
      continue;
    }

    if (rawRating.type === 'episode' || rawRating.episode) {
      const epSeason = rawRating.episode?.season;
      const epNumber = rawRating.episode?.number;
      if (
        typeof showTmdbId !== 'number' ||
        showTmdbId <= 0 ||
        typeof epSeason !== 'number' ||
        typeof epNumber !== 'number'
      ) {
        continue;
      }

      const key = `episode-${showTmdbId}-${epSeason}-${epNumber}`;
      const existing = ratingsByKey.get(key);
      if (!existing || ratedAtMs >= existing.ratedAtMs) {
        ratingsByKey.set(key, {
          ratedAtMs,
          rating: {
            episode: {
              ids: {
                imdb: rawRating.episode?.ids?.imdb,
                slug: rawRating.episode?.ids?.slug || `${epSeason}-${epNumber}`,
                tmdb: rawRating.episode?.ids?.tmdb,
                trakt: rawRating.episode?.ids?.trakt ?? 0,
                tvdb: rawRating.episode?.ids?.tvdb,
              },
              number: epNumber,
              season: epSeason,
              title: rawRating.episode?.title?.trim() || `Episode ${epNumber}`,
            },
            rated_at: ratedAtIso,
            rating: ratingValue,
            show: {
              ids: {
                imdb: rawRating.show?.ids?.imdb,
                slug: rawRating.show?.ids?.slug || String(showTmdbId),
                tmdb: showTmdbId,
                trakt: rawRating.show?.ids?.trakt ?? 0,
                tvdb: rawRating.show?.ids?.tvdb,
              },
              title: rawRating.show?.title?.trim() || 'Untitled Show',
              year: rawRating.show?.year ?? 0,
            },
            type: 'episode',
          },
        });
      }
    }
  }

  return Array.from(ratingsByKey.values()).map((entry) => entry.rating);
};

/**
 * Aggregates raw watchlist entries into valid, deduplicated TraktWatchlistItem[] items.
 */
export const aggregateWatchlist = (rawItems: RawWatchlistItem[]): TraktWatchlistItem[] => {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const itemsByKey = new Map<string, { item: TraktWatchlistItem; listedAtMs: number }>();

  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== 'object') {
      continue;
    }

    const listedAtMs = parseTraktDateToMs(rawItem.listed_at) ?? Date.now();
    const listedAtIso = new Date(listedAtMs).toISOString();
    const movieTmdbId = rawItem.movie?.ids?.tmdb;
    const showTmdbId = rawItem.show?.ids?.tmdb;

    if (rawItem.type === 'movie' || (movieTmdbId && !rawItem.type && !rawItem.show)) {
      if (typeof movieTmdbId !== 'number' || movieTmdbId <= 0) {
        continue;
      }

      const key = `movie-${movieTmdbId}`;
      const existing = itemsByKey.get(key);
      if (!existing || listedAtMs >= existing.listedAtMs) {
        itemsByKey.set(key, {
          item: {
            id: rawItem.id ?? movieTmdbId,
            listed_at: listedAtIso,
            movie: {
              ids: {
                imdb: rawItem.movie?.ids?.imdb,
                slug: rawItem.movie?.ids?.slug || String(movieTmdbId),
                tmdb: movieTmdbId,
                trakt: rawItem.movie?.ids?.trakt ?? 0,
                tvdb: rawItem.movie?.ids?.tvdb,
              },
              title: rawItem.movie?.title?.trim() || 'Untitled Movie',
              year: rawItem.movie?.year ?? 0,
            },
            notes: rawItem.notes,
            rank: rawItem.rank ?? 0,
            type: 'movie',
          },
          listedAtMs,
        });
      }
      continue;
    }

    if (
      rawItem.type === 'show' ||
      rawItem.type === 'season' ||
      rawItem.type === 'episode' ||
      (showTmdbId && !rawItem.type && !rawItem.movie)
    ) {
      if (typeof showTmdbId !== 'number' || showTmdbId <= 0) {
        continue;
      }

      const key = `show-${showTmdbId}`;
      const existing = itemsByKey.get(key);
      if (!existing || listedAtMs >= existing.listedAtMs) {
        itemsByKey.set(key, {
          item: {
            id: rawItem.id ?? showTmdbId,
            listed_at: listedAtIso,
            notes: rawItem.notes,
            rank: rawItem.rank ?? 0,
            show: {
              ids: {
                imdb: rawItem.show?.ids?.imdb,
                slug: rawItem.show?.ids?.slug || String(showTmdbId),
                tmdb: showTmdbId,
                trakt: rawItem.show?.ids?.trakt ?? 0,
                tvdb: rawItem.show?.ids?.tvdb,
              },
              title: rawItem.show?.title?.trim() || 'Untitled Show',
              year: rawItem.show?.year ?? 0,
            },
            type: 'show',
          },
          listedAtMs,
        });
      }
    }
  }

  return Array.from(itemsByKey.values()).map((entry) => entry.item);
};

/**
 * Aggregates raw favorite entries into valid, deduplicated TraktFavorite[] items.
 */
export const aggregateFavorites = (rawItems: RawFavoriteItem[]): TraktFavorite[] => {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const itemsByKey = new Map<string, { item: TraktFavorite; listedAtMs: number }>();

  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== 'object') {
      continue;
    }

    const listedAtMs = parseTraktDateToMs(rawItem.listed_at) ?? Date.now();
    const listedAtIso = new Date(listedAtMs).toISOString();
    const movieTmdbId = rawItem.movie?.ids?.tmdb;
    const showTmdbId = rawItem.show?.ids?.tmdb;

    if (rawItem.type === 'movie' || (movieTmdbId && !rawItem.type && !rawItem.show)) {
      if (typeof movieTmdbId !== 'number' || movieTmdbId <= 0) {
        continue;
      }

      const key = `movie-${movieTmdbId}`;
      const existing = itemsByKey.get(key);
      if (!existing || listedAtMs >= existing.listedAtMs) {
        itemsByKey.set(key, {
          item: {
            id: rawItem.id ?? movieTmdbId,
            listed_at: listedAtIso,
            movie: {
              ids: {
                imdb: rawItem.movie?.ids?.imdb,
                slug: rawItem.movie?.ids?.slug || String(movieTmdbId),
                tmdb: movieTmdbId,
                trakt: rawItem.movie?.ids?.trakt ?? 0,
                tvdb: rawItem.movie?.ids?.tvdb,
              },
              title: rawItem.movie?.title?.trim() || 'Untitled Movie',
              year: rawItem.movie?.year ?? 0,
            },
            notes: rawItem.notes,
            rank: rawItem.rank ?? 0,
            type: 'movie',
          },
          listedAtMs,
        });
      }
      continue;
    }

    if (
      rawItem.type === 'show' ||
      rawItem.type === 'season' ||
      rawItem.type === 'episode' ||
      (showTmdbId && !rawItem.type && !rawItem.movie)
    ) {
      if (typeof showTmdbId !== 'number' || showTmdbId <= 0) {
        continue;
      }

      const key = `show-${showTmdbId}`;
      const existing = itemsByKey.get(key);
      if (!existing || listedAtMs >= existing.listedAtMs) {
        itemsByKey.set(key, {
          item: {
            id: rawItem.id ?? showTmdbId,
            listed_at: listedAtIso,
            notes: rawItem.notes,
            rank: rawItem.rank ?? 0,
            show: {
              ids: {
                imdb: rawItem.show?.ids?.imdb,
                slug: rawItem.show?.ids?.slug || String(showTmdbId),
                tmdb: showTmdbId,
                trakt: rawItem.show?.ids?.trakt ?? 0,
                tvdb: rawItem.show?.ids?.tvdb,
              },
              title: rawItem.show?.title?.trim() || 'Untitled Show',
              year: rawItem.show?.year ?? 0,
            },
            type: 'show',
          },
          listedAtMs,
        });
      }
    }
  }

  return Array.from(itemsByKey.values()).map((entry) => entry.item);
};

/**
 * Aggregates raw custom list objects from zip data into sanitized TraktList with TraktListItem[].
 */
export const aggregateCustomLists = (
  rawLists: RawCustomList[]
): { items: TraktListItem[]; list: TraktList }[] => {
  if (!Array.isArray(rawLists)) {
    return [];
  }

  const results: { items: TraktListItem[]; list: TraktList }[] = [];

  for (const rawList of rawLists) {
    if (!rawList || typeof rawList !== 'object') {
      continue;
    }

    const listName = rawList.name?.trim();
    if (!listName) {
      continue;
    }

    const createdAtMs = parseTraktDateToMs(rawList.created_at) ?? Date.now();
    const updatedAtMs = parseTraktDateToMs(rawList.updated_at) ?? createdAtMs;
    const traktId = typeof rawList.ids?.trakt === 'number' ? rawList.ids.trakt : Math.abs(hashCode(listName));
    const slug = rawList.ids?.slug || normalizeSlug(listName);

    const list: TraktList = {
      created_at: new Date(createdAtMs).toISOString(),
      description: rawList.description || '',
      ids: {
        slug,
        trakt: traktId,
      },
      name: listName,
      privacy: rawList.privacy === 'public' ? 'public' : 'private',
      updated_at: new Date(updatedAtMs).toISOString(),
    };

    const items: TraktListItem[] = [];
    const seenItemKeys = new Set<string>();

    if (Array.isArray(rawList.items)) {
      for (const rawItem of rawList.items) {
        if (!rawItem || typeof rawItem !== 'object') {
          continue;
        }

        const listedAtMs = parseTraktDateToMs(rawItem.listed_at) ?? updatedAtMs;
        const listedAtIso = new Date(listedAtMs).toISOString();
        const movieTmdbId = rawItem.movie?.ids?.tmdb;
        const showTmdbId = rawItem.show?.ids?.tmdb;

        if (rawItem.type === 'movie' || (movieTmdbId && !rawItem.type)) {
          if (typeof movieTmdbId !== 'number' || movieTmdbId <= 0) {
            continue;
          }

          const key = `movie-${movieTmdbId}`;
          if (seenItemKeys.has(key)) {
            continue;
          }
          seenItemKeys.add(key);

          items.push({
            id: rawItem.id ?? movieTmdbId,
            listed_at: listedAtIso,
            movie: {
              ids: {
                imdb: rawItem.movie?.ids?.imdb,
                slug: rawItem.movie?.ids?.slug || String(movieTmdbId),
                tmdb: movieTmdbId,
                trakt: rawItem.movie?.ids?.trakt ?? 0,
                tvdb: rawItem.movie?.ids?.tvdb,
              },
              title: rawItem.movie?.title?.trim() || 'Untitled Movie',
              year: rawItem.movie?.year ?? 0,
            },
            notes: rawItem.notes,
            rank: rawItem.rank ?? items.length + 1,
            type: 'movie',
          });
          continue;
        }

        if (rawItem.type === 'show' || (showTmdbId && !rawItem.type)) {
          if (typeof showTmdbId !== 'number' || showTmdbId <= 0) {
            continue;
          }

          const key = `show-${showTmdbId}`;
          if (seenItemKeys.has(key)) {
            continue;
          }
          seenItemKeys.add(key);

          items.push({
            id: rawItem.id ?? showTmdbId,
            listed_at: listedAtIso,
            notes: rawItem.notes,
            rank: rawItem.rank ?? items.length + 1,
            show: {
              ids: {
                imdb: rawItem.show?.ids?.imdb,
                slug: rawItem.show?.ids?.slug || String(showTmdbId),
                tmdb: showTmdbId,
                trakt: rawItem.show?.ids?.trakt ?? 0,
                tvdb: rawItem.show?.ids?.tvdb,
              },
              title: rawItem.show?.title?.trim() || 'Untitled Show',
              year: rawItem.show?.year ?? 0,
            },
            type: 'show',
          });
        }
      }
    }

    results.push({ items, list });
  }

  return results;
};

const normalizeSlug = (name: string): string =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'imported-list';

const hashCode = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};
