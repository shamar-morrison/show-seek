import {
  FilterSelectModal,
  MultiSelectModal,
  SearchableSelectModal,
} from '@/src/components/filters';
import { useDiscoverFieldOptions } from '@/src/hooks/useDiscoverFilterOptions';
import type { DiscoverFilterField, DiscoverFilterState } from '@/src/utils/discoverFilters';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface DiscoverFilterPickerProps {
  /** The field whose picker is open, or null when none is. */
  field: DiscoverFilterField | null;
  filters: DiscoverFilterState;
  onFiltersChange: (filters: DiscoverFilterState) => void;
  onClose: () => void;
  mediaType: 'movie' | 'tv';
  genreMap: Record<number, string>;
}

/**
 * One Discover filter's picker on its own, opened from its active filter chip. A choice applies
 * straight away (a tap for lists, Apply for checklists); closing without one changes nothing.
 */
export function DiscoverFilterPicker({
  field,
  filters,
  onFiltersChange,
  onClose,
  mediaType,
  genreMap,
}: DiscoverFilterPickerProps) {
  const { t } = useTranslation();
  const options = useDiscoverFieldOptions(mediaType, genreMap);

  if (field === null) return null;

  const testID = `discover-filter-picker-${field}`;
  const select = <K extends keyof DiscoverFilterState>(key: K) => ({
    visible: true,
    onClose,
    value: filters[key],
    onSelect: (value: DiscoverFilterState[K]) => onFiltersChange({ ...filters, [key]: value }),
    testID,
  });

  switch (field) {
    case 'sort':
      return (
        <FilterSelectModal
          {...select('sortBy')}
          label={t('discover.sortBy')}
          options={options.sortOptions}
        />
      );
    case 'rating':
      return (
        <FilterSelectModal
          {...select('rating')}
          label={t('discover.rating')}
          options={options.ratingOptions}
        />
      );
    case 'runtime':
      return (
        <FilterSelectModal
          {...select('runtime')}
          label={t('filters.runtime')}
          options={options.runtimeOptions}
        />
      );
    case 'year':
      return (
        <FilterSelectModal
          {...select('year')}
          label={t('discover.releaseYear')}
          options={options.yearOptions}
        />
      );
    case 'language':
      return (
        <SearchableSelectModal
          {...select('language')}
          label={t('discover.language')}
          options={options.languageOptions}
          searchPlaceholder={t('discover.searchLanguages')}
        />
      );
    case 'genres':
      return (
        <MultiSelectModal
          visible
          onClose={onClose}
          label={t('discover.genres')}
          selectedIds={filters.genres}
          operator={filters.genreOperator}
          showOperatorTabs
          operatorTestID="genre-operator-toggle"
          options={options.genreOptions}
          onApply={(genres, genreOperator) =>
            onFiltersChange({ ...filters, genres, genreOperator })
          }
          testID={testID}
        />
      );
    case 'providers':
      return (
        <MultiSelectModal
          visible
          onClose={onClose}
          label={t('discover.streamingService')}
          selectedIds={filters.watchProviders}
          options={options.watchProviderOptions}
          onApply={(watchProviders) => onFiltersChange({ ...filters, watchProviders })}
          searchable
          searchPlaceholder={t('discover.searchStreamingServices')}
          testID={testID}
        />
      );
  }
}
