import { AppIcon } from '@/src/components/ui/AppIcon';
import { HORIZONTAL_SCROLL_PROPS } from '@/src/components/ui/horizontalScrollProps';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { SHEET_SAFE_PRESS_RETENTION } from '@/src/constants/sheetTouch';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import {
  MAX_FILTER_PRESETS_PER_SCOPE,
  type FilterPreset,
  type SavePresetBlocker,
} from '@/src/utils/filterPresets';
import { BookmarkAdd02Icon, Settings02Icon } from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export interface SavedPresetsStripProps {
  /** Presets to show, most recently used first. */
  presets: readonly FilterPreset[];
  /** The preset whose filters match the ones being edited, highlighted. */
  activePresetId?: string;
  /** Why the filters being edited can't be saved as a new preset, or null when they can. */
  saveBlocker: SavePresetBlocker | null;
  /** Presets left out because this screen can't fully apply them. */
  hiddenCount?: number;
  getPresetIcon?: (preset: FilterPreset) => IconSvgElement | undefined;
  onApply: (preset: FilterPreset) => void;
  /** Long press: options for one preset. */
  onLongPress: (preset: FilterPreset) => void;
  onSave: () => void;
  onManage: () => void;
  testID?: string;
}

/**
 * Saved filter presets at the top of a filter sheet. Tapping a preset applies it, a long press
 * opens its options, "Save" names the filters being edited and "Manage" lists every preset.
 */
export function SavedPresetsStrip({
  presets,
  activePresetId,
  saveBlocker,
  hiddenCount = 0,
  getPresetIcon,
  onApply,
  onLongPress,
  onSave,
  onManage,
  testID = 'saved-presets',
}: SavedPresetsStripProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const canSave = saveBlocker === null;
  const hasAnyPresets = presets.length > 0 || hiddenCount > 0;

  const saveChip = (
    <Pressable
      key="save"
      style={({ pressed }) => [
        styles.chip,
        styles.dashedChip,
        !canSave && styles.disabled,
        pressed && styles.pressed,
      ]}
      onPress={() => {
        void Haptics.selectionAsync();
        onSave();
      }}
      disabled={!canSave}
      accessibilityRole="button"
      accessibilityLabel={t('filterPresets.saveCurrent')}
      accessibilityState={{ disabled: !canSave }}
      testID={`${testID}-save`}
      pressRetentionOffset={SHEET_SAFE_PRESS_RETENTION}
    >
      <AppIcon icon={BookmarkAdd02Icon} size={14} color={COLORS.text} />
      <Text style={styles.chipText}>{t('common.save')}</Text>
    </Pressable>
  );

  const footnote =
    saveBlocker === 'limitReached'
      ? t('filterPresets.limitReached', { count: MAX_FILTER_PRESETS_PER_SCOPE })
      : hiddenCount > 0
        ? t('filterPresets.hiddenCount', { count: hiddenCount })
        : presets.length > 0
          ? t('filterPresets.longPressHint')
          : null;

  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.title}>{t('filterPresets.title')}</Text>

      {!hasAnyPresets ? (
        <View style={styles.emptyRow}>
          <Text style={styles.hintText}>{t('filterPresets.emptyHint')}</Text>
          {saveChip}
        </View>
      ) : (
        <ScrollView
          {...HORIZONTAL_SCROLL_PROPS}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {presets.map((preset) => {
            const isActive = preset.id === activePresetId;
            const icon = getPresetIcon?.(preset);
            return (
              <Pressable
                key={preset.id}
                style={({ pressed }) => [
                  styles.chip,
                  isActive
                    ? { backgroundColor: hexToRGBA(accentColor, 0.18), borderColor: accentColor }
                    : styles.presetChip,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onApply(preset);
                }}
                onLongPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  onLongPress(preset);
                }}
                delayLongPress={350}
                accessibilityRole="button"
                accessibilityLabel={preset.name}
                accessibilityHint={t('filterPresets.chipHint')}
                accessibilityState={{ selected: isActive }}
                accessibilityActions={[{ name: 'longpress', label: t('filterPresets.options') }]}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'longpress') onLongPress(preset);
                }}
                testID={`${testID}-chip-${preset.id}`}
                pressRetentionOffset={SHEET_SAFE_PRESS_RETENTION}
              >
                {icon ? (
                  <AppIcon
                    icon={icon}
                    size={14}
                    color={isActive ? COLORS.text : COLORS.textSecondary}
                  />
                ) : null}
                <Text style={styles.chipText} numberOfLines={1}>
                  {preset.name}
                </Text>
              </Pressable>
            );
          })}
          {saveChip}
          <Pressable
            style={({ pressed }) => [styles.chip, styles.dashedChip, pressed && styles.pressed]}
            onPress={() => {
              void Haptics.selectionAsync();
              onManage();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('filterPresets.manage')}
            testID={`${testID}-manage`}
            pressRetentionOffset={SHEET_SAFE_PRESS_RETENTION}
          >
            <AppIcon icon={Settings02Icon} size={14} color={COLORS.textSecondary} />
            <Text style={[styles.chipText, styles.secondaryText]}>{t('filterPresets.manage')}</Text>
          </Pressable>
        </ScrollView>
      )}

      {footnote ? (
        <Text style={styles.footnote} testID={`${testID}-footnote`}>
          {footnote}
        </Text>
      ) : null}
      <View style={styles.separator} testID={`${testID}-separator`} />
    </View>
  );
}

const CHIP_HEIGHT = 34;

const styles = StyleSheet.create({
  container: {
    gap: SPACING.xs,
    marginBottom: SPACING.m,
  },
  title: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.s,
  },
  chipRow: {
    alignItems: 'center',
    gap: SPACING.s,
  },
  chip: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: CHIP_HEIGHT,
    paddingHorizontal: SPACING.m,
  },
  presetChip: {
    backgroundColor: COLORS.surfaceLight,
    borderColor: COLORS.surfaceLight,
  },
  dashedChip: {
    backgroundColor: 'transparent',
    borderColor: COLORS.surfaceLight,
    borderStyle: 'dashed',
  },
  chipText: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.s,
    maxWidth: 200,
  },
  secondaryText: {
    color: COLORS.textSecondary,
  },
  emptyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.m,
    minHeight: CHIP_HEIGHT,
  },
  hintText: {
    color: COLORS.textSecondary,
    flex: 1,
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.s,
  },
  footnote: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.xs,
  },
  // Sets the presets apart from the filter fields below.
  separator: {
    backgroundColor: COLORS.surfaceLight,
    height: StyleSheet.hairlineWidth,
    marginTop: SPACING.s,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.7,
  },
});
