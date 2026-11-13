/** Season and episode helpers shared by the Trakt sync and ZIP import. No Firebase dependencies. */

const isWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * The season number of a Trakt list or watchlist entry that stands for one season, or undefined
 * when it isn't a season (or has no usable number, in which case it counts as its show). Episode
 * entries are never seasons (see getTraktEpisodeRef).
 */
export const getTraktSeasonNumber = (item: {
  episode?: unknown;
  season?: { number?: unknown };
  type?: string;
}): number | undefined => {
  if (item.episode || !item.season) {
    return undefined;
  }
  if (item.type !== undefined && item.type !== 'season') {
    return undefined;
  }
  const seasonNumber = item.season.number;
  return isWholeNumber(seasonNumber) ? seasonNumber : undefined;
};

/**
 * The season and episode numbers of a Trakt list or watchlist entry that stands for one episode,
 * or undefined when it isn't an episode (or has no usable numbers, in which case it counts as
 * its show).
 */
export const getTraktEpisodeRef = (item: {
  episode?: { number?: unknown; season?: unknown } | null;
  type?: string;
}): { seasonNumber: number; episodeNumber: number } | undefined => {
  if (!item.episode) {
    return undefined;
  }
  if (item.type !== undefined && item.type !== 'episode') {
    return undefined;
  }
  const { season, number } = item.episode;
  return isWholeNumber(season) && isWholeNumber(number)
    ? { seasonNumber: season, episodeNumber: number }
    : undefined;
};

/**
 * The display title saved on an episode entry: "Show · S2E12 · Name" (the name only when Trakt
 * has one), the shape the app writes, so app versions that predate episodes show something
 * sensible. Enrichment fills in TMDB's episode name separately and leaves the title as synced.
 */
export const buildEpisodeEntryTitle = (
  showTitle: string,
  seasonNumber: number,
  episodeNumber: number,
  episodeTitle?: string | null
): string =>
  [showTitle, `S${seasonNumber}E${episodeNumber}`, episodeTitle?.trim()]
    .filter(Boolean)
    .join(' · ');

/**
 * The display title saved on a season entry before enrichment: "Show · Season N" (or "Show ·
 * Specials"), the shape the app writes, so app versions that predate seasons show something
 * sensible. Enrichment replaces it with TMDB's season name.
 */
export const buildSeasonEntryTitle = (showTitle: string, seasonNumber: number): string =>
  `${showTitle} · ${seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`}`;
