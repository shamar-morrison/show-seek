/**
 * Whether the phone is set to a 24-hour clock, or undefined when that can't be read. Read on each
 * call, so a change in the phone's settings shows up without restarting the app.
 */
export function deviceUses24HourClock(): boolean | undefined {
  try {
    // Loaded lazily like in src/i18n: a build without the native module falls back to the locale.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCalendars } = require('expo-localization') as typeof import('expo-localization');
    const value = getCalendars()[0]?.uses24hourClock;
    return typeof value === 'boolean' ? value : undefined;
  } catch {
    return undefined;
  }
}

// The 24-hour time preference, kept here so plain formatting functions can use it. Set from
// preferences by the root layout; undefined until the person chooses (then the phone decides).
let preferred24HourClock: boolean | undefined;

export function setPreferred24HourClock(value: boolean | undefined): void {
  preferred24HourClock = value;
}

/** Whether clock times use 24 hours: the person's choice, else the phone's setting. */
export function uses24HourClock(): boolean | undefined {
  return preferred24HourClock ?? deviceUses24HourClock();
}

/**
 * A date and time of day in the app language, with the clock set by the 24-hour time preference
 * (or the phone's setting until it's chosen) rather than the language's convention, so English
 * with 24-hour time shows 21:05. Without options it shows the language's default date and
 * time, like `toLocaleString`.
 */
export function formatDateTime(
  date: Date | number | string,
  language: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const uses24Hour = uses24HourClock();
  return new Date(date).toLocaleString(language, {
    ...options,
    ...(uses24Hour === undefined ? {} : { hour12: !uses24Hour }),
  });
}
