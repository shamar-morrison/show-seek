import FilterPresetSheets, {
  type FilterPresetSheetsRef,
} from '@/src/components/filters/FilterPresetSheets';
import { SavedPresetsStrip } from '@/src/components/filters/SavedPresetsStrip';
import { FilterSelect, MultiSelectFilter } from '@/src/components/filters';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useGuestAccess } from '@/src/context/GuestAccessContext';
import { useFilterPresetActions } from '@/src/hooks/useFilterPresetActions';
import { useListPresets } from '@/src/hooks/useFilterPresets';
import { useListFilterFieldOptions } from '@/src/hooks/useListFilterFieldOptions';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
import { describeActiveFilters } from '@/src/utils/filterDescriptions';
import {
  adaptListFiltersForScreen,
  findMatchingListPreset,
  getListSaveBlocker,
  joinPresetSummary,
  validatePresetName,
  type FilterPreset,
  type ListPresetScreenCaps,
} from '@/src/utils/filterPresets';
import {
  areWatchStatusFiltersEqual,
  DEFAULT_WATCH_STATUS_FILTERS,
  WatchStatusFilterState,
} from '@/src/utils/listFilters';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

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
  /**
   * The one media type a screen without the media type filter shows. Saved presets appear on
   * screens with the media type filter, or once this is given.
   */
  screenMediaType?: 'movie' | 'tv';
}

/**
 * The library list filters in a bottom sheet, shown while `visible` is true. Picks are held
 * until Apply. Saved presets sit at the top; their options, the full list and naming open in
 * their own sheets while this one steps aside, then it comes back with the picks intact.
 */
export default function WatchStatusFiltersModal({
  visible,
  onClose,
  filters,
  onApplyFilters,
  genreMap,
  showMediaTypeFilter = true,
  showListFilters = false,
  getMatchCount,
  screenMediaType,
}: WatchStatusFiltersModalProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { accentColor } = useAccentColor();
  const { isGuest, requireAccount } = useGuestAccess();
  const sheetRef = useRef<TrueSheet>(null);
  const presetSheetsRef = useRef<FilterPresetSheetsRef>(null);
  // True while the sheet is hidden for a preset sheet, so closing it isn't treated as Close.
  const steppedAsideRef = useRef(false);
  // Whether the sheet is open (or opening). On Android, dismissing a sheet that isn't open
  // leaves TrueSheet stuck in "dismissing", so its X and swipe no longer close it next time.
  const isOpenRef = useRef(false);
  const [localFilters, setLocalFilters] = useState<WatchStatusFilterState>(filters);

  // Update local filters when the sheet opens
  useEffect(() => {
    if (visible) {
      setLocalFilters(filters);
    }
  }, [visible, filters]);

  const openSheet = useCallback(async () => {
    isOpenRef.current = true;
    await sheetRef.current?.present();
  }, []);

  const closeSheet = useCallback(async () => {
    if (!isOpenRef.current) return;
    isOpenRef.current = false;
    await sheetRef.current?.dismiss();
  }, []);

  useEffect(() => {
    if (visible) {
      steppedAsideRef.current = false;
      void openSheet();
    } else {
      // Usually already closed by the time the screen hides it (X, swipe, Apply).
      void closeSheet();
    }
  }, [closeSheet, openSheet, visible]);

  const handleDidDismiss = () => {
    isOpenRef.current = false;
    if (!steppedAsideRef.current) onClose();
  };

  const hideForPresetSheet = useCallback(async () => {
    steppedAsideRef.current = true;
    await closeSheet();
  }, [closeSheet]);

  const showAfterPresetSheet = useCallback(async () => {
    steppedAsideRef.current = false;
    await openSheet();
  }, [openSheet]);

  const presetCaps = useMemo<ListPresetScreenCaps>(
    () => ({
      mediaType: showMediaTypeFilter ? 'all' : (screenMediaType ?? 'all'),
      showListFilters,
    }),
    [screenMediaType, showListFilters, showMediaTypeFilter]
  );
  const showPresets = showMediaTypeFilter || screenMediaType !== undefined;
  const { all: allPresets, compatible: presets, hiddenCount } = useListPresets(presetCaps);
  const presetActions = useFilterPresetActions('list');
  const activePreset = findMatchingListPreset(presets, localFilters, presetCaps);
  const saveBlocker = getListSaveBlocker(allPresets, localFilters);

  // A screen without the media type filter can't change a preset's media type, so it keeps it.
  const filtersForUpdate = (preset: FilterPreset): WatchStatusFilterState =>
    showMediaTypeFilter
      ? localFilters
      : { ...localFilters, mediaType: (preset.filters as WatchStatusFilterState).mediaType };

  // "Your rating" needs its label, or it reads like the TMDB rating.
  const summarize = (value: WatchStatusFilterState) =>
    joinPresetSummary(
      describeActiveFilters(value, t, genreMap).map((chip) =>
        chip.field === 'userRating' && chip.label ? `${chip.label} ${chip.value}` : chip.value
      )
    );

  const applyPreset = (preset: FilterPreset) => {
    if (preset.scope !== 'list') return;
    presetActions.recordApplied(preset);
    steppedAsideRef.current = false;
    onApplyFilters(adaptListFiltersForScreen(preset.filters, presetCaps));
  };

  // Guests are asked to sign in once the sheet is out of the way.
  const handleSave = () => {
    if (isGuest) {
      void sheetRef.current?.dismiss().then(() => requireAccount());
      return;
    }
    void presetSheetsRef.current?.openSave();
  };

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
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onApplyFilters(localFilters);
  };

  const handleClear = () => {
    void Haptics.selectionAsync();
    setLocalFilters(DEFAULT_WATCH_STATUS_FILTERS);
  };

  const {
    mediaTypeOptions,
    genreOptions,
    ratingOptions,
    userRatingOptions,
    yearOptions,
    runtimeOptions,
  } = useListFilterFieldOptions(genreMap);

  return (
    <>
      <TrueSheet
        ref={sheetRef}
        detents={['auto']}
        cornerRadius={BORDER_RADIUS.l}
        backgroundColor={COLORS.surface}
        grabber={false}
        onDidDismiss={handleDidDismiss}
      >
        <GestureHandlerRootView style={[modalSheetStyles.content, styles.content, { width }]}>
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>{t('library.filterLists')}</Text>
            <Pressable
              onPress={() => sheetRef.current?.dismiss()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              testID="filters-close"
            >
              <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
            </Pressable>
          </View>

          {showPresets && (
            <SavedPresetsStrip
              presets={presets}
              activePresetId={activePreset?.id}
              saveBlocker={saveBlocker}
              hiddenCount={hiddenCount}
              onApply={applyPreset}
              onLongPress={(preset) => void presetSheetsRef.current?.openActions(preset)}
              onSave={handleSave}
              onManage={() => void presetSheetsRef.current?.openManage()}
              testID="list-presets"
            />
          )}

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
            <Pressable
              style={styles.clearButton}
              onPress={handleClear}
              accessibilityRole="button"
              testID="filters-clear-button"
            >
              <Text style={styles.clearButtonText}>{t('common.clearAll')}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.applyButton,
                { backgroundColor: accentColor },
                !canApply && styles.applyButtonDisabled,
              ]}
              onPress={handleApply}
              disabled={!canApply}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canApply }}
              testID="filters-apply-button"
            >
              <Text style={styles.applyButtonText}>{t('common.apply')}</Text>
            </Pressable>
          </View>
        </GestureHandlerRootView>
      </TrueSheet>

      {showPresets && (
        <FilterPresetSheets
          ref={presetSheetsRef}
          presets={presets}
          activePresetId={activePreset?.id}
          hiddenCount={hiddenCount}
          currentSummary={summarize(localFilters)}
          describePreset={(preset) => summarize(preset.filters as WatchStatusFilterState)}
          validateName={(name, ignoreId) => validatePresetName(name, allPresets, ignoreId)}
          getUpdateBlocker={(preset) =>
            getListSaveBlocker(allPresets, filtersForUpdate(preset), preset.id)
          }
          hideParent={hideForPresetSheet}
          showParent={showAfterPresetSheet}
          onApply={applyPreset}
          onCreate={(name) => presetActions.createListPreset(name, localFilters)}
          onRename={presetActions.renamePreset}
          onUpdate={(preset) =>
            preset.scope === 'list' &&
            presetActions.replacePreset({ ...preset, filters: filtersForUpdate(preset) })
          }
          onDelete={presetActions.deletePreset}
        />
      )}
    </>
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
  content: {
    paddingBottom: SPACING.l,
  },
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
    backgroundColor: COLORS.surfaceLight,
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
