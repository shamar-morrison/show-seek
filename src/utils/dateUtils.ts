/**
 * Utilities for parsing and formatting TMDB date strings.
 *
 * TMDB returns dates in "YYYY-MM-DD" format. When JavaScript parses these
 * with `new Date("YYYY-MM-DD")`, it interprets them as midnight UTC, which
 * then shifts to the previous day in negative UTC offset timezones (e.g.,
 * EST at UTC-5 shows Dec 19 as Dec 18).
 *
 * These utilities parse dates as local dates to avoid timezone issues.
 */

/**
 * Parse a TMDB date string (YYYY-MM-DD) as a local date at midnight.
 * This prevents timezone offset issues where UTC midnight shifts to
 * the previous day in negative UTC offset timezones.
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @returns Date object set to local midnight
 */
export function parseTmdbDate(dateString: string): Date {
  if (!dateString || typeof dateString !== 'string') {
    throw new Error('Invalid date string: expected non-empty string');
  }
  const [year, month, day] = dateString.split('-').map(Number);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error('Invalid date string: expected YYYY-MM-DD format, received ' + dateString);
  }
  return new Date(year, month - 1, day); // month is 0-indexed in JavaScript
}

/**
 * Format a TMDB date string for display, avoiding timezone shift.
 *
 * @param dateString - Date in YYYY-MM-DD format
 * @param options - Intl.DateTimeFormatOptions for formatting
 * @returns Formatted date string
 */
export function formatTmdbDate(
  dateString: string,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
): string {
  const date = parseTmdbDate(dateString);
  return date.toLocaleDateString('en-US', options);
}

/**
 * Convert a Date object to a YYYY-MM-DD string using local date methods.
 * This is the reverse of parseTmdbDate and avoids the timezone shift
 * that occurs with toISOString().split('T')[0].
 *
 * @param date - Date object
 * @returns Date string in YYYY-MM-DD format
 */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
