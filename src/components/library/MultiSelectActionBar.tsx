import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { Check, X } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface MultiSelectActionBarProps {
  selectedCount: number;
  onAddToList: () => void;
  onCancel: () => void;
}

export function MultiSelectActionBar({
  selectedCount,
  onAddToList,
  onCancel,
}: MultiSelectActionBarProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, SPACING.s) }]}>
      <View style={styles.content}>
        <Text style={styles.countLabel}>
          {t('library.selectedItemsCount', { count: selectedCount })}
        </Text>

        <View style={styles.buttonsRow}>
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <X size={18} color={COLORS.textSecondary} />
            <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
          </Pressable>

          <Pressable
            style={[
              styles.addButton,
              { backgroundColor: accentColor },
              selectedCount === 0 && styles.addButtonDisabled,
            ]}
            onPress={onAddToList}
            disabled={selectedCount === 0}
          >
            <Check size={18} color={COLORS.white} />
            <Text style={styles.addButtonText}>{t('media.addToList')}</Text>
          </Pressable>
        </View>
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
    fontWeight: '600',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: SPACING.s,
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
    fontWeight: '600',
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
    fontWeight: '600',
  },
});
