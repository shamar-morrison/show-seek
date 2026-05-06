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
import {
  CALENDAR_SOURCE_FILTERS,
  CalendarSourceFilter,
} from '@/src/utils/calendarViewModel';
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

interface CalendarSourceFilterModalProps {
  visible: boolean;
  selectedSources: CalendarSourceFilter[];
  onClose: () => void;
  onApply: (sources: CalendarSourceFilter[]) => void;
}

export function CalendarSourceFilterModal({
  visible,
  selectedSources,
  onClose,
  onApply,
}: CalendarSourceFilterModalProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [localSources, setLocalSources] = useState<CalendarSourceFilter[]>(selectedSources);

  useEffect(() => {
    if (visible) {
      setLocalSources(selectedSources);
    }
  }, [selectedSources, visible]);

  const sourceOptions = useMemo(
    () => [
      { key: 'watchlist' as const, label: t('lists.shouldWatch') },
      { key: 'favorites' as const, label: t('lists.favorites') },
      { key: 'currently-watching' as const, label: t('lists.watching') },
      { key: 'reminders' as const, label: t('library.reminders') },
    ],
    [t]
  );

  const toggleSource = (source: CalendarSourceFilter) => {
    setLocalSources((current) =>
      current.includes(source) ? current.filter((value) => value !== source) : [...current, source]
    );
  };

  const handleReset = () => {
    setLocalSources([...CALENDAR_SOURCE_FILTERS]);
  };

  const handleApply = () => {
    onApply(localSources);
    onClose();
  };

  return (
    <LoggedModal
      name="calendar_source_filter_modal"
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

        <View style={modalLayoutStyles.card} testID="calendar-source-filter-modal">
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>{t('calendar.filterSources')}</Text>
            <Pressable onPress={onClose} hitSlop={HIT_SLOP.m}>
              <X size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.optionsContainer}>
            {sourceOptions.map((option) => {
              const isSelected = localSources.includes(option.key);

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
                  onPress={() => toggleSource(option.key)}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      isSelected && { color: accentColor, fontWeight: '700' },
                    ]}
                  >
                    {option.label}
                  </Text>
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && {
                        backgroundColor: accentColor,
                        borderColor: accentColor,
                      },
                    ]}
                  >
                    {isSelected ? <Check size={14} color={COLORS.white} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.actionsRow}>
            <Pressable style={styles.secondaryButton} onPress={handleReset}>
              <Text style={styles.secondaryButtonText}>{t('common.reset')}</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: accentColor }]}
              onPress={handleApply}
            >
              <Text style={styles.primaryButtonText}>{t('common.apply')}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LoggedModal>
  );
}

const styles = StyleSheet.create({
  optionsContainer: {
    gap: SPACING.s,
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
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.s,
    borderWidth: 1,
    borderColor: COLORS.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.s,
    marginTop: SPACING.l,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.m,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  primaryButton: {
    flex: 1,
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
