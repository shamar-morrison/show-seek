/**
 * Type definitions for the CustomDatePicker component.
 */

export interface DatePickerProps {
  /** Currently selected date */
  selectedDate?: Date;
  /** Callback when user confirms a date selection */
  onDateSelect: (date: Date) => void;
  /** Minimum selectable date (defaults to January 1, 2000) */
  minDate?: Date;
  /** Maximum selectable date (defaults to today) */
  maxDate?: Date;
  /** Optional callback when user cancels */
  onCancel?: () => void;
}

export interface CalendarDay {
  /** The actual date object */
  date: Date;
  /** Day of the month (1-31) */
  dayOfMonth: number;
  /** Whether this day belongs to the currently displayed month */
  isCurrentMonth: boolean;
  /** Whether this is today's date */
  isToday: boolean;
  /** Whether this date is currently selected */
  isSelected: boolean;
  /** Whether this date is outside the valid range (disabled) */
  isDisabled: boolean;
}

export interface MonthYearPickerProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Currently selected month (0-11) */
  selectedMonth: number;
  /** Currently selected year */
  selectedYear: number;
  /** Minimum date for validation */
  minDate: Date;
  /** Maximum date for validation */
  maxDate: Date;
  /** Callback when user selects a month/year */
  onSelect: (month: number, year: number) => void;
  /** Callback when modal should close */
  onClose: () => void;
}
