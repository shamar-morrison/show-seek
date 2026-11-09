import { type FilterChip, FilterChipsBar } from '@/src/components/filters/FilterChipsBar';
import {
  getSortOptionLabelKey,
  getSortOrderLabelKey,
  type SortState,
} from '@/src/components/MediaSortModal';
import {
  getMediaTypeLabel,
  getRuntimeLabel,
  getTmdbRatingLabel,
  getUserRatingLabel,
} from '@/src/utils/listFilterLabels';
import { DEFAULT_WATCH_STATUS_FILTERS, type WatchStatusFilterState } from '@/src/utils/listFilters';
import { ArrowUpDownIcon } from '@hugeicons/core-free-icons';
import type { TFunction } from 'i18next';
import React from 'react';
import { useTranslation } from 'react-i18next';

export interface ActiveFilterChip {
  key: string;
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
      label: t('filters.type'),
      value: getMediaTypeLabel(t, filters.mediaType),
      remove: (f) => ({ ...f, mediaType: defaults.mediaType }),
    });
  }
  filters.genres.forEach((genreId) => {
    chips.push({
      key: `genre-${genreId}`,
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
      label: t('filters.tmdbRating'),
      value: getTmdbRatingLabel(t, filters.rating),
      remove: (f) => ({ ...f, rating: defaults.rating }),
    });
  }
  if (filters.userRating !== defaults.userRating) {
    chips.push({
      key: 'userRating',
      label: t('filters.yourRating'),
      value: getUserRatingLabel(t, filters.userRating),
      remove: (f) => ({ ...f, userRating: defaults.userRating }),
    });
  }
  if (filters.year !== defaults.year) {
    chips.push({
      key: 'year',
      label: t('discover.releaseYear'),
      value: String(filters.year),
      remove: (f) => ({ ...f, year: defaults.year }),
    });
  }
  if (filters.runtime !== defaults.runtime) {
    chips.push({
      key: 'runtime',
      label: t('filters.runtime'),
      value: getRuntimeLabel(t, filters.runtime),
      remove: (f) => ({ ...f, runtime: defaults.runtime }),
    });
  }
  return chips;
}

interface ActiveFiltersBarProps {
  filters: WatchStatusFilterState;
  onFiltersChange: (filters: WatchStatusFilterState) => void;
  sortState: SortState;
  defaultSortState: SortState;
  onSortChange: (sortState: SortState) => void;
  genreMap: Record<number, string>;
  /** Opens the filter modal so a chip's value can be adjusted. */
  onEditFilters: () => void;
  /** Opens the sort modal. */
  onEditSort: () => void;
}

/**
 * The active filters and sort on the list screens, as chips under the header. Each chip clears
 * itself with its ✕ or opens the matching modal when tapped; "Clear All" resets everything.
 * Renders nothing while no filter or custom sort is active.
 */
export function ActiveFiltersBar({
  filters,
  onFiltersChange,
  sortState,
  defaultSortState,
  onSortChange,
  genreMap,
  onEditFilters,
  onEditSort,
}: ActiveFiltersBarProps) {
  const { t } = useTranslation();

  const hasCustomSort =
    sortState.option !== defaultSortState.option ||
    sortState.direction !== defaultSortState.direction;

  const chips: FilterChip[] = [];

  if (hasCustomSort) {
    const sortValue = `${t(getSortOptionLabelKey(sortState.option))} · ${t(
      getSortOrderLabelKey(sortState.option, sortState.direction)
    )}`;
    chips.push({
      key: 'sort',
      testID: 'active-sort-chip',
      icon: ArrowUpDownIcon,
      label: t('sort.title'),
      value: sortValue,
      onPress: onEditSort,
      onRemove: () => onSortChange(defaultSortState),
      editLabel: t('sort.editSort'),
      removeLabel: t('filters.removeFilter', { name: sortValue }),
    });
  }

  describeActiveFilters(filters, t, genreMap).forEach((chip) => {
    chips.push({
      key: chip.key,
      testID: `active-filter-chip-${chip.key}`,
      label: chip.label,
      value: chip.value,
      onPress: onEditFilters,
      onRemove: () => onFiltersChange(chip.remove(filters)),
      editLabel: t('filters.editFilters'),
      removeLabel: t('filters.removeFilter', {
        name: chip.label ? `${chip.label} ${chip.value}` : chip.value,
      }),
    });
  });

  const handleClearAll = () => {
    onFiltersChange(DEFAULT_WATCH_STATUS_FILTERS);
    if (hasCustomSort) onSortChange(defaultSortState);
  };

  return <FilterChipsBar chips={chips} onClearAll={handleClearAll} />;
}
