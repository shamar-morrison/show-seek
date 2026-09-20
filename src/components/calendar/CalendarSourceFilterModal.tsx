import { ModalBackground } from '@/src/components/ui/ModalBackground';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import {
  CALENDAR_SOURCE_FILTERS,
  CalendarSourceFilter,
  MAX_CALENDAR_SOURCE_SELECTIONS,
  REMINDERS_SOURCE_FILTER,
} from '@/src/utils/calendarViewModel';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { MODAL_LIST_HEIGHT_LG } from '@/src/constants/modalLayout';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
  customSources?: Array<{ id: string; name: string }>;
  onClose: () => void;
  onApply: (sources: CalendarSourceFilter[]) => void;
}

export function CalendarSourceFilterModal({
  visible,
  selectedSources,
  customSources = [],
  onClose,
  onApply,
}: CalendarSourceFilterModalProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const toastRef = useRef<ToastRef>(null);
  const [localSources, setLocalSources] = useState<CalendarSourceFilter[]>(selectedSources);

  useEffect(() => {
    if (visible) {
      setLocalSources(selectedSources);
    }
  }, [selectedSources, visible]);

  const sourceOptions = useMemo(
    () => [
      { key: 'watchlist', label: t('lists.shouldWatch') },
      { key: 'favorites', label: t('lists.favorites') },
      { key: 'currently-watching', label: t('lists.watching') },
      { key: REMINDERS_SOURCE_FILTER, label: t('library.reminders') },
      ...customSources.map((list) => ({ key: list.id, label: list.name })),
    ],
    [customSources, t]
  );

  const selectedListCount = localSources.filter(
    (source) => source !== REMINDERS_SOURCE_FILTER
  ).length;
  const isListCapped = selectedListCount >= MAX_CALENDAR_SOURCE_SELECTIONS;

  const toggleSource = (source: CalendarSourceFilter) => {
    const isSelected = localSources.includes(source);

    if (!isSelected && source !== REMINDERS_SOURCE_FILTER && isListCapped) {
      toastRef.current?.show(t('calendar.maxSources'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setLocalSources((current) =>
      isSelected ? current.filter((value) => value !== source) : [...current, source]
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={modalLayoutStyles.container}
      >
        <ModalBackground />
        <TouchableOpacity style={modalLayoutStyles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={modalLayoutStyles.card} testID="calendar-source-filter-modal">
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>{t('calendar.filterSources')}</Text>
            <Pressable onPress={onClose} hitSlop={HIT_SLOP.m}>
              <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <FlatList
            data={sourceOptions}
            keyExtractor={(option) => option.key}
            extraData={localSources}
            style={styles.optionsList}
            contentContainerStyle={styles.optionsListContent}
            showsVerticalScrollIndicator
            renderItem={({ item: option }) => {
              const isSelected = localSources.includes(option.key);
              const isDisabled =
                !isSelected &&
                option.key !== REMINDERS_SOURCE_FILTER &&
                isListCapped;

              return (
                <Pressable
                  style={[
                    styles.optionRow,
                    isSelected && {
                      borderColor: accentColor,
                      backgroundColor: hexToRGBA(accentColor, 0.12),
                    },
                    isDisabled && styles.disabledOptionRow,
                  ]}
                  onPress={() => toggleSource(option.key)}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      isSelected && { color: accentColor, fontFamily: FONT_FAMILY.bold },
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
                    {isSelected ? (
                      <AppIcon icon={Tick02Icon} size={14} color={COLORS.white} />
                    ) : null}
                  </View>
                </Pressable>
              );
            }}
          />

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
          <Toast ref={toastRef} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  optionsList: {
    maxHeight: MODAL_LIST_HEIGHT_LG,
  },
  optionsListContent: {
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
  disabledOptionRow: {
    opacity: 0.4,
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
    fontFamily: FONT_FAMILY.semiBold,
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
    fontFamily: FONT_FAMILY.bold,
  },
});
