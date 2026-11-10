const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Simkl's "When did you watch this? → I don't remember" stores 1970-01-01T00:00:01Z.
 * Anything at or before the day after the epoch is that placeholder, not a real date.
 */
const PLACEHOLDER_MAX_MS = Date.UTC(1970, 0, 2);
const ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Parses Simkl's ISO dates (`2024-03-15T14:32:57Z`, with or without a zone) into epoch ms.
 * Null for the 1970 "I don't remember" placeholder, impossible dates, and anything more
 * than a day in the future. Old dates are real (Simkl can stamp a movie with its release
 * date), so there's no lower floor.
 */
export function parseSimklDate(raw: unknown, now: number): number | null {
  if (typeof raw !== 'string') return null;
  const match = raw.trim().match(ISO_PATTERN);
  if (!match) return null;

  const [, y, mo, d, h = '0', mi = '0', s = '0', fraction = '0', zone] = match;
  const year = Number(y);
  const month = Number(mo) - 1;
  const day = Number(d);
  if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  let value = Date.UTC(
    year,
    month,
    day,
    Number(h),
    Number(mi),
    Number(s),
    Number(fraction.padEnd(3, '0').slice(0, 3))
  );

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

  return value > PLACEHOLDER_MAX_MS && value <= now + DAY_MS ? value : null;
}

/**
 * Simkl's `last_watched` / `next_to_watch` labels: `S04E08` for TV, `E120` (or
 * `S01E120`) for anime. Null for specials (season 0) and anything else.
 */
export function parseEpisodeLabel(raw: unknown): { season: number; episode: number } | null {
  if (typeof raw !== 'string') return null;
  const match = raw.trim().match(/^(?:S(\d+))?E(\d+)$/i);
  if (!match) return null;
  const season = match[1] === undefined ? 1 : Number(match[1]);
  const episode = Number(match[2]);
  return season >= 1 && episode >= 1 ? { episode, season } : null;
}
