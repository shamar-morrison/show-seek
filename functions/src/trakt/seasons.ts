/** Season helpers shared by the Trakt sync and ZIP import. No Firebase dependencies. */

/**
 * The season number of a Trakt list or watchlist entry that stands for one season, or undefined
 * when it isn't a season (or has no usable number, in which case it counts as its show). Episode
 * entries are never seasons: ShowSeek lists don't hold episodes, so they count as their show.
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
  return typeof seasonNumber === 'number' && Number.isInteger(seasonNumber) && seasonNumber >= 0
    ? seasonNumber
    : undefined;
};

/**
 * The display title saved on a season entry before enrichment: "Show · Season N" (or "Show ·
 * Specials"), the shape the app writes, so app versions that predate seasons show something
 * sensible. Enrichment replaces it with TMDB's season name.
 */
export const buildSeasonEntryTitle = (showTitle: string, seasonNumber: number): string =>
  `${showTitle} · ${seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`}`;
