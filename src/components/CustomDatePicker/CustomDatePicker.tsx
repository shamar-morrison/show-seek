/**
 * Custom reusable date picker component with calendar interface.
 * Supports locale-based first day of week, min/max date constraints,
 * and a quick month/year picker modal.
 */

import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import { MonthYearPickerModal } from './MonthYearPickerModal';
import type { CalendarDay, DatePickerProps } from './types';
import {
  formatMonthYear,
  generateCalendarGrid,
  getLocalizedWeekdayHeaders,
  isSameMonth,
} from './utils';

// Default date range
const DEFAULT_MIN_DATE = new Date(2000, 0, 1); // January 1, 2000

function getDefaultMaxDate(): Date {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return today;
}

export function CustomDatePicker({
  selectedDate,
  onDateSelect,
  minDate = DEFAULT_MIN_DATE,
  maxDate = getDefaultMaxDate(),
  onCancel,
}: DatePickerProps) {
  // Viewing state: which month/year is currently displayed
  const [viewingDate, setViewingDate] = useState(() => {
    const initial = selectedDate ?? new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  // Temporary selection before confirmation
  const [tempSelectedDate, setTempSelectedDate] = useState<Date | undefined>(selectedDate);

  // Month/year picker modal state
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);

  // Memoized weekday headers (locale-based)
  const weekdayHeaders = useMemo(() => getLocalizedWeekdayHeaders(), []);

  // Memoized calendar grid
  const calendarGrid = useMemo(() => {
    return generateCalendarGrid(
      viewingDate.getFullYear(),
      viewingDate.getMonth(),
      tempSelectedDate,
      minDate,
      maxDate
    );
  }, [viewingDate, tempSelectedDate, minDate, maxDate]);

  // Navigation constraints
  const canGoBack = !isSameMonth(viewingDate, minDate);
  const canGoForward = !isSameMonth(viewingDate, maxDate);

  // Navigation handlers
  const goToPreviousMonth = () => {
    if (!canGoBack) return;
    setViewingDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    if (!canGoForward) return;
    setViewingDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Date selection handler
  const handleDayPress = (day: CalendarDay) => {
    if (day.isDisabled) return;
    setTempSelectedDate(day.date);
  };

  // Month/year picker handlers
  const handleMonthYearSelect = (month: number, year: number) => {
    setViewingDate(new Date(year, month, 1));
    setShowMonthYearPicker(false);
  };

  // Action handlers
  const handleConfirm = () => {
    if (tempSelectedDate) {
      onDateSelect(tempSelectedDate);
    }
  };

  const handleCancel = () => {
    onCancel?.();
  };

  // Render a single day cell
  const renderDayCell = (day: CalendarDay, index: number) => {
    const cellStyles: StyleProp<ViewStyle>[] = [styles.dayCell];
    const textStyles: StyleProp<TextStyle>[] = [styles.dayText];

    if (!day.isCurrentMonth) {
      textStyles.push(styles.otherMonthText);
    }

    if (day.isDisabled) {
      textStyles.push(styles.disabledText);
    }

    if (day.isSelected) {
      cellStyles.push(styles.selectedCell);
      textStyles.push(styles.selectedText);
    } else if (day.isToday && day.isCurrentMonth) {
      cellStyles.push(styles.todayCell);
    }

    return (
      <Pressable
        key={index}
        style={({ pressed }) => [...cellStyles, !day.isDisabled && pressed && styles.pressedCell]}
        onPress={() => handleDayPress(day)}
        disabled={day.isDisabled}
      >
        <Text style={textStyles}>{day.dayOfMonth}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header with Month/Year and Navigation */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={goToPreviousMonth}
          disabled={!canGoBack}
          style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
          activeOpacity={ACTIVE_OPACITY}
        >
          <ChevronLeft size={24} color={canGoBack ? COLORS.text : COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.monthYearButton}
          onPress={() => setShowMonthYearPicker(true)}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={styles.monthYearText}>{formatMonthYear(viewingDate)}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={goToNextMonth}
          disabled={!canGoForward}
          style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
          activeOpacity={ACTIVE_OPACITY}
        >
          <ChevronRight size={24} color={canGoForward ? COLORS.text : COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Weekday Headers */}
      <View style={styles.weekdayHeader}>
        {weekdayHeaders.map((day, index) => (
          <View key={index} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{day}</Text>
          </View>
        ))}
      </View>

      {/* Calendar Grid */}
      <View style={styles.calendarGrid}>
        {calendarGrid.map((day, index) => renderDayCell(day, index))}
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.cancelButton]}
          onPress={handleCancel}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.confirmButton,
            !tempSelectedDate && styles.buttonDisabled,
          ]}
          onPress={handleConfirm}
          disabled={!tempSelectedDate}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={[styles.confirmButtonText, !tempSelectedDate && styles.buttonTextDisabled]}>
            Confirm
          </Text>
        </TouchableOpacity>
      </View>

      {/* Month/Year Picker Modal */}
      <MonthYearPickerModal
        visible={showMonthYearPicker}
        selectedMonth={viewingDate.getMonth()}
        selectedYear={viewingDate.getFullYear()}
        minDate={minDate}
        maxDate={maxDate}
        onSelect={handleMonthYearSelect}
        onClose={() => setShowMonthYearPicker(false)}
      />
    </View>
  );
}

const CELL_SIZE = 44; // Minimum touch target

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.m,
  },
  navButton: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.round,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  monthYearButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.s,
  },
  monthYearText: {
    fontSize: FONT_SIZE.l,
    fontWeight: '600',
    color: COLORS.text,
  },

  // Weekday Headers
  weekdayHeader: {
    flexDirection: 'row',
    marginBottom: SPACING.xs,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.xs,
  },
  weekdayText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },

  // Calendar Grid
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: SPACING.m,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: CELL_SIZE,
  },
  dayText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
  },
  otherMonthText: {
    color: COLORS.surfaceLight,
  },
  disabledText: {
    color: COLORS.textSecondary,
    opacity: 0.5,
  },
  selectedCell: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.round,
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  selectedText: {
    color: COLORS.white,
    fontWeight: '600',
  },
  todayCell: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.round,
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  pressedCell: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.round,
  },

  // Actions
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
  buttonDisabled: {
    backgroundColor: COLORS.surfaceLight,
    opacity: 0.5,
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
  buttonTextDisabled: {
    color: COLORS.textSecondary,
  },
});
