import FilterPresetSheets, {
  type FilterPresetSheetsRef,
} from '@/src/components/filters/FilterPresetSheets';
import { SavedPresetsStrip } from '@/src/components/filters/SavedPresetsStrip';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useGuestAccess } from '@/src/context/GuestAccessContext';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
import type { FilterPreset, PresetNameError, SavePresetBlocker } from '@/src/utils/filterPresets';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import * as Haptics from 'expo-haptics';
import React, { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

export interface FilterSheetRef {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

/** Saved presets for a filter sheet: the Saved row plus the sheets for options, Manage and naming. */
export interface FilterSheetPresets {
  presets: readonly FilterPreset[];
  activePresetId?: string;
  saveBlocker: SavePresetBlocker | null;
  /** Presets left out because this screen can't fully apply them. */
  hiddenCount?: number;
  getPresetIcon?: (preset: FilterPreset) => IconSvgElement | undefined;
  /** One-line summary of the filters being edited, shown when saving. */
  currentSummary: string;
  describePreset: (preset: FilterPreset) => string;
  validateName: (name: string, ignoreId?: string) => PresetNameError | null;
  getUpdateBlocker: (preset: FilterPreset) => SavePresetBlocker | null;
  /** Applies a preset. The sheet closes itself afterwards. */
  onApply: (preset: FilterPreset) => void;
  onCreate: (name: string) => void;
  onRename: (preset: FilterPreset, name: string) => void;
  onUpdate: (preset: FilterPreset) => void;
  onDelete: (preset: FilterPreset) => void;
  testID: string;
}

interface FilterSheetProps {
  title: string;
  /** The filter fields. */
  children: React.ReactNode;
  /** Shown just above Clear all / Apply, e.g. a live match count. */
  footer?: React.ReactNode;
  canApply: boolean;
  canClear: boolean;
  /** Applies the picks. The sheet closes itself afterwards. */
  onApply: () => void;
  onClear: () => void;
  /** Called when the person closes the sheet (not when it steps aside for a preset sheet). */
  onClosed?: () => void;
  /** Omit to hide saved presets. */
  presets?: FilterSheetPresets;
  testIDs: { close: string; clear: string; apply: string };
}

/**
 * The bottom sheet shared by the Discover and library list filters: header, Saved row, the
 * fields, then Clear all / Apply. Preset options, Manage and naming open in their own sheets
 * while this one steps aside, then it comes back with the unapplied picks intact.
 */
const FilterSheet = forwardRef<FilterSheetRef, FilterSheetProps>(
  (
    { title, children, footer, canApply, canClear, onApply, onClear, onClosed, presets, testIDs },
    ref
  ) => {
    const sheetRef = useRef<TrueSheet>(null);
    const presetSheetsRef = useRef<FilterPresetSheetsRef>(null);
    const { width } = useWindowDimensions();
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();
    const { isGuest, requireAccount } = useGuestAccess();
    // Whether the sheet is open (or opening). On Android, dismissing a sheet that isn't open
    // leaves TrueSheet stuck "dismissing", so its X and swipe no longer close it next time.
    const isOpenRef = useRef(false);
    // True while the sheet is hidden for a preset sheet, so that isn't reported as closing.
    const steppedAsideRef = useRef(false);

    const open = useCallback(async () => {
      isOpenRef.current = true;
      await sheetRef.current?.present();
    }, []);

    const close = useCallback(async () => {
      if (!isOpenRef.current) return;
      isOpenRef.current = false;
      await sheetRef.current?.dismiss();
    }, []);

    useImperativeHandle(ref, () => ({
      present: async () => {
        steppedAsideRef.current = false;
        await open();
      },
      dismiss: close,
    }));

    const handleDidDismiss = () => {
      isOpenRef.current = false;
      if (!steppedAsideRef.current) onClosed?.();
    };

    const handleApply = () => {
      if (!canApply) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onApply();
      void close();
    };

    const handleClear = () => {
      if (!canClear) return;
      void Haptics.selectionAsync();
      onClear();
    };

    const applyPresetFromRow = (preset: FilterPreset) => {
      presets?.onApply(preset);
      void close();
    };

    // Guests are asked to sign in once the sheet is out of the way.
    const handleSave = () => {
      if (isGuest) {
        void close().then(() => requireAccount());
        return;
      }
      void presetSheetsRef.current?.openSave();
    };

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
              <Text style={modalHeaderStyles.title}>{title}</Text>
              <Pressable
                onPress={() => void close()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                testID={testIDs.close}
              >
                <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
              </Pressable>
            </View>

            {presets && (
              <SavedPresetsStrip
                presets={presets.presets}
                activePresetId={presets.activePresetId}
                saveBlocker={presets.saveBlocker}
                hiddenCount={presets.hiddenCount}
                getPresetIcon={presets.getPresetIcon}
                onApply={applyPresetFromRow}
                onLongPress={(preset) => void presetSheetsRef.current?.openActions(preset)}
                onSave={handleSave}
                onManage={() => void presetSheetsRef.current?.openManage()}
                testID={presets.testID}
              />
            )}

            {children}

            <View style={styles.bottom}>
              {footer}
              <View style={styles.actions}>
                <Pressable
                  style={[styles.clearButton, !canClear && styles.disabledButton]}
                  onPress={handleClear}
                  disabled={!canClear}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canClear }}
                  testID={testIDs.clear}
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
                  testID={testIDs.apply}
                >
                  <Text style={styles.applyButtonText}>{t('common.apply')}</Text>
                </Pressable>
              </View>
            </View>
          </GestureHandlerRootView>
        </TrueSheet>

        {presets && (
          <FilterPresetSheets
            ref={presetSheetsRef}
            presets={presets.presets}
            activePresetId={presets.activePresetId}
            hiddenCount={presets.hiddenCount}
            currentSummary={presets.currentSummary}
            describePreset={presets.describePreset}
            getPresetIcon={presets.getPresetIcon}
            validateName={presets.validateName}
            getUpdateBlocker={presets.getUpdateBlocker}
            hideParent={async () => {
              steppedAsideRef.current = true;
              await close();
            }}
            showParent={async () => {
              steppedAsideRef.current = false;
              await open();
            }}
            onApply={(preset) => {
              // Picked from Manage: this sheet is already hidden and stays closed.
              steppedAsideRef.current = false;
              presets.onApply(preset);
            }}
            onCreate={presets.onCreate}
            onRename={presets.onRename}
            onUpdate={presets.onUpdate}
            onDelete={presets.onDelete}
          />
        )}
      </>
    );
  }
);

FilterSheet.displayName = 'FilterSheet';

export default FilterSheet;

const styles = StyleSheet.create({
  content: {
    paddingBottom: SPACING.l,
  },
  bottom: {
    gap: SPACING.m,
    marginTop: SPACING.l,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.m,
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
