/**
 * Utility functions for the CustomDatePicker component.
 * Handles calendar grid generation, locale detection, and date comparisons.
 */

import type { CalendarDay } from './types';

/**
 * Get the first day of the week based on the user's locale.
 * Returns 0 for Sunday, 1 for Monday, etc.
 */
export function getFirstDayOfWeek(): number {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const weekInfo = (new Intl.Locale(locale) as any).weekInfo;
    if (weekInfo?.firstDay != null) {
      // Intl.Locale uses 1=Monday...7=Sunday, convert to 0=Sunday...6=Saturday
      return weekInfo.firstDay === 7 ? 0 : weekInfo.firstDay;
    }
    return 0; // Default to Sunday
  } catch {
    return 0; // Fallback to Sunday
  }
}

/**
 * Get localized 2-letter weekday abbreviations starting from the locale's first day of week.
 */
export function getLocalizedWeekdayHeaders(): string[] {
  const firstDayOfWeek = getFirstDayOfWeek();
  const baseDate = new Date(2024, 0, 7); // January 7, 2024 is a Sunday

  const headers: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dayIndex = (firstDayOfWeek + i) % 7;
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + dayIndex);
    const dayName = date.toLocaleDateString(undefined, { weekday: 'short' });
    // Take first 2 characters for abbreviation
    headers.push(dayName.slice(0, 2));
  }
  return headers;
}

/**
 * Check if two dates are the same day (ignoring time).
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Check if two dates are in the same month and year.
 */
export function isSameMonth(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() && date1.getMonth() === date2.getMonth();
}

/**
 * Check if a date is within the given min/max range (inclusive).
 */
export function isDateInRange(date: Date, minDate: Date, maxDate: Date): boolean {
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const minOnly = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
  const maxOnly = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
  return dateOnly >= minOnly && dateOnly <= maxOnly;
}

/**
 * Get the number of days in a given month.
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Generate a calendar grid for the given month.
 * Always returns 6 weeks (42 days) for consistent height.
 */
export function generateCalendarGrid(
  year: number,
  month: number,
  selectedDate: Date | undefined,
  minDate: Date,
  maxDate: Date
): CalendarDay[] {
  const firstDayOfWeek = getFirstDayOfWeek();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // First day of the displayed month
  const firstOfMonth = new Date(year, month, 1);
  const firstDayIndex = firstOfMonth.getDay(); // 0=Sunday...6=Saturday

  // Calculate how many days from the previous month to show
  let daysFromPrevMonth = firstDayIndex - firstDayOfWeek;
  if (daysFromPrevMonth < 0) daysFromPrevMonth += 7;

  // Start date for the grid
  const startDate = new Date(year, month, 1 - daysFromPrevMonth);

  const grid: CalendarDay[] = [];

  for (let i = 0; i < 42; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    date.setHours(0, 0, 0, 0);

    const isCurrentMonth = date.getMonth() === month && date.getFullYear() === year;
    const isToday = isSameDay(date, today);
    const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
    const isDisabled = !isDateInRange(date, minDate, maxDate);

    grid.push({
      date,
      dayOfMonth: date.getDate(),
      isCurrentMonth,
      isToday,
      isSelected,
      isDisabled,
    });
  }

  return grid;
}

/**
 * Get the month name for a given month index (0-11).
 */
export function getMonthName(month: number): string {
  const date = new Date(2024, month, 1);
  return date.toLocaleDateString(undefined, { month: 'long' });
}

/**
 * Format a date as "Month Year" (e.g., "January 2024").
 */
export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
