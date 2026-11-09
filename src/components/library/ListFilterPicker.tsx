import { FilterSelectModal, MultiSelectModal } from '@/src/components/filters';
import { useListFilterFieldOptions } from '@/src/hooks/useListFilterFieldOptions';
import type { ListFilterField, WatchStatusFilterState } from '@/src/utils/listFilters';
import React from 'react';
import { useTranslation } from 'react-i18next';

/** Name of each list filter field, as its picker's title and in its chip's accessibility hint. */
export const LIST_FILTER_FIELD_LABEL_KEYS: Record<ListFilterField, string> = {
  mediaType: 'filters.type',
  genres: 'discover.genres',
  rating: 'filters.tmdbRating',
  userRating: 'filters.yourRating',
  year: 'discover.releaseYear',
  runtime: 'filters.runtime',
};

interface ListFilterPickerProps {
  /** The field whose picker is open, or null when none is. */
  field: ListFilterField | null;
  filters: WatchStatusFilterState;
  onFiltersChange: (filters: WatchStatusFilterState) => void;
  onClose: () => void;
  genreMap: Record<number, string>;
}

/**
 * One list filter's picker on its own, opened from its active filter chip. A choice applies
 * straight away (a tap for lists, Apply for the genre checklist); closing changes nothing.
 */
export function ListFilterPicker({
  field,
  filters,
  onFiltersChange,
  onClose,
  genreMap,
}: ListFilterPickerProps) {
  const { t } = useTranslation();
  const options = useListFilterFieldOptions(genreMap);

  if (field === null) return null;

  const label = t(LIST_FILTER_FIELD_LABEL_KEYS[field]);
  const testID = `list-filter-picker-${field}`;

  if (field === 'genres') {
    return (
      <MultiSelectModal
        visible
        onClose={onClose}
        label={label}
        selectedIds={filters.genres}
        operator={filters.genreOperator}
        showOperatorTabs
        operatorTestID="genre-operator-toggle"
        options={options.genreOptions}
        onApply={(genres, genreOperator) => onFiltersChange({ ...filters, genres, genreOperator })}
        testID={testID}
      />
    );
  }

  const fieldOptions = {
    mediaType: options.mediaTypeOptions,
    rating: options.ratingOptions,
    userRating: options.userRatingOptions,
    year: options.yearOptions,
    runtime: options.runtimeOptions,
  }[field];

  return (
    <FilterSelectModal
      visible
      onClose={onClose}
      label={label}
      value={filters[field]}
      options={fieldOptions}
      onSelect={(value) => onFiltersChange({ ...filters, [field]: value })}
      testID={testID}
    />
  );
}
