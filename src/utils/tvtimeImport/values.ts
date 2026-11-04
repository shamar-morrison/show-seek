import Papa from 'papaparse';

export type CsvRow = Record<string, string>;

/** Parses a CSV by header name. TV Time exports differ in column order and set, so never by position. */
export function parseCsv(text: string): CsvRow[] {
  const result = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });
  return result.data.filter((row) => row && typeof row === 'object');
}

export function parseJsonArray(text: string): unknown[] | null {
  try {
    const value = JSON.parse(text) as unknown;
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const MIN_PLAUSIBLE_MS = Date.UTC(1990, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Parses the date shapes TV Time exports use — `2024-11-02 11:53:58` (UTC, no zone),
 * `2025-05-13T00:37:58Z`, millisecond/microsecond ISO — into epoch ms.
 * Rejects impossible dates (`2016-02-30`), garbage (`50663409-12-05`) and anything
 * outside 1990..now+1 day.
 */
export function parseTvTimeDate(raw: unknown, now: number): number | null {
  if (typeof raw !== 'string') return null;
  const match = raw.trim().match(DATE_PATTERN);
  if (!match) return null;

  const [, y, mo, d, h = '0', mi = '0', s = '0', fraction = '0', zone] = match;
  const year = Number(y);
  const month = Number(mo) - 1;
  const day = Number(d);
  const ms = Number(fraction.padEnd(3, '0').slice(0, 3));
  // Date.UTC would quietly roll 10:75 over to 11:15.
  if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  let value = Date.UTC(year, month, day, Number(h), Number(mi), Number(s), ms);

  const check = new Date(value);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  if (zone && zone !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    const offsetHours = Number(digits.slice(0, 2));
    const offsetMinutes = Number(digits.slice(2));
    if (offsetHours > 23 || offsetMinutes > 59) return null;
    value -= sign * (offsetHours * 60 + offsetMinutes) * 60_000;
  }

  return value >= MIN_PLAUSIBLE_MS && value <= now + DAY_MS ? value : null;
}

/** Epoch seconds (possibly Go-printed, e.g. `1.707766149e+09`) → ms. */
export function parseEpochSeconds(raw: unknown, now: number): number | null {
  const seconds = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const value = Math.round(seconds * 1000);
  return value >= MIN_PLAUSIBLE_MS && value <= now + DAY_MS ? value : null;
}

export function toPositiveInt(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function toNonNegativeInt(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim());
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function toImdbId(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return /^tt\d{5,10}$/.test(value) ? value : null;
}

export function toBool(raw: unknown): boolean {
  return raw === true || raw === 'true' || raw === '1' || raw === 1;
}

export function toText(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Release year; TV Time stores unknown dates as the Go zero time (0001-01-01). */
export function toYear(raw: unknown): number | null {
  const year = Number(String(raw ?? '').slice(0, 4));
  return Number.isInteger(year) && year >= 1870 && year <= 2100 ? year : null;
}

/** 1–10 integer rating, or null. */
export function toRating(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  const value = Math.round(raw);
  return value >= 1 && value <= 10 ? value : null;
}
