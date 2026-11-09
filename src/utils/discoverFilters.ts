import { RUNTIME_RANGES, type RuntimeFilter } from '@/src/utils/listFilters';

export interface DiscoverFilterState {
  sortBy: string;
  genres: number[];
  genreOperator: 'and' | 'or';
  year: number | null;
  rating: number;
  runtime: RuntimeFilter;
  language: string | null;
  watchProviders: number[];
}

/** A Discover filter field that has its own picker. */
export type DiscoverFilterField =
  | 'sort'
  | 'genres'
  | 'rating'
  | 'runtime'
  | 'year'
  | 'language'
  | 'providers';

export const DEFAULT_DISCOVER_FILTERS: DiscoverFilterState = {
  sortBy: 'popularity.desc',
  genres: [],
  genreOperator: 'or',
  year: null,
  rating: 0,
  runtime: 'any',
  language: null,
  watchProviders: [],
};

/** Sort values offered on Discover, with their label keys. */
export const DISCOVER_SORT_OPTIONS = [
  { labelKey: 'discover.popularity', value: 'popularity.desc' },
  { labelKey: 'discover.topRated', value: 'vote_average.desc' },
  { labelKey: 'discover.newest', value: 'primary_release_date.desc' },
] as const;

export function getDiscoverSortLabelKey(sortBy: string): string {
  return (
    DISCOVER_SORT_OPTIONS.find((option) => option.value === sortBy)?.labelKey ??
    'discover.popularity'
  );
}

const sameIds = (a: number[], b: number[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/** True when any filter or the sort differs from the defaults. */
export function hasActiveDiscoverFilters(filters: DiscoverFilterState): boolean {
  return !areDiscoverFiltersEqual(filters, DEFAULT_DISCOVER_FILTERS);
}

/**
 * True when both states would fetch the same results. Genre and provider order don't matter,
 * and the genre operator only matters while genres are selected.
 */
export function areDiscoverFiltersEqual(a: DiscoverFilterState, b: DiscoverFilterState): boolean {
  return (
    a.sortBy === b.sortBy &&
    sameIds(a.genres, b.genres) &&
    (a.genres.length === 0 || a.genreOperator === b.genreOperator) &&
    a.year === b.year &&
    a.rating === b.rating &&
    a.runtime === b.runtime &&
    a.language === b.language &&
    sameIds(a.watchProviders, b.watchProviders)
  );
}

/**
 * TMDB `with_runtime.gte` / `with_runtime.lte` values for a runtime filter. TMDB bounds are
 * inclusive whole minutes, so the exclusive upper end becomes `max - 1`, matching the list
 * filters. The lower bound is at least 1 so titles with no runtime on TMDB (stored as 0) don't
 * show up under "Under 30 min". For TV, TMDB filters by episode length.
 */
export function getDiscoverRuntimeParams(runtime: RuntimeFilter): {
  runtimeGte?: number;
  runtimeLte?: number;
} {
  if (runtime === 'any') return {};
  const { min, max } = RUNTIME_RANGES[runtime];
  return {
    runtimeGte: Math.max(min, 1),
    runtimeLte: Number.isFinite(max) ? max - 1 : undefined,
  };
}
