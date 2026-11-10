import DiscoverFilters from '@/src/components/DiscoverFilters';
import FilterPresetSheets, {
  type FilterPresetSheetsRef,
} from '@/src/components/filters/FilterPresetSheets';
import { SavedPresetsStrip } from '@/src/components/filters/SavedPresetsStrip';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useGuestAccess } from '@/src/context/GuestAccessContext';
import { useDiscoverFilterOptions } from '@/src/hooks/useDiscoverFilterOptions';
import { useFilterPresetActions } from '@/src/hooks/useFilterPresetActions';
import { useDiscoverPresets } from '@/src/hooks/useFilterPresets';
import { useAllGenres } from '@/src/hooks/useGenres';
import { describeDiscoverFilters } from '@/src/utils/filterDescriptions';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
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
import { Cancel01Icon, Film01Icon, Tv01Icon } from '@hugeicons/core-free-icons';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

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
 * Discover's filters in a bottom sheet. Picks are held as a draft and only reach the results
 * on Apply, so the list reloads once. Apply is disabled while nothing would change.
 * Saved presets sit at the top: tapping one applies it straight away and closes the sheet, and
 * their options, the full list and naming open in their own sheets while this one steps aside.
 */
const DiscoverFiltersSheet = forwardRef<DiscoverFiltersSheetRef, DiscoverFiltersSheetProps>(
  ({ filters, onApply, onApplyPreset, mediaType, genreMap }, ref) => {
    const sheetRef = useRef<TrueSheet>(null);
    const { width } = useWindowDimensions();
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();
    const { isGuest, requireAccount } = useGuestAccess();
    const [draft, setDraft] = useState<DiscoverFilterState>(filters);
    const presetSheetsRef = useRef<FilterPresetSheetsRef>(null);

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
    const saveBlocker = getDiscoverSaveBlocker(presets, mediaType, draft);

    // Guests are asked to sign in once the sheet is out of the way.
    const handleSave = () => {
      if (isGuest) {
        void sheetRef.current?.dismiss().then(() => requireAccount());
        return;
      }
      void presetSheetsRef.current?.openSave();
    };

    const applyPreset = (preset: FilterPreset) => {
      if (preset.scope !== 'discover') return;
      presetActions.recordApplied(preset);
      onApplyPreset(preset);
    };

    const handleApplyPreset = (preset: FilterPreset) => {
      applyPreset(preset);
      void sheetRef.current?.dismiss();
    };

    const canApply = !areDiscoverFiltersEqual(draft, filters);
    const canClear = !areDiscoverFiltersEqual(draft, DEFAULT_DISCOVER_FILTERS);

    const handleClear = () => {
      void Haptics.selectionAsync();
      setDraft(DEFAULT_DISCOVER_FILTERS);
    };

    const handleApply = () => {
      if (!canApply) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onApply(draft);
      void sheetRef.current?.dismiss();
    };

    return (
      <>
        <TrueSheet
          ref={sheetRef}
          detents={['auto']}
          cornerRadius={BORDER_RADIUS.l}
          backgroundColor={COLORS.surface}
          grabber={false}
        >
          <GestureHandlerRootView style={[modalSheetStyles.content, styles.content, { width }]}>
            <View style={modalHeaderStyles.header}>
              <Text style={modalHeaderStyles.title}>{t('discover.filters')}</Text>
              <Pressable
                onPress={() => sheetRef.current?.dismiss()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                testID="discover-filters-close"
              >
                <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
              </Pressable>
            </View>

            <SavedPresetsStrip
              presets={presets}
              activePresetId={activePreset?.id}
              saveBlocker={saveBlocker}
              getPresetIcon={getPresetIcon}
              onApply={handleApplyPreset}
              onLongPress={(preset) => void presetSheetsRef.current?.openActions(preset)}
              onSave={handleSave}
              onManage={() => void presetSheetsRef.current?.openManage()}
              testID="discover-presets"
            />

            <DiscoverFilters
              filters={draft}
              onChange={setDraft}
              mediaType={mediaType}
              genreMap={genreMap}
            />

            <View style={styles.actions}>
              <Pressable
                style={[styles.clearButton, !canClear && styles.disabledButton]}
                onPress={handleClear}
                disabled={!canClear}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canClear }}
                testID="discover-filters-clear"
              >
                <Text style={styles.clearButtonText}>{t('common.clearAll')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.applyButton,
                  { backgroundColor: accentColor },
                  !canApply && styles.disabledButton,
                ]}
                onPress={handleApply}
                disabled={!canApply}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canApply }}
                testID="discover-filters-apply"
              >
                <Text style={styles.applyButtonText}>{t('common.apply')}</Text>
              </Pressable>
            </View>
          </GestureHandlerRootView>
        </TrueSheet>

        <FilterPresetSheets
          ref={presetSheetsRef}
          presets={presets}
          activePresetId={activePreset?.id}
          currentSummary={summarize(draft)}
          describePreset={(preset) => summarize(preset.filters as DiscoverFilterState)}
          getPresetIcon={getPresetIcon}
          validateName={(name, ignoreId) => validatePresetName(name, presets, ignoreId)}
          getUpdateBlocker={(preset) =>
            getDiscoverSaveBlocker(presets, mediaType, draft, preset.id)
          }
          hideParent={async () => {
            await sheetRef.current?.dismiss();
          }}
          showParent={async () => {
            await sheetRef.current?.present();
          }}
          onApply={applyPreset}
          onCreate={(name) => presetActions.createDiscoverPreset(name, mediaType, draft)}
          onRename={presetActions.renamePreset}
          onUpdate={(preset) =>
            preset.scope === 'discover' &&
            presetActions.replacePreset({ ...preset, mediaType, filters: draft })
          }
          onDelete={presetActions.deletePreset}
        />
      </>
    );
  }
);

DiscoverFiltersSheet.displayName = 'DiscoverFiltersSheet';

export default DiscoverFiltersSheet;

const styles = StyleSheet.create({
  content: {
    paddingBottom: SPACING.l,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.m,
    marginTop: SPACING.l,
  },
  clearButton: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.m,
  },
  clearButtonText: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
  },
  applyButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.m,
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.m,
  },
  applyButtonText: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
  },
  disabledButton: {
    opacity: 0.5,
  },
});
