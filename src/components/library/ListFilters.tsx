import { FilterSelect, MultiSelectFilter } from '@/src/components/filters';
import { SPACING } from '@/src/constants/theme';
import { useListFilterFieldOptions } from '@/src/hooks/useListFilterFieldOptions';
import { DEFAULT_WATCH_STATUS_FILTERS, type WatchStatusFilterState } from '@/src/utils/listFilters';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

interface ListFiltersProps {
  filters: WatchStatusFilterState;
  onChange: (filters: WatchStatusFilterState) => void;
  genreMap: Record<number, string>;
  /** Whether to show the media type filter. Off for single-type screens. */
  showMediaTypeFilter: boolean;
  /** Whether to show the Runtime and Your rating filters (list screens only). */
  showListFilters: boolean;
}

/** The library list filter fields, two per row. Shown inside `WatchStatusFiltersModal`. */
export default function ListFilters({
  filters,
  onChange,
  genreMap,
  showMediaTypeFilter,
  showListFilters,
}: ListFiltersProps) {
  const { t } = useTranslation();
  const defaults = DEFAULT_WATCH_STATUS_FILTERS;
  const {
    mediaTypeOptions,
    genreOptions,
    ratingOptions,
    userRatingOptions,
    yearOptions,
    runtimeOptions,
  } = useListFilterFieldOptions(genreMap);

  const update = <K extends keyof WatchStatusFilterState>(
    key: K,
    value: WatchStatusFilterState[K]
  ) => onChange({ ...filters, [key]: value });

  return (
    <View style={styles.container}>
      {toRows([
        showMediaTypeFilter && (
          <FilterSelect
            key="mediaType"
            label={t('filters.type')}
            value={filters.mediaType}
            options={mediaTypeOptions}
            onSelect={(val) => update('mediaType', val)}
            isActive={filters.mediaType !== defaults.mediaType}
          />
        ),
        <MultiSelectFilter
          key="genres"
          label={t('discover.genres')}
          selectedIds={filters.genres}
          operator={filters.genreOperator}
          showOperatorTabs
          operatorTestID="genre-operator-toggle"
          options={genreOptions}
          onApply={(ids, op) => onChange({ ...filters, genres: ids, genreOperator: op })}
          placeholder={t('discover.anyGenre')}
          isActive={filters.genres.length > 0}
        />,
        <FilterSelect
          key="rating"
          label={t('filters.tmdbRating')}
          value={filters.rating}
          options={ratingOptions}
          onSelect={(val) => update('rating', val)}
          isActive={filters.rating !== defaults.rating}
        />,
        showListFilters && (
          <FilterSelect
            key="userRating"
            label={t('filters.yourRating')}
            value={filters.userRating}
            options={userRatingOptions}
            onSelect={(val) => update('userRating', val)}
            isActive={filters.userRating !== defaults.userRating}
          />
        ),
        <FilterSelect
          key="year"
          label={t('discover.releaseYear')}
          value={filters.year}
          options={yearOptions}
          onSelect={(val) => update('year', val)}
          placeholder={t('discover.anyYear')}
          isActive={filters.year !== defaults.year}
        />,
        showListFilters && (
          <FilterSelect
            key="runtime"
            label={t('filters.runtime')}
            value={filters.runtime}
            options={runtimeOptions}
            onSelect={(val) => update('runtime', val)}
            isActive={filters.runtime !== defaults.runtime}
          />
        ),
      ])}
    </View>
  );
}

/** Lays filters out two per row; an odd last filter keeps half width. */
function toRows(cells: (React.ReactElement | false)[]) {
  const visible = cells.filter((cell): cell is React.ReactElement => cell !== false);
  const rows: React.ReactElement[] = [];
  for (let i = 0; i < visible.length; i += 2) {
    const [first, second] = visible.slice(i, i + 2);
    rows.push(
      <View key={`row-${i}`} style={styles.row} testID="filters-row">
        <View style={styles.cell}>{first}</View>
        <View style={styles.cell}>{second ?? null}</View>
      </View>
    );
  }
  return rows;
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.m,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
});
