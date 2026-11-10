import { type FilterChip, FilterChipsBar } from '@/src/components/filters/FilterChipsBar';
import { DiscoverFilterPicker } from '@/src/components/discover/DiscoverFilterPicker';
import { useDiscoverFilterOptions } from '@/src/hooks/useDiscoverFilterOptions';
import {
  DEFAULT_DISCOVER_FILTERS,
  type DiscoverFilterField,
  type DiscoverFilterState,
} from '@/src/utils/discoverFilters';
import { describeDiscoverFilters } from '@/src/utils/filterDescriptions';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export {
  describeDiscoverFilters,
  type DiscoverFilterChipDescription,
} from '@/src/utils/filterDescriptions';

interface DiscoverFilterChipsProps {
  filters: DiscoverFilterState;
  onFiltersChange: (filters: DiscoverFilterState) => void;
  mediaType: 'movie' | 'tv';
  genreMap: Record<number, string>;
  /** Name of the saved preset the filters match, shown first. */
  presetName?: string;
  /** Opens the filter sheet from the preset chip. */
  onPresetPress?: () => void;
}

/** Name of each field, as its picker's title and in its chip's accessibility hint. */
const FIELD_LABEL_KEYS: Record<DiscoverFilterField, string> = {
  sort: 'discover.sortBy',
  genres: 'discover.genres',
  rating: 'discover.rating',
  runtime: 'filters.runtime',
  year: 'discover.releaseYear',
  language: 'discover.language',
  providers: 'discover.streamingService',
};

/**
 * The active Discover filters as chips under the Movies / TV Shows toggle. Tapping a chip opens
 * that filter's own picker; its ✕ removes just that filter.
 */
export function DiscoverFilterChips({
  filters,
  onFiltersChange,
  mediaType,
  genreMap,
  presetName,
  onPresetPress,
}: DiscoverFilterChipsProps) {
  const { t } = useTranslation();
  const { languageNames, providerNames } = useDiscoverFilterOptions(mediaType);
  const [editingField, setEditingField] = useState<DiscoverFilterField | null>(null);

  const chips: FilterChip[] = describeDiscoverFilters(filters, t, {
    genreMap,
    languageNames,
    providerNames,
  }).map((chip) => ({
    key: chip.key,
    testID: `discover-filter-chip-${chip.key}`,
    label: chip.label,
    value: chip.value,
    onPress: () => setEditingField(chip.field),
    onRemove: () => onFiltersChange(chip.remove(filters)),
    editLabel: t('filters.editFilterValue', { name: t(FIELD_LABEL_KEYS[chip.field]) }),
    removeLabel: t('filters.removeFilter', {
      name: chip.label ? `${chip.label} ${chip.value}` : chip.value,
    }),
  }));

  return (
    <>
      <FilterChipsBar
        chips={chips}
        onClearAll={() => onFiltersChange(DEFAULT_DISCOVER_FILTERS)}
        presetChip={
          presetName && onPresetPress
            ? { name: presetName, onPress: onPresetPress, testID: 'discover-preset-chip' }
            : undefined
        }
        testID="discover-active-filters"
        clearAllTestID="discover-filters-clear-all"
      />
      <DiscoverFilterPicker
        field={editingField}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onClose={() => setEditingField(null)}
        mediaType={mediaType}
        genreMap={genreMap}
      />
    </>
  );
}
