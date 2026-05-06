import { LoggedModal } from '@/src/components/ui/LoggedModal';
import { ModalBackground } from '@/src/components/ui/ModalBackground';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
  hexToRGBA,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import { CalendarSortMode } from '@/src/utils/calendarViewModel';
import { Check, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface CalendarSortModalProps {
  visible: boolean;
  sortMode: CalendarSortMode;
  onClose: () => void;
  onApply: (sortMode: CalendarSortMode) => void;
}

export function CalendarSortModal({
  visible,
  sortMode,
  onClose,
  onApply,
}: CalendarSortModalProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [localSortMode, setLocalSortMode] = useState<CalendarSortMode>(sortMode);

  useEffect(() => {
    if (visible) {
      setLocalSortMode(sortMode);
    }
  }, [sortMode, visible]);

  const options = useMemo(
    () => [
      { key: 'soonest' as const, label: t('calendar.soonestFirst') },
      { key: 'alphabetical' as const, label: t('calendar.alphabetical') },
      { key: 'type' as const, label: t('calendar.byType') },
    ],
    [t]
  );

  const handleApply = () => {
    onApply(localSortMode);
    onClose();
  };

  return (
    <LoggedModal
      name="calendar_sort_modal"
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={modalLayoutStyles.container}
      >
        <ModalBackground />
        <TouchableOpacity
          style={modalLayoutStyles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={modalLayoutStyles.card} testID="calendar-sort-modal">
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>{t('calendar.sortReleases')}</Text>
            <Pressable onPress={onClose} hitSlop={HIT_SLOP.m}>
              <X size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.optionsContainer}>
            {options.map((option) => {
              const isSelected = option.key === localSortMode;

              return (
                <Pressable
                  key={option.key}
                  style={[
                    styles.optionRow,
                    isSelected && {
                      borderColor: accentColor,
                      backgroundColor: hexToRGBA(accentColor, 0.12),
                    },
                  ]}
                  onPress={() => setLocalSortMode(option.key)}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      isSelected && { color: accentColor, fontWeight: '700' },
                    ]}
                  >
                    {option.label}
                  </Text>
                  {isSelected ? <Check size={20} color={accentColor} /> : null}
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: accentColor }]}
            onPress={handleApply}
          >
            <Text style={styles.primaryButtonText}>{t('common.apply')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LoggedModal>
  );
}

const styles = StyleSheet.create({
  optionsContainer: {
    gap: SPACING.s,
    marginBottom: SPACING.l,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    backgroundColor: COLORS.surfaceLight,
  },
  optionLabel: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
  },
  primaryButton: {
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.m,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
});
