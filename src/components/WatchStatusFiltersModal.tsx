import FilterSheet, { type FilterSheetRef } from '@/src/components/filters/FilterSheet';
import ListFilters from '@/src/components/library/ListFilters';
import { COLORS, FONT_SIZE } from '@/src/constants/theme';
import { useFilterPresetActions } from '@/src/hooks/useFilterPresetActions';
import { useListPresets } from '@/src/hooks/useFilterPresets';
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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

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
 * The library list filters, in the shared filter sheet, shown while `visible` is true. Picks
 * are held until Apply; saved list presets sit at the top.
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
  const sheetRef = useRef<FilterSheetRef>(null);
  const [localFilters, setLocalFilters] = useState<WatchStatusFilterState>(filters);

  // Start from the filters in use each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setLocalFilters(filters);
    }
  }, [visible, filters]);

  useEffect(() => {
    if (visible) {
      void sheetRef.current?.present();
    } else {
      // Usually already closed by the time the screen hides it (X, swipe, Apply).
      void sheetRef.current?.dismiss();
    }
  }, [visible]);

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

  const matchCount = useMemo(
    () => (visible && getMatchCount ? getMatchCount(localFilters) : null),
    [getMatchCount, localFilters, visible]
  );

  return (
    <FilterSheet
      ref={sheetRef}
      title={t('library.filterLists')}
      canApply={!areWatchStatusFiltersEqual(localFilters, filters)}
      canClear={!areWatchStatusFiltersEqual(localFilters, DEFAULT_WATCH_STATUS_FILTERS)}
      onApply={() => onApplyFilters(localFilters)}
      onClear={() => setLocalFilters(DEFAULT_WATCH_STATUS_FILTERS)}
      onClosed={onClose}
      testIDs={{
        close: 'filters-close',
        clear: 'filters-clear-button',
        apply: 'filters-apply-button',
      }}
      footer={
        matchCount !== null && (
          <Text
            style={[styles.matchCount, matchCount === 0 && styles.matchCountEmpty]}
            accessibilityLiveRegion="polite"
            testID="filters-match-count"
          >
            {matchCount === 0
              ? t('filters.noMatches')
              : t('filters.matchCount', { count: matchCount })}
          </Text>
        )
      }
      presets={
        showPresets
          ? {
              presets,
              activePresetId: activePreset?.id,
              saveBlocker: getListSaveBlocker(allPresets, localFilters),
              hiddenCount,
              currentSummary: summarize(localFilters),
              describePreset: (preset) => summarize(preset.filters as WatchStatusFilterState),
              validateName: (name, ignoreId) => validatePresetName(name, allPresets, ignoreId),
              getUpdateBlocker: (preset) =>
                getListSaveBlocker(allPresets, filtersForUpdate(preset), preset.id),
              onApply: (preset) => {
                if (preset.scope !== 'list') return;
                presetActions.recordApplied(preset);
                onApplyFilters(adaptListFiltersForScreen(preset.filters, presetCaps));
              },
              onCreate: (name) => presetActions.createListPreset(name, localFilters),
              onRename: presetActions.renamePreset,
              onUpdate: (preset) => {
                if (preset.scope !== 'list') return;
                presetActions.replacePreset({ ...preset, filters: filtersForUpdate(preset) });
              },
              onDelete: presetActions.deletePreset,
              testID: 'list-presets',
            }
          : undefined
      }
    >
      <ListFilters
        filters={localFilters}
        onChange={setLocalFilters}
        genreMap={genreMap}
        showMediaTypeFilter={showMediaTypeFilter}
        showListFilters={showListFilters}
      />
    </FilterSheet>
  );
}

const styles = StyleSheet.create({
  matchCount: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    textAlign: 'center',
  },
  matchCountEmpty: {
    color: COLORS.warning,
  },
});
