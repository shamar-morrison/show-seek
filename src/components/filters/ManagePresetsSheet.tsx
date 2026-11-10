import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { modalHeaderStyles, modalSheetStyles } from '@/src/styles/modalStyles';
import type { FilterPreset } from '@/src/utils/filterPresets';
import {
  Bookmark02Icon,
  Cancel01Icon,
  Delete02Icon,
  PencilEdit01Icon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView, Pressable } from 'react-native-gesture-handler';

export interface ManagePresetsSheetRef {
  present: () => Promise<void>;
  dismiss: () => Promise<void>;
}

interface ManagePresetsSheetProps {
  presets: readonly FilterPreset[];
  /** The preset whose filters match the ones being edited, highlighted. */
  activePresetId?: string;
  /** Presets left out because this screen can't fully apply them. */
  hiddenCount?: number;
  describePreset: (preset: FilterPreset) => string;
  getPresetIcon?: (preset: FilterPreset) => IconSvgElement | undefined;
  onApply: (preset: FilterPreset) => void;
  onRename: (preset: FilterPreset) => void;
  onDelete: (preset: FilterPreset) => void;
  onDidDismiss?: () => void;
}

/**
 * Every saved preset with what it filters by. Tapping a row applies it; each row can also be
 * renamed or deleted.
 */
const ManagePresetsSheet = forwardRef<ManagePresetsSheetRef, ManagePresetsSheetProps>(
  (
    {
      presets,
      activePresetId,
      hiddenCount = 0,
      describePreset,
      getPresetIcon,
      onApply,
      onRename,
      onDelete,
      onDidDismiss,
    },
    ref
  ) => {
    const sheetRef = useRef<TrueSheet>(null);
    const { width, height } = useWindowDimensions();
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();

    useImperativeHandle(ref, () => ({
      present: async () => {
        await sheetRef.current?.present();
      },
      dismiss: async () => {
        await sheetRef.current?.dismiss();
      },
    }));

    return (
      <TrueSheet
        ref={sheetRef}
        detents={['auto']}
        cornerRadius={BORDER_RADIUS.l}
        backgroundColor={COLORS.surface}
        grabber={false}
        onDidDismiss={onDidDismiss}
      >
        <GestureHandlerRootView style={[modalSheetStyles.content, { width }]}>
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>{t('filterPresets.manageTitle')}</Text>
            <Pressable
              onPress={() => sheetRef.current?.dismiss()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              testID="manage-presets-close"
            >
              <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
            </Pressable>
          </View>

          {presets.length === 0 ? (
            <Text style={styles.empty} testID="manage-presets-empty">
              {t('filterPresets.manageEmpty')}
            </Text>
          ) : (
            <ScrollView
              style={{ maxHeight: height * 0.6 }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {presets.map((preset, index) => {
                const isActive = preset.id === activePresetId;
                const summary = describePreset(preset);
                return (
                  <View
                    key={preset.id}
                    style={[styles.row, index < presets.length - 1 && styles.rowBorder]}
                  >
                    <Pressable
                      style={styles.rowBody}
                      onPress={() => onApply(preset)}
                      accessibilityRole="button"
                      accessibilityLabel={summary ? `${preset.name}, ${summary}` : preset.name}
                      accessibilityHint={t('filterPresets.applyHint')}
                      accessibilityState={{ selected: isActive }}
                      testID={`manage-presets-row-${preset.id}`}
                    >
                      <View
                        style={[
                          styles.iconWrap,
                          isActive && { backgroundColor: hexToRGBA(accentColor, 0.2) },
                        ]}
                      >
                        <AppIcon
                          icon={getPresetIcon?.(preset) ?? Bookmark02Icon}
                          size={18}
                          color={isActive ? accentColor : COLORS.textSecondary}
                        />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={styles.name} numberOfLines={1}>
                          {preset.name}
                        </Text>
                        {summary ? (
                          <Text style={styles.summary} numberOfLines={2}>
                            {summary}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                    <Pressable
                      style={styles.iconButton}
                      onPress={() => onRename(preset)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={t('filterPresets.renameNamed', { name: preset.name })}
                      testID={`manage-presets-rename-${preset.id}`}
                    >
                      <AppIcon icon={PencilEdit01Icon} size={20} color={COLORS.textSecondary} />
                    </Pressable>
                    <Pressable
                      style={styles.iconButton}
                      onPress={() => onDelete(preset)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={t('filterPresets.deleteNamed', { name: preset.name })}
                      testID={`manage-presets-delete-${preset.id}`}
                    >
                      <AppIcon icon={Delete02Icon} size={20} color={COLORS.error} />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {hiddenCount > 0 ? (
            <Text style={styles.footnote} testID="manage-presets-hidden">
              {t('filterPresets.hiddenCount', { count: hiddenCount })}
            </Text>
          ) : null}
        </GestureHandlerRootView>
      </TrueSheet>
    );
  }
);

ManagePresetsSheet.displayName = 'ManagePresetsSheet';

export default ManagePresetsSheet;

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.xs,
    minHeight: 60,
  },
  rowBorder: {
    borderBottomColor: COLORS.surfaceLight,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: SPACING.m,
    paddingVertical: SPACING.s,
  },
  iconWrap: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.round,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
  },
  summary: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.s,
  },
  iconButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  empty: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.m,
    paddingVertical: SPACING.l,
    textAlign: 'center',
  },
  footnote: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.xs,
    marginTop: SPACING.m,
  },
});
