import {
  TVTIME_IMPORT_MAX_LISTS_PER_ENTITY,
  TVTIME_IMPORT_MAX_MOVIE_WATCHES,
  incrementTvTimeStat,
  type TvTimeEpisodePlay,
  type TvTimeIgnoredReason,
  type TvTimeMovieEntity,
  type TvTimeRating,
  type TvTimeShowEntity,
  type TvTimeShowStatus,
  type TvTimeSkipReason,
} from '@/functions/src/shared/tvtimeImport';

const MAX_TITLE_LENGTH = 500;
const MAX_EPISODE_NUMBER = 10_000;

export interface ShowDraft {
  tvdbId: number | null;
  imdbId: string | null;
  title: string;
  status: TvTimeShowStatus | null;
  favorite: boolean;
  rating: TvTimeRating | null;
  lists: Map<string, number>;
  addedAt: number | null;
  plays: TvTimeEpisodePlay[];
  playKeys: Set<string>;
}

export interface MovieDraft {
  tvdbId: number | null;
  imdbId: string | null;
  tmdbId: number | null;
  title: string;
  altTitle: string | null;
  year: number | null;
  watches: Set<number>;
  watchlist: boolean;
  favorite: boolean;
  rating: TvTimeRating | null;
  lists: Map<string, number>;
  addedAt: number | null;
}

export interface MovieLookup {
  uuid?: string | null;
  tvdbId?: number | null;
  imdbId?: string | null;
  tmdbId?: number | null;
  title?: string | null;
  year?: number | null;
}

/** Mutable model every format parser writes into. */
export class TvTimeLibrary {
  readonly shows = new Map<string, ShowDraft>();
  readonly movies: MovieDraft[] = [];
  skipped: Partial<Record<TvTimeSkipReason, number>> = {};
  ignored: Partial<Record<TvTimeIgnoredReason, number>> = {};
  private readonly movieIndex = new Map<string, MovieDraft>();

  constructor(readonly now: number) {}

  skip(reason: TvTimeSkipReason, amount = 1): void {
    if (amount > 0) this.skipped = incrementTvTimeStat(this.skipped, reason, amount);
  }

  ignore(reason: TvTimeIgnoredReason, amount = 1): void {
    if (amount > 0) this.ignored = incrementTvTimeStat(this.ignored, reason, amount);
  }

  findShow(tvdbId: number | null): ShowDraft | undefined {
    return tvdbId === null ? undefined : this.shows.get(`tvdb:${tvdbId}`);
  }

  /** Gets or creates the show for a TVDB id, filling in any metadata it was missing. */
  show(
    tvdbId: number,
    init: { title?: string; imdbId?: string | null; addedAt?: number | null } = {}
  ): ShowDraft {
    const key = `tvdb:${tvdbId}`;
    let draft = this.shows.get(key);
    if (!draft) {
      draft = {
        addedAt: null,
        favorite: false,
        imdbId: null,
        lists: new Map(),
        playKeys: new Set(),
        plays: [],
        rating: null,
        status: null,
        title: '',
        tvdbId,
      };
      this.shows.set(key, draft);
    }
    if (!draft.title && init.title) draft.title = init.title;
    if (!draft.imdbId && init.imdbId) draft.imdbId = init.imdbId;
    if (init.addedAt && (!draft.addedAt || init.addedAt < draft.addedAt))
      draft.addedAt = init.addedAt;
    return draft;
  }

  /**
   * Adds a play; an identical play (same episode and timestamp) is collapsed and counted.
   * Returns false only when the play is rejected as malformed.
   */
  addPlay(show: ShowDraft, play: TvTimeEpisodePlay): boolean {
    if (
      play.season > MAX_EPISODE_NUMBER ||
      play.episode > MAX_EPISODE_NUMBER ||
      play.season < 0 ||
      play.episode < 0
    ) {
      this.skip('malformed_row');
      return false;
    }
    const key = `${play.season}:${play.episode}:${play.watchedAt}`;
    if (show.playKeys.has(key)) {
      this.ignore('duplicate_plays');
      return true;
    }
    show.playKeys.add(key);
    show.plays.push(play);
    return true;
  }

  findMovie(lookup: MovieLookup): MovieDraft | undefined {
    for (const key of movieKeys(lookup)) {
      const found = this.movieIndex.get(key);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * For references that often carry only a title (list items, favorites): an id match,
   * else the one movie with that title (and year, when given) whose ids don't conflict.
   * Several such movies → 'ambiguous', so the caller doesn't pick one at random.
   */
  findReferencedMovie(lookup: MovieLookup): MovieDraft | 'ambiguous' | undefined {
    for (const key of movieKeys({ ...lookup, title: null })) {
      const found = this.movieIndex.get(key);
      if (found && !hasConflictingIds(found, lookup)) return found;
    }
    if (!lookup.title) return undefined;

    const title = lookup.title.trim().toLowerCase();
    const candidates = new Set(
      this.movies.filter((movie) => movie.title.trim().toLowerCase() === title)
    );
    // Also drafts indexed under this title by an earlier, differently titled row.
    const indexed = this.movieIndex.get(`title:${title}|${lookup.year ?? ''}`);
    if (indexed) candidates.add(indexed);

    const matches = [...candidates].filter(
      (movie) => (!lookup.year || movie.year === lookup.year) && !hasConflictingIds(movie, lookup)
    );
    if (matches.length > 1) return 'ambiguous';
    return matches[0];
  }

  /** Gets or creates a movie matched on uuid, then ids, then title+year. */
  movie(lookup: MovieLookup & { altTitle?: string | null; addedAt?: number | null }): MovieDraft {
    let draft = this.findMovie(lookup);
    // Same title and year but different ids: two films, not one (e.g. remakes).
    if (draft && hasConflictingIds(draft, lookup)) draft = undefined;
    if (!draft) {
      draft = {
        addedAt: null,
        altTitle: null,
        favorite: false,
        imdbId: null,
        lists: new Map(),
        rating: null,
        tmdbId: null,
        title: '',
        tvdbId: null,
        watches: new Set(),
        watchlist: false,
        year: null,
      };
      this.movies.push(draft);
    }
    if (!draft.title && lookup.title) draft.title = lookup.title;
    if (!draft.altTitle && lookup.altTitle) draft.altTitle = lookup.altTitle;
    if (draft.tvdbId === null && lookup.tvdbId) draft.tvdbId = lookup.tvdbId;
    if (draft.imdbId === null && lookup.imdbId) draft.imdbId = lookup.imdbId;
    if (draft.tmdbId === null && lookup.tmdbId) draft.tmdbId = lookup.tmdbId;
    if (draft.year === null && lookup.year) draft.year = lookup.year;
    if (lookup.addedAt && (!draft.addedAt || lookup.addedAt < draft.addedAt))
      draft.addedAt = lookup.addedAt;
    for (const key of movieKeys(lookup)) {
      if (!this.movieIndex.has(key)) this.movieIndex.set(key, draft);
    }
    return draft;
  }
}

export function addToList(
  target: { lists: Map<string, number> },
  name: string,
  addedAt: number
): void {
  const trimmed = name.trim().slice(0, MAX_TITLE_LENGTH);
  if (!trimmed) return;
  const existing = target.lists.get(trimmed);
  if (existing === undefined || addedAt < existing) target.lists.set(trimmed, addedAt);
}

/** True when both sides have an id of the same kind and they differ: two films, not one. */
export function hasConflictingIds(draft: MovieDraft, lookup: MovieLookup): boolean {
  const differs = <T>(a: T | null, b: T | null | undefined) => a !== null && !!b && a !== b;
  return (
    differs(draft.imdbId, lookup.imdbId) ||
    differs(draft.tvdbId, lookup.tvdbId) ||
    differs(draft.tmdbId, lookup.tmdbId)
  );
}

function movieKeys(lookup: MovieLookup): string[] {
  const keys: string[] = [];
  if (lookup.uuid) keys.push(`uuid:${lookup.uuid}`);
  if (lookup.tmdbId) keys.push(`tmdb:${lookup.tmdbId}`);
  if (lookup.tvdbId) keys.push(`tvdb:${lookup.tvdbId}`);
  if (lookup.imdbId) keys.push(`imdb:${lookup.imdbId}`);
  if (lookup.title) keys.push(`title:${lookup.title.trim().toLowerCase()}|${lookup.year ?? ''}`);
  return keys;
}

// ---------------------------------------------------------------------------
// Drafts → contract entities
// ---------------------------------------------------------------------------

export function toShowEntities(library: TvTimeLibrary): TvTimeShowEntity[] {
  const entities: TvTimeShowEntity[] = [];

  for (const draft of library.shows.values()) {
    const title = draft.title.slice(0, MAX_TITLE_LENGTH);
    if (draft.tvdbId === null && draft.imdbId === null && !title) {
      library.skip('missing_identifiers');
      continue;
    }

    const plays = [...draft.plays].sort(
      (a, b) => a.season - b.season || a.episode - b.episode || a.watchedAt - b.watchedAt
    );
    const firstActivity = plays.reduce<number | null>(
      (earliest, play) =>
        earliest === null || play.watchedAt < earliest ? play.watchedAt : earliest,
      null
    );

    entities.push({
      addedAt: draft.addedAt ?? firstActivity ?? library.now,
      favorite: draft.favorite,
      imdbId: draft.imdbId,
      lists: toListMemberships(draft.lists),
      plays,
      rating: draft.rating,
      status: draft.status,
      title,
      tvdbId: draft.tvdbId,
    });
  }

  return entities;
}

export function toMovieEntities(library: TvTimeLibrary): TvTimeMovieEntity[] {
  const entities: TvTimeMovieEntity[] = [];

  for (const draft of library.movies) {
    const title = draft.title.slice(0, MAX_TITLE_LENGTH);
    if (draft.tvdbId === null && draft.imdbId === null && draft.tmdbId === null && !title) {
      library.skip('missing_identifiers');
      continue;
    }
    // A movie with no state at all (e.g. only a bare follow row) carries nothing to import.
    if (
      draft.watches.size === 0 &&
      !draft.watchlist &&
      !draft.favorite &&
      !draft.rating &&
      draft.lists.size === 0
    ) {
      continue;
    }

    const watches = [...draft.watches]
      .sort((a, b) => a - b)
      .slice(-TVTIME_IMPORT_MAX_MOVIE_WATCHES);
    const entity: TvTimeMovieEntity = {
      addedAt: draft.addedAt ?? watches[0] ?? library.now,
      favorite: draft.favorite,
      imdbId: draft.imdbId,
      lists: toListMemberships(draft.lists),
      rating: draft.rating,
      title,
      tvdbId: draft.tvdbId,
      watches,
      watchlist: draft.watchlist,
      year: draft.year,
    };
    if (draft.altTitle) entity.altTitle = draft.altTitle.slice(0, MAX_TITLE_LENGTH);
    if (draft.tmdbId !== null) entity.tmdbId = draft.tmdbId;
    entities.push(entity);
  }

  return entities;
}

function toListMemberships(lists: Map<string, number>): { name: string; addedAt: number }[] {
  return [...lists.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, TVTIME_IMPORT_MAX_LISTS_PER_ENTITY)
    .map(([name, addedAt]) => ({ addedAt, name }));
}
