import { BORDER_RADIUS, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Cancel01Icon, Delete02Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const DEFAULT_MULTI_SELECT_ACTION_BAR_HEIGHT = 176;

interface MultiSelectActionBarProps {
  selectedCount: number;
  onAddToList?: () => void;
  onCancel: () => void;
  onRemoveItems: () => void;
  bulkPrimaryLabel?: string;
  removeLabel?: string;
  onHeightChange?: (height: number) => void;
}

export function MultiSelectActionBar({
  selectedCount,
  onAddToList,
  onCancel,
  onRemoveItems,
  bulkPrimaryLabel,
  removeLabel,
  onHeightChange,
}: MultiSelectActionBarProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const insets = useSafeAreaInsets();
  const showPrimaryAction = !!onAddToList && !!bulkPrimaryLabel;
  const handleLayout = (event: LayoutChangeEvent) => {
    onHeightChange?.(event.nativeEvent.layout.height);
  };

  return (
    <View
      style={[styles.container, { paddingBottom: Math.max(insets.bottom, SPACING.s) }]}
      onLayout={handleLayout}
      testID="multi-select-action-bar"
    >
      <View style={styles.content}>
        <Text style={styles.countLabel}>
          {t('library.selectedItemsCount', { count: selectedCount })}
        </Text>

        <View
          style={[styles.buttonsRow, !showPrimaryAction && styles.singleButtonRow]}
          testID="multi-select-top-row"
        >
          <Pressable
            style={styles.cancelButton}
            onPress={onCancel}
            testID="multi-select-cancel-button"
          >
            <AppIcon icon={Cancel01Icon} size={18} color={COLORS.textSecondary} />
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </Pressable>

          {showPrimaryAction && (
            <Pressable
              style={[
                styles.addButton,
                { backgroundColor: accentColor },
                selectedCount === 0 && styles.addButtonDisabled,
              ]}
              onPress={onAddToList}
              disabled={selectedCount === 0}
              testID="multi-select-primary-button"
            >
              <AppIcon icon={Tick02Icon} size={18} color={COLORS.white} />
              <Text style={styles.addButtonText}>{bulkPrimaryLabel}</Text>
            </Pressable>
          )}
        </View>

        <Pressable
          style={[styles.removeButton, selectedCount === 0 && styles.removeButtonDisabled]}
          onPress={onRemoveItems}
          disabled={selectedCount === 0}
          testID="multi-select-remove-button"
        >
          <AppIcon icon={Delete02Icon} size={18} color={COLORS.error} />
          <Text style={styles.removeButtonText}>{removeLabel ?? t('library.removeItems')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.s,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceLight,
  },
  content: {
    gap: SPACING.s,
  },
  countLabel: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: SPACING.s,
  },
  singleButtonRow: {
    flexDirection: 'column',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.s,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    flex: 1,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.semiBold,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    flex: 1,
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.semiBold,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: BORDER_RADIUS.m,
    paddingVertical: SPACING.s,
    backgroundColor: COLORS.surface,
  },
  removeButtonDisabled: {
    opacity: 0.5,
  },
  removeButtonText: {
    color: COLORS.error,
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.bold,
  },
});
