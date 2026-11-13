import type { TFunction } from 'i18next';
import type { MediaTypeFilter, RuntimeFilter, UserRatingFilter } from '@/src/utils/listFilters';

/** Score thresholds offered as "N+ stars" for both TMDB Rating and Your Rating. */
export const RATING_THRESHOLDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/*
 * Display labels for filter values, shared by the filter modal and the active-filter chips
 * so both always read the same.
 */

export function getMediaTypeLabel(t: TFunction, value: MediaTypeFilter): string {
  if (value === 'movie') return t('media.movies');
  if (value === 'tv') return t('media.tvShows');
  if (value === 'season') return t('media.seasons');
  if (value === 'episode') return t('media.episodes');
  return t('library.allMedia');
}

export function getTmdbRatingLabel(t: TFunction, value: number): string {
  return value > 0 ? t('filters.starsPlus', { count: value }) : t('filters.anyRating');
}

export function getUserRatingLabel(t: TFunction, value: UserRatingFilter): string {
  if (value === 'any') return t('filters.anyRating');
  if (value === 'rated') return t('filters.rated');
  if (value === 'unrated') return t('filters.notRated');
  return t('filters.starsPlus', { count: value });
}

export function getRuntimeLabel(t: TFunction, value: RuntimeFilter): string {
  return value === 'any' ? t('filters.anyRuntime') : t(`filters.runtimeOptions.${value}`);
}

/** "Any year", then every year from this one back to 1950. */
export function getYearOptions(t: TFunction): { label: string; value: number | null }[] {
  const currentYear = new Date().getFullYear();
  return [
    { label: t('discover.anyYear'), value: null },
    ...Array.from({ length: currentYear - 1949 }, (_, i) => {
      const year = currentYear - i;
      return { label: String(year), value: year };
    }),
  ];
}
