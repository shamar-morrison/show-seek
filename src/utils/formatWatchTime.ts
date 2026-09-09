/**
 * Formatting utilities for total watch time.
 */

/**
 * Format a total-minutes watch time as a human-readable duration
 * (e.g. 57727 -> "962hrs 7mins").
 *
 * Hours are unbounded and unpadded; minutes are not padded either.
 * Units are pluralized English abbreviations ("1hr 1min" vs "2hrs 5mins").
 * Non-finite or negative inputs are treated as 0.
 */
export function formatWatchHours(totalMinutes: number): string {
  const safeMinutes =
    Number.isFinite(totalMinutes) && totalMinutes > 0 ? Math.floor(totalMinutes) : 0;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}${hours === 1 ? 'hr' : 'hrs'} ${minutes}${minutes === 1 ? 'min' : 'mins'}`;
}
