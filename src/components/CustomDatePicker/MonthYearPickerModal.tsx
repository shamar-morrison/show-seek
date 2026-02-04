/**
 * Bottom sheet modal for quick month and year selection.
 */

import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import { X } from 'lucide-react-native';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { MonthYearPickerProps } from './types';
import { getMonthName } from './utils';

const MONTHS = Array.from({ length: 12 }, (_, i) => i);

export function MonthYearPickerModal({
  visible,
  selectedMonth,
  selectedYear,
  minDate,
  maxDate,
  onSelect,
  onClose,
}: MonthYearPickerProps) {
  const { t } = useTranslation();
  const [tempMonth, setTempMonth] = useState(selectedMonth);
  const [tempYear, setTempYear] = useState(selectedYear);
  const yearScrollRef = useRef<ScrollView>(null);

  // Reset temp values when modal opens
  React.useEffect(() => {
    if (visible) {
      setTempMonth(selectedMonth);
      setTempYear(selectedYear);
    }
  }, [visible, selectedMonth, selectedYear]);

  const minYear = minDate.getFullYear();
  const maxYear = maxDate.getFullYear();
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);

  // Check if a month is disabled based on min/max date constraints
  const isMonthDisabled = (month: number): boolean => {
    if (tempYear === minYear && month < minDate.getMonth()) return true;
    if (tempYear === maxYear && month > maxDate.getMonth()) return true;
    return false;
  };

  const handleConfirm = () => {
    // Validate and adjust month if needed
    let finalMonth = tempMonth;
    if (tempYear === minYear && tempMonth < minDate.getMonth()) {
      finalMonth = minDate.getMonth();
    } else if (tempYear === maxYear && tempMonth > maxDate.getMonth()) {
      finalMonth = maxDate.getMonth();
    }
    onSelect(finalMonth, tempYear);
    onClose();
  };

  const handleYearSelect = (year: number) => {
    setTempYear(year);
    // Auto-adjust month if it becomes invalid
    if (year === minYear && tempMonth < minDate.getMonth()) {
      setTempMonth(minDate.getMonth());
    } else if (year === maxYear && tempMonth > maxDate.getMonth()) {
      setTempMonth(maxDate.getMonth());
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalLayoutStyles.container}>
        <ModalBackground />
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.content}>
          {/* Header */}
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>{t('datePicker.selectMonthYear')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Picker Columns */}
          <View style={styles.pickerContainer}>
            {/* Months Column */}
            <View style={styles.column}>
              <Text style={styles.columnHeader}>{t('datePicker.month')}</Text>
              <ScrollView
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {MONTHS.map((month) => {
                  const disabled = isMonthDisabled(month);
                  const isSelected = month === tempMonth;
                  return (
                    <Pressable
                      key={month}
                      style={[
                        styles.item,
                        isSelected && styles.itemSelected,
                        disabled && styles.itemDisabled,
                      ]}
                      onPress={() => !disabled && setTempMonth(month)}
                      disabled={disabled}
                    >
                      <Text
                        style={[
                          styles.itemText,
                          isSelected && styles.itemTextSelected,
                          disabled && styles.itemTextDisabled,
                        ]}
                      >
                        {getMonthName(month)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Years Column */}
            <View style={styles.column}>
              <Text style={styles.columnHeader}>{t('datePicker.year')}</Text>
              <ScrollView
                ref={yearScrollRef}
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {years.map((year) => {
                  const isSelected = year === tempYear;
                  return (
                    <Pressable
                      key={year}
                      style={[styles.item, isSelected && styles.itemSelected]}
                      onPress={() => handleYearSelect(year)}
                    >
                      <Text style={[styles.itemText, isSelected && styles.itemTextSelected]}>
                        {year}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={onClose}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.confirmButton]}
              onPress={handleConfirm}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={styles.confirmButtonText}>{t('common.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  closeButton: {
    padding: SPACING.xs,
  },
  pickerContainer: {
    flexDirection: 'row',
    gap: SPACING.m,
    marginBottom: SPACING.l,
  },
  column: {
    flex: 1,
  },
  columnHeader: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.s,
    textAlign: 'center',
  },
  scrollView: {
    height: 250,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
  },
  scrollContent: {
    padding: SPACING.s,
  },
  item: {
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.xs,
  },
  itemSelected: {
    backgroundColor: COLORS.primary,
  },
  itemDisabled: {
    opacity: 0.4,
  },
  itemText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    textAlign: 'center',
  },
  itemTextSelected: {
    color: COLORS.white,
    fontWeight: '600',
  },
  itemTextDisabled: {
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  actionButton: {
    flex: 1,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelButton: {
    backgroundColor: COLORS.transparent,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
  },
  cancelButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  confirmButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
});
