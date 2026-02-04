import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { ReminderTiming } from '@/src/types/reminder';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface TimingOption {
  value: ReminderTiming;
  labelKey: string;
  descriptionKey: string;
  labelParams?: Record<string, unknown>;
  descriptionParams?: Record<string, unknown>;
}

interface ReminderTimingOptionsProps {
  options: TimingOption[];
  selectedValue: ReminderTiming;
  disabledValues: Set<ReminderTiming>;
  onSelect: (value: ReminderTiming) => void;
  disabled?: boolean;
  /** Custom text shown when option is disabled. Defaults to `reminder.notificationTimePassed` */
  disabledDescriptionKey?: string;
}

export function ReminderTimingOptions({
  options,
  selectedValue,
  disabledValues,
  onSelect,
  disabled = false,
  disabledDescriptionKey = 'reminder.notificationTimePassed',
}: ReminderTimingOptionsProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const disabledDescription = t(disabledDescriptionKey);

  return (
    <>
      {options.map((option) => {
        const isOptionDisabled = disabledValues.has(option.value);
        return (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.timingOption,
              selectedValue === option.value && [styles.timingOptionSelected, { borderColor: accentColor }],
              isOptionDisabled && styles.timingOptionDisabled,
            ]}
            onPress={() => !isOptionDisabled && onSelect(option.value)}
            disabled={disabled || isOptionDisabled}
            activeOpacity={ACTIVE_OPACITY}
          >
            <View style={[styles.radioOuter, isOptionDisabled && styles.radioOuterDisabled]}>
              {selectedValue === option.value && !isOptionDisabled && (
                <View style={[styles.radioInner, { backgroundColor: accentColor }]} />
              )}
            </View>
            <View style={styles.timingTextContainer}>
              <Text style={[styles.timingLabel, isOptionDisabled && styles.textDisabled]}>
                {t(option.labelKey, option.labelParams)}
              </Text>
              <Text style={[styles.timingDescription, isOptionDisabled && styles.textDisabled]}>
                {isOptionDisabled
                  ? disabledDescription
                  : t(option.descriptionKey, option.descriptionParams)}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  timingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.m,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.s,
    gap: SPACING.m,
  },
  timingOptionSelected: {
    borderWidth: 1,
  },
  timingOptionDisabled: {
    opacity: 0.5,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.text,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterDisabled: {
    borderColor: COLORS.textSecondary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timingTextContainer: {
    flex: 1,
  },
  timingLabel: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '500',
  },
  timingDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  textDisabled: {
    color: COLORS.textSecondary,
  },
});
