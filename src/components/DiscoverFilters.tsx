import { WatchProvider } from '@/src/api/tmdb';
import {
  FilterLoadingSkeleton,
  FilterSelect,
  MultiSelectFilter,
  SearchableFilterSelect,
  SelectOption,
} from '@/src/components/filters';
import { SPACING } from '@/src/constants/theme';
import { useDiscoverFilterOptions } from '@/src/hooks/useDiscoverFilterOptions';
import {
  DEFAULT_DISCOVER_FILTERS,
  DISCOVER_SORT_OPTIONS,
  type DiscoverFilterState,
} from '@/src/utils/discoverFilters';
import { getRuntimeLabel } from '@/src/utils/listFilterLabels';
import { RUNTIME_FILTER_VALUES, type RuntimeFilter } from '@/src/utils/listFilters';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

/** @deprecated Use `DiscoverFilterState` from `@/src/utils/discoverFilters`. */
export type FilterState = DiscoverFilterState;

interface DiscoverFiltersProps {
  filters: DiscoverFilterState;
  onChange: (filters: DiscoverFilterState) => void;
  mediaType: 'movie' | 'tv';
  genreMap: Record<number, string>;
}

const RATING_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const RUNTIME_VALUES: RuntimeFilter[] = ['any', ...RUNTIME_FILTER_VALUES];

/** The Discover filter fields, two per row. Shown inside `DiscoverFiltersSheet`. */
export default function DiscoverFilters({
  filters,
  onChange,
  mediaType,
  genreMap,
}: DiscoverFiltersProps) {
  const { t } = useTranslation();
  const { languages, watchProviders, isLoadingWatchProviders } =
    useDiscoverFilterOptions(mediaType);

  const updateFilter = <K extends keyof DiscoverFilterState>(
    key: K,
    value: DiscoverFilterState[K]
  ) => {
    onChange({ ...filters, [key]: value });
  };

  const sortOptions: SelectOption[] = DISCOVER_SORT_OPTIONS.map((option) => ({
    label: t(option.labelKey),
    value: option.value,
  }));

  const ratingOptions: SelectOption[] = RATING_VALUES.map((value) => {
    if (value === 0) return { label: t('filters.anyRating'), value: 0 };
    return { label: t('filters.starsPlus', { count: value }), value };
  });

  const runtimeOptions: SelectOption[] = RUNTIME_VALUES.map((value) => ({
    label: getRuntimeLabel(t, value),
    value,
  }));

  const genreOptions = Object.entries(genreMap).map(([id, name]) => ({
    label: name,
    value: Number(id),
  }));

  const languageOptions = [
    { label: t('discover.anyLanguage'), value: null },
    ...languages.map((l) => ({ label: l.english_name, value: l.iso_639_1 })),
  ];

  const watchProviderOptions = watchProviders.map((p: WatchProvider) => ({
    label: p.provider_name,
    value: p.provider_id,
    logoPath: p.logo_path,
  }));

  // Generate year options from current year down to 1950
  const currentYear = new Date().getFullYear();
  const yearOptions = [
    { label: t('discover.anyYear'), value: null },
    ...Array.from({ length: currentYear - 1949 }, (_, i) => {
      const year = currentYear - i;
      return { label: String(year), value: year };
    }),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.col}>
          <FilterSelect
            label={t('discover.sortBy')}
            value={filters.sortBy}
            options={sortOptions}
            onSelect={(val) => updateFilter('sortBy', val)}
            isActive={filters.sortBy !== DEFAULT_DISCOVER_FILTERS.sortBy}
            testID="discover-sort-select"
          />
        </View>
        <View style={styles.col}>
          <MultiSelectFilter
            label={t('discover.genres')}
            selectedIds={filters.genres}
            operator={filters.genreOperator}
            showOperatorTabs
            operatorTestID="genre-operator-toggle"
            options={genreOptions}
            onApply={(ids, op) => onChange({ ...filters, genres: ids, genreOperator: op })}
            placeholder={t('discover.anyGenre')}
            isActive={filters.genres.length > 0}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <FilterSelect
            label={t('discover.rating')}
            value={filters.rating}
            options={ratingOptions}
            onSelect={(val) => updateFilter('rating', val)}
            isActive={filters.rating !== 0}
            testID="discover-rating-select"
          />
        </View>
        <View style={styles.col}>
          <FilterSelect
            label={t('filters.runtime')}
            value={filters.runtime}
            options={runtimeOptions}
            onSelect={(val) => updateFilter('runtime', val)}
            isActive={filters.runtime !== 'any'}
            testID="discover-runtime-select"
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <FilterSelect
            label={t('discover.releaseYear')}
            value={filters.year}
            options={yearOptions}
            onSelect={(val) => updateFilter('year', val)}
            placeholder={t('discover.anyYear')}
            isActive={filters.year !== null}
            testID="discover-year-select"
          />
        </View>
        <View style={styles.col}>
          <SearchableFilterSelect
            label={t('discover.language')}
            value={filters.language}
            options={languageOptions}
            onSelect={(val) => updateFilter('language', val)}
            placeholder={t('discover.anyLanguage')}
            isActive={filters.language !== null}
            searchPlaceholder={t('discover.searchLanguages')}
          />
        </View>
      </View>

      {/* Provider names run long, so this one gets the full width. */}
      {isLoadingWatchProviders ? (
        <FilterLoadingSkeleton label={t('discover.streamingService')} />
      ) : (
        <MultiSelectFilter
          label={t('discover.streamingService')}
          selectedIds={filters.watchProviders}
          options={watchProviderOptions}
          onApply={(ids) => onChange({ ...filters, watchProviders: ids })}
          placeholder={t('discover.anyStreamingService')}
          isActive={filters.watchProviders.length > 0}
          searchable
          searchPlaceholder={t('discover.searchStreamingServices')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.m,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  col: {
    flex: 1,
  },
});
