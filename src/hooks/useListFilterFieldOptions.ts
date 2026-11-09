import type { MultiSelectOption, SelectOption } from '@/src/components/filters';
import {
  getMediaTypeLabel,
  getRuntimeLabel,
  getTmdbRatingLabel,
  getUserRatingLabel,
  getYearOptions,
  RATING_THRESHOLDS,
} from '@/src/utils/listFilterLabels';
import {
  RUNTIME_FILTER_VALUES,
  type MediaTypeFilter,
  type RuntimeFilter,
  type UserRatingFilter,
} from '@/src/utils/listFilters';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The option lists for every list filter field, shared by the filter modal and the pickers that
 * the active filter chips open, so both always offer the same choices.
 */
export function useListFilterFieldOptions(genreMap: Record<number, string>) {
  const { t } = useTranslation();

  return useMemo(() => {
    const mediaTypeOptions: SelectOption[] = (['all', 'movie', 'tv'] as MediaTypeFilter[]).map(
      (value) => ({ label: getMediaTypeLabel(t, value), value })
    );

    const genreOptions: MultiSelectOption[] = Object.entries(genreMap)
      .map(([id, name]) => ({ label: name, value: Number(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));

    const ratingOptions: SelectOption[] = [0, ...RATING_THRESHOLDS].map((value) => ({
      label: getTmdbRatingLabel(t, value),
      value,
    }));

    const userRatingOptions: SelectOption[] = (
      ['any', 'rated', 'unrated', ...RATING_THRESHOLDS] as UserRatingFilter[]
    ).map((value) => ({ label: getUserRatingLabel(t, value), value }));

    const runtimeOptions: SelectOption[] = (
      ['any', ...RUNTIME_FILTER_VALUES] as RuntimeFilter[]
    ).map((value) => ({ label: getRuntimeLabel(t, value), value }));

    return {
      mediaTypeOptions,
      genreOptions,
      ratingOptions,
      userRatingOptions,
      yearOptions: getYearOptions(t) as SelectOption[],
      runtimeOptions,
    };
  }, [genreMap, t]);
}
