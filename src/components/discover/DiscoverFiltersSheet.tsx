import DiscoverFilters from '@/src/components/DiscoverFilters';
import FilterSheet, { type FilterSheetRef } from '@/src/components/filters/FilterSheet';
import { useDiscoverFilterOptions } from '@/src/hooks/useDiscoverFilterOptions';
import { useFilterPresetActions } from '@/src/hooks/useFilterPresetActions';
import { useDiscoverPresets } from '@/src/hooks/useFilterPresets';
import { useAllGenres } from '@/src/hooks/useGenres';
import { describeDiscoverFilters } from '@/src/utils/filterDescriptions';
import {
  areDiscoverFiltersEqual,
  DEFAULT_DISCOVER_FILTERS,
  type DiscoverFilterState,
} from '@/src/utils/discoverFilters';
import {
  findMatchingDiscoverPreset,
  getDiscoverSaveBlocker,
  joinPresetSummary,
  validatePresetName,
  type DiscoverFilterPreset,
  type FilterPreset,
} from '@/src/utils/filterPresets';
import { Film01Icon, Tv01Icon } from '@hugeicons/core-free-icons';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

export interface DiscoverFiltersSheetRef {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

interface DiscoverFiltersSheetProps {
  /** The filters in use; the sheet starts from these each time it opens. */
  filters: DiscoverFilterState;
  onApply: (filters: DiscoverFilterState) => void;
  /** Applies a saved preset, switching to its tab. */
  onApplyPreset: (preset: DiscoverFilterPreset) => void;
  mediaType: 'movie' | 'tv';
  genreMap: Record<number, string>;
}

const getPresetIcon = (preset: FilterPreset) =>
  preset.scope === 'discover' && preset.mediaType === 'tv' ? Tv01Icon : Film01Icon;

/**
 * One-line summaries of Discover filters for either tab, e.g. "Horror · 7+ stars · Netflix".
 * Names come from both tabs, since a preset can belong to the tab not on screen.
 */
function useDiscoverSummary() {
  const { t } = useTranslation();
  const { data: genreMap } = useAllGenres();
  const movieOptions = useDiscoverFilterOptions('movie');
  const tvOptions = useDiscoverFilterOptions('tv');
  const names = useMemo(
    () => ({
      genreMap: genreMap ?? {},
      languageNames: movieOptions.languageNames,
      providerNames: { ...tvOptions.providerNames, ...movieOptions.providerNames },
    }),
    [genreMap, movieOptions.languageNames, movieOptions.providerNames, tvOptions.providerNames]
  );
  return useCallback(
    (filters: DiscoverFilterState) =>
      joinPresetSummary(describeDiscoverFilters(filters, t, names).map((chip) => chip.value)),
    [names, t]
  );
}

/**
 * Discover's filters, in the shared filter sheet. Picks are held as a draft and only reach the
 * results on Apply, so the list reloads once. Saved Discover presets sit at the top; applying
 * one switches to its tab.
 */
const DiscoverFiltersSheet = forwardRef<DiscoverFiltersSheetRef, DiscoverFiltersSheetProps>(
  ({ filters, onApply, onApplyPreset, mediaType, genreMap }, ref) => {
    const sheetRef = useRef<FilterSheetRef>(null);
    const { t } = useTranslation();
    const [draft, setDraft] = useState<DiscoverFilterState>(filters);

    const presets = useDiscoverPresets();
    const presetActions = useFilterPresetActions('discover');
    const summarize = useDiscoverSummary();

    useImperativeHandle(ref, () => ({
      present: async () => {
        setDraft(filters);
        await sheetRef.current?.present();
      },
      dismiss: async () => {
        await sheetRef.current?.dismiss();
      },
    }));

    const activePreset = findMatchingDiscoverPreset(presets, mediaType, draft);

    return (
      <FilterSheet
        ref={sheetRef}
        title={t('discover.filters')}
        canApply={!areDiscoverFiltersEqual(draft, filters)}
        canClear={!areDiscoverFiltersEqual(draft, DEFAULT_DISCOVER_FILTERS)}
        onApply={() => onApply(draft)}
        onClear={() => setDraft(DEFAULT_DISCOVER_FILTERS)}
        testIDs={{
          close: 'discover-filters-close',
          clear: 'discover-filters-clear',
          apply: 'discover-filters-apply',
        }}
        presets={{
          presets,
          activePresetId: activePreset?.id,
          saveBlocker: getDiscoverSaveBlocker(presets, mediaType, draft),
          getPresetIcon,
          currentSummary: summarize(draft),
          describePreset: (preset) => summarize(preset.filters as DiscoverFilterState),
          validateName: (name, ignoreId) => validatePresetName(name, presets, ignoreId),
          getUpdateBlocker: (preset) =>
            getDiscoverSaveBlocker(presets, mediaType, draft, preset.id),
          onApply: (preset) => {
            if (preset.scope !== 'discover') return;
            presetActions.recordApplied(preset);
            onApplyPreset(preset);
          },
          onCreate: (name) => presetActions.createDiscoverPreset(name, mediaType, draft),
          onRename: presetActions.renamePreset,
          onUpdate: (preset) => {
            if (preset.scope !== 'discover') return;
            presetActions.replacePreset({ ...preset, mediaType, filters: draft });
          },
          onDelete: presetActions.deletePreset,
          testID: 'discover-presets',
        }}
      >
        <DiscoverFilters
          filters={draft}
          onChange={setDraft}
          mediaType={mediaType}
          genreMap={genreMap}
        />
      </FilterSheet>
    );
  }
);

DiscoverFiltersSheet.displayName = 'DiscoverFiltersSheet';

export default DiscoverFiltersSheet;
