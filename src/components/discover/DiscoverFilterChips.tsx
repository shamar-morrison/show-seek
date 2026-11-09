import { type FilterChip, FilterChipsBar } from '@/src/components/filters/FilterChipsBar';
import { DiscoverFilterPicker } from '@/src/components/discover/DiscoverFilterPicker';
import { useDiscoverFilterOptions } from '@/src/hooks/useDiscoverFilterOptions';
import {
  DEFAULT_DISCOVER_FILTERS,
  getDiscoverSortLabelKey,
  type DiscoverFilterField,
  type DiscoverFilterState,
} from '@/src/utils/discoverFilters';
import { getRuntimeLabel, getTmdbRatingLabel } from '@/src/utils/listFilterLabels';
import type { TFunction } from 'i18next';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

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

interface DiscoverFilterChipsProps {
  filters: DiscoverFilterState;
  onFiltersChange: (filters: DiscoverFilterState) => void;
  mediaType: 'movie' | 'tv';
  genreMap: Record<number, string>;
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
