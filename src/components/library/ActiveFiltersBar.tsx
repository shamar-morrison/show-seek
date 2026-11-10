import { type FilterChip, FilterChipsBar } from '@/src/components/filters/FilterChipsBar';
import { useListPresets } from '@/src/hooks/useFilterPresets';
import { findMatchingListPreset, FULL_LIST_PRESET_CAPS } from '@/src/utils/filterPresets';
import {
  LIST_FILTER_FIELD_LABEL_KEYS,
  ListFilterPicker,
} from '@/src/components/library/ListFilterPicker';
import {
  getSortOptionLabelKey,
  getSortOrderLabelKey,
  type SortState,
} from '@/src/components/MediaSortModal';
import { describeActiveFilters } from '@/src/utils/filterDescriptions';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  type ListFilterField,
  type WatchStatusFilterState,
} from '@/src/utils/listFilters';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export { describeActiveFilters, type ActiveFilterChip } from '@/src/utils/filterDescriptions';

interface ActiveFiltersBarProps {
  filters: WatchStatusFilterState;
  onFiltersChange: (filters: WatchStatusFilterState) => void;
  sortState: SortState;
  defaultSortState: SortState;
  onSortChange: (sortState: SortState) => void;
  genreMap: Record<number, string>;
  /** Opens the sort modal. */
  onEditSort: () => void;
  /**
   * Opens the filters sheet. When given, a matching saved preset is named first and opens the
   * sheet when tapped (for screens with every list filter).
   */
  onOpenFilters?: () => void;
}

/**
 * The active filters and sort on the list screens, as chips under the header. Each chip clears
 * itself with its ✕; tapping a filter chip opens that filter's own picker, and the sort chip
 * opens the sort modal. "Clear All" resets everything.
 * Renders nothing while no filter or custom sort is active.
 */
export function ActiveFiltersBar({
  filters,
  onFiltersChange,
  sortState,
  defaultSortState,
  onSortChange,
  genreMap,
  onEditSort,
  onOpenFilters,
}: ActiveFiltersBarProps) {
  const { t } = useTranslation();
  const [editingField, setEditingField] = useState<ListFilterField | null>(null);
  const { all: listPresets } = useListPresets(FULL_LIST_PRESET_CAPS);
  const activePreset = onOpenFilters
    ? findMatchingListPreset(listPresets, filters, FULL_LIST_PRESET_CAPS)
    : undefined;

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
      onPress: () => setEditingField(chip.field),
      onRemove: () => onFiltersChange(chip.remove(filters)),
      editLabel: t('filters.editFilterValue', {
        name: t(LIST_FILTER_FIELD_LABEL_KEYS[chip.field]),
      }),
      removeLabel: t('filters.removeFilter', {
        name: chip.label ? `${chip.label} ${chip.value}` : chip.value,
      }),
    });
  });

  const handleClearAll = () => {
    onFiltersChange(DEFAULT_WATCH_STATUS_FILTERS);
    if (hasCustomSort) onSortChange(defaultSortState);
  };

  return (
    <>
      <FilterChipsBar
        chips={chips}
        onClearAll={handleClearAll}
        presetChip={
          activePreset && onOpenFilters
            ? {
                name: activePreset.name,
                onPress: () => onOpenFilters(),
                testID: 'active-filters-preset-chip',
              }
            : undefined
        }
      />
      <ListFilterPicker
        field={editingField}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onClose={() => setEditingField(null)}
        genreMap={genreMap}
      />
    </>
  );
}
