import {
  DEFAULT_DISCOVER_FILTERS,
  getDiscoverSortLabelKey,
  type DiscoverFilterField,
  type DiscoverFilterState,
} from '@/src/utils/discoverFilters';
import {
  getMediaTypeLabel,
  getRuntimeLabel,
  getTmdbRatingLabel,
  getUserRatingLabel,
} from '@/src/utils/listFilterLabels';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  type ListFilterField,
  type WatchStatusFilterState,
} from '@/src/utils/listFilters';
import type { TFunction } from 'i18next';

/*
 * Active filters described one by one, for the chips under the header and for one-line
 * summaries of saved presets. Kept free of components so either can use them.
 */

export interface ActiveFilterChip {
  key: string;
  /** The field whose picker the chip opens when tapped. */
  field: ListFilterField;
  /** Field name shown muted before the value; omitted when the value speaks for itself. */
  label?: string;
  value: string;
  /** The filters with only this one removed. */
  remove: (filters: WatchStatusFilterState) => WatchStatusFilterState;
}

/** One chip per active filter (one per genre), in the filter modal's order. */
export function describeActiveFilters(
  filters: WatchStatusFilterState,
  t: TFunction,
  genreMap: Record<number, string>
): ActiveFilterChip[] {
  const defaults = DEFAULT_WATCH_STATUS_FILTERS;
  const chips: ActiveFilterChip[] = [];

  if (filters.mediaType !== defaults.mediaType) {
    chips.push({
      key: 'mediaType',
      field: 'mediaType',
      label: t('filters.type'),
      value: getMediaTypeLabel(t, filters.mediaType),
      remove: (f) => ({ ...f, mediaType: defaults.mediaType }),
    });
  }
  filters.genres.forEach((genreId) => {
    chips.push({
      key: `genre-${genreId}`,
      field: 'genres',
      value: genreMap[genreId] ?? t('discover.genres'),
      remove: (f) => {
        const genres = f.genres.filter((id) => id !== genreId);
        return {
          ...f,
          genres,
          genreOperator: genres.length === 0 ? defaults.genreOperator : f.genreOperator,
        };
      },
    });
  });
  if (filters.rating !== defaults.rating) {
    chips.push({
      key: 'rating',
      field: 'rating',
      label: t('filters.tmdbRating'),
      value: getTmdbRatingLabel(t, filters.rating),
      remove: (f) => ({ ...f, rating: defaults.rating }),
    });
  }
  if (filters.userRating !== defaults.userRating) {
    chips.push({
      key: 'userRating',
      field: 'userRating',
      label: t('filters.yourRating'),
      value: getUserRatingLabel(t, filters.userRating),
      remove: (f) => ({ ...f, userRating: defaults.userRating }),
    });
  }
  if (filters.year !== defaults.year) {
    chips.push({
      key: 'year',
      field: 'year',
      label: t('discover.releaseYear'),
      value: String(filters.year),
      remove: (f) => ({ ...f, year: defaults.year }),
    });
  }
  if (filters.runtime !== defaults.runtime) {
    chips.push({
      key: 'runtime',
      field: 'runtime',
      label: t('filters.runtime'),
      value: getRuntimeLabel(t, filters.runtime),
      remove: (f) => ({ ...f, runtime: defaults.runtime }),
    });
  }
  return chips;
}

export interface DiscoverFilterChipDescription {
  key: string;
  /** The field whose picker the chip opens when tapped. */
  field: DiscoverFilterField;
  label?: string;
  value: string;
  /** The filters with only this one removed. */
  remove: (filters: DiscoverFilterState) => DiscoverFilterState;
}

interface Names {
  genreMap: Record<number, string>;
  languageNames: Record<string, string>;
  providerNames: Record<number, string>;
}

/** One chip per active filter (one per genre and per streaming service), in the sheet's order. */
export function describeDiscoverFilters(
  filters: DiscoverFilterState,
  t: TFunction,
  { genreMap, languageNames, providerNames }: Names
): DiscoverFilterChipDescription[] {
  const defaults = DEFAULT_DISCOVER_FILTERS;
  const chips: DiscoverFilterChipDescription[] = [];

  if (filters.sortBy !== defaults.sortBy) {
    chips.push({
      key: 'sort',
      field: 'sort',
      label: t('discover.sortBy'),
      value: t(getDiscoverSortLabelKey(filters.sortBy)),
      remove: (f) => ({ ...f, sortBy: defaults.sortBy }),
    });
  }
  filters.genres.forEach((genreId) => {
    chips.push({
      key: `genre-${genreId}`,
      field: 'genres',
      value: genreMap[genreId] ?? t('discover.genres'),
      remove: (f) => {
        const genres = f.genres.filter((id) => id !== genreId);
        return {
          ...f,
          genres,
          genreOperator: genres.length === 0 ? defaults.genreOperator : f.genreOperator,
        };
      },
    });
  });
  if (filters.rating !== defaults.rating) {
    chips.push({
      key: 'rating',
      field: 'rating',
      label: t('discover.rating'),
      value: getTmdbRatingLabel(t, filters.rating),
      remove: (f) => ({ ...f, rating: defaults.rating }),
    });
  }
  if (filters.runtime !== defaults.runtime) {
    chips.push({
      key: 'runtime',
      field: 'runtime',
      label: t('filters.runtime'),
      value: getRuntimeLabel(t, filters.runtime),
      remove: (f) => ({ ...f, runtime: defaults.runtime }),
    });
  }
  if (filters.year !== defaults.year) {
    chips.push({
      key: 'year',
      field: 'year',
      label: t('discover.releaseYear'),
      value: String(filters.year),
      remove: (f) => ({ ...f, year: defaults.year }),
    });
  }
  if (filters.language !== null && filters.language !== defaults.language) {
    const code = filters.language;
    chips.push({
      key: 'language',
      field: 'language',
      label: t('discover.language'),
      value: languageNames[code] ?? code.toUpperCase(),
      remove: (f) => ({ ...f, language: defaults.language }),
    });
  }
  filters.watchProviders.forEach((providerId) => {
    chips.push({
      key: `provider-${providerId}`,
      field: 'providers',
      value: providerNames[providerId] ?? t('discover.streamingService'),
      remove: (f) => ({
        ...f,
        watchProviders: f.watchProviders.filter((id) => id !== providerId),
      }),
    });
  });
  return chips;
}
