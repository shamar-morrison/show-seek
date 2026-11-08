import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { FilterSelect, MultiSelectFilter, SelectOption } from '@/src/components/filters';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import {
  getMediaTypeLabel,
  getRuntimeLabel,
  getTmdbRatingLabel,
  getUserRatingLabel,
  RATING_THRESHOLDS,
} from '@/src/utils/listFilterLabels';
import {
  areWatchStatusFiltersEqual,
  DEFAULT_WATCH_STATUS_FILTERS,
  MediaTypeFilter,
  RUNTIME_FILTER_VALUES,
  RuntimeFilter,
  UserRatingFilter,
  WatchStatusFilterState,
} from '@/src/utils/listFilters';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface WatchStatusFiltersModalProps {
  visible: boolean;
  onClose: () => void;
  filters: WatchStatusFilterState;
  onApplyFilters: (filters: WatchStatusFilterState) => void;
  genreMap: Record<number, string>;
  /** Whether to show the media type filter. Defaults to true. Set to false for single-type screens. */
  showMediaTypeFilter?: boolean;
  /** Whether to show the Runtime and Your rating filters (list screens only). Defaults to false. */
  showListFilters?: boolean;
  /**
   * How many titles the given filters would show, for a live count above the buttons.
   * Return null when the count can't be known yet (e.g. runtimes not looked up), to hide it.
   */
  getMatchCount?: (filters: WatchStatusFilterState) => number | null;
}

export default function WatchStatusFiltersModal({
  visible,
  onClose,
  filters,
  onApplyFilters,
  genreMap,
  showMediaTypeFilter = true,
  showListFilters = false,
  getMatchCount,
}: WatchStatusFiltersModalProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [localFilters, setLocalFilters] = useState<WatchStatusFilterState>(filters);

  // Update local filters when modal opens
  React.useEffect(() => {
    if (visible) {
      setLocalFilters(filters);
    }
  }, [visible, filters]);

  const updateFilter = <K extends keyof WatchStatusFilterState>(
    key: K,
    value: WatchStatusFilterState[K]
  ) => {
    setLocalFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const matchCount = useMemo(
    () => (visible && getMatchCount ? getMatchCount(localFilters) : null),
    [getMatchCount, localFilters, visible]
  );

  // Nothing to apply when the choices match the filters already in use.
  const canApply = !areWatchStatusFiltersEqual(localFilters, filters);

  const handleApply = () => {
    if (!canApply) return;
    onApplyFilters(localFilters);
  };

  const handleClear = () => {
    setLocalFilters(DEFAULT_WATCH_STATUS_FILTERS);
  };

  // Genre options (multi-select, matching Discover)
  const genreOptions = Object.entries(genreMap)
    .map(([id, name]) => ({ label: name, value: Number(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Year options
  const currentYear = new Date().getFullYear();
  const yearOptions = [
    { label: t('discover.anyYear'), value: null },
    ...Array.from({ length: currentYear - 1949 }, (_, i) => {
      const year = currentYear - i;
      return { label: String(year), value: year };
    }),
  ];

  const ratingOptions: SelectOption[] = [0, ...RATING_THRESHOLDS].map((value) => ({
    label: getTmdbRatingLabel(t, value),
    value,
  }));

  const userRatingOptions: SelectOption[] = (
    ['any', 'rated', 'unrated', ...RATING_THRESHOLDS] as UserRatingFilter[]
  ).map((value) => ({ label: getUserRatingLabel(t, value), value }));

  const runtimeOptions: SelectOption[] = (['any', ...RUNTIME_FILTER_VALUES] as RuntimeFilter[]).map(
    (value) => ({ label: getRuntimeLabel(t, value), value })
  );

  const mediaTypeOptions: SelectOption[] = (['all', 'movie', 'tv'] as MediaTypeFilter[]).map(
    (value) => ({ label: getMediaTypeLabel(t, value), value })
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={modalLayoutStyles.container}
      >
        <ModalBackground />
        <TouchableOpacity style={modalLayoutStyles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={modalLayoutStyles.card}>
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>{t('library.filterLists')}</Text>
            <Pressable onPress={onClose} hitSlop={HIT_SLOP.m}>
              <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.filtersContainer}>
            {toRows(
              [
                showMediaTypeFilter && (
                  <FilterSelect
                    key="mediaType"
                    label={t('filters.type')}
                    value={localFilters.mediaType}
                    options={mediaTypeOptions}
                    onSelect={(val) => updateFilter('mediaType', val)}
                    isActive={localFilters.mediaType !== DEFAULT_WATCH_STATUS_FILTERS.mediaType}
                  />
                ),
                <MultiSelectFilter
                  key="genres"
                  label={t('discover.genres')}
                  selectedIds={localFilters.genres}
                  operator={localFilters.genreOperator}
                  showOperatorTabs
                  operatorTestID="genre-operator-toggle"
                  options={genreOptions}
                  onApply={(ids, op) =>
                    setLocalFilters((prev) => ({ ...prev, genres: ids, genreOperator: op }))
                  }
                  placeholder={t('discover.anyGenre')}
                  isActive={localFilters.genres.length > 0}
                />,
                <FilterSelect
                  key="rating"
                  label={t('filters.tmdbRating')}
                  value={localFilters.rating}
                  options={ratingOptions}
                  onSelect={(val) => updateFilter('rating', val)}
                  isActive={localFilters.rating !== DEFAULT_WATCH_STATUS_FILTERS.rating}
                />,
                showListFilters && (
                  <FilterSelect
                    key="userRating"
                    label={t('filters.yourRating')}
                    value={localFilters.userRating}
                    options={userRatingOptions}
                    onSelect={(val) => updateFilter('userRating', val)}
                    isActive={localFilters.userRating !== DEFAULT_WATCH_STATUS_FILTERS.userRating}
                  />
                ),
                <FilterSelect
                  key="year"
                  label={t('discover.releaseYear')}
                  value={localFilters.year}
                  options={yearOptions}
                  onSelect={(val) => updateFilter('year', val)}
                  placeholder={t('discover.anyYear')}
                  isActive={localFilters.year !== DEFAULT_WATCH_STATUS_FILTERS.year}
                />,
                showListFilters && (
                  <FilterSelect
                    key="runtime"
                    label={t('filters.runtime')}
                    value={localFilters.runtime}
                    options={runtimeOptions}
                    onSelect={(val) => updateFilter('runtime', val)}
                    isActive={localFilters.runtime !== DEFAULT_WATCH_STATUS_FILTERS.runtime}
                  />
                ),
              ],
              styles
            )}
          </View>

          {matchCount !== null && (
            <Text
              style={[styles.matchCount, matchCount === 0 && styles.matchCountEmpty]}
              accessibilityLiveRegion="polite"
              testID="filters-match-count"
            >
              {matchCount === 0
                ? t('filters.noMatches')
                : t('filters.matchCount', { count: matchCount })}
            </Text>
          )}

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClear}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={styles.clearButtonText}>{t('common.clearAll')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.applyButton,
                { backgroundColor: accentColor },
                !canApply && styles.applyButtonDisabled,
              ]}
              onPress={handleApply}
              activeOpacity={ACTIVE_OPACITY}
              disabled={!canApply}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canApply }}
              testID="filters-apply-button"
            >
              <Text style={styles.applyButtonText}>{t('common.apply')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Lays filters out two per row; an odd last filter keeps half width. */
function toRows(cells: (React.ReactElement | false)[], rowStyles: typeof styles) {
  const visible = cells.filter((cell): cell is React.ReactElement => cell !== false);
  const rows: React.ReactElement[] = [];
  for (let i = 0; i < visible.length; i += 2) {
    const [first, second] = visible.slice(i, i + 2);
    rows.push(
      <View key={`row-${i}`} style={rowStyles.row} testID="filters-row">
        <View style={rowStyles.cell}>{first}</View>
        <View style={rowStyles.cell}>{second ?? null}</View>
      </View>
    );
  }
  return rows;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  filtersContainer: {
    gap: SPACING.m,
    marginBottom: SPACING.l,
  },
  matchCount: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.m,
  },
  matchCountEmpty: {
    color: COLORS.warning,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  clearButton: {
    flex: 1,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
  },
  applyButton: {
    flex: 1,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
  },
});
