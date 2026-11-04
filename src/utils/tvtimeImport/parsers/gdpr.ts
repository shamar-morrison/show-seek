import type { TvTimeFileEntry } from '../files';
import { addToList, type ShowDraft, type TvTimeLibrary } from '../library';
import {
  parseCsv,
  parseEpochSeconds,
  parseTvTimeDate,
  toBool,
  toNonNegativeInt,
  toPositiveInt,
  toRating,
  toText,
  toYear,
  type CsvRow,
} from '../values';

/** TV Time's stars_wording_scalev2 rating set: vote id → 1–10 (bad, ok, good, great, wow). */
const VOTE_ID_TO_RATING: Record<number, number> = { 1: 2, 27: 4, 28: 6, 29: 8, 3: 10 };
const RATING_FILES = ['ratings-live-votes.csv', 'ratings-v2-prod-votes.csv'];
const PLAY_PREFIXES = ['watch-episode-', 'rewatch-episode-'];

interface SeriesFlags {
  addedAt: number | null;
  archived: boolean;
  followed: boolean;
  forLater: boolean;
}

/**
 * Official GDPR export. Columns vary between accounts (TV Time prunes empty ones),
 * so everything is read by header name with fallbacks between old and new columns.
 */
export function parseGdprExport(entries: TvTimeFileEntry[], library: TvTimeLibrary): void {
  // Every file with this name: several picked exports may each carry one.
  const rows = (name: string) =>
    entries.filter((entry) => entry.name === name).flatMap((entry) => parseCsv(entry.text));
  const { now } = library;

  // --- Episodes and per-show flags (v2 is the source of truth) -------------
  const flags = new Map<number, SeriesFlags>();
  let v2Plays = 0;
  for (const row of rows('tracking-prod-records-v2.csv')) {
    const key = toText(row.key);
    const showId = toPositiveInt(row.s_id);

    if (PLAY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      if (showId === null) {
        library.skip('malformed_row');
        continue;
      }
      const position = toV2Position(row);
      if (!position) {
        library.skip('malformed_row');
        continue;
      }
      const watchedAt = parseTvTimeDate(row.created_at, now);
      if (watchedAt === null) {
        library.skip('invalid_date');
        continue;
      }
      const show = library.show(showId, { title: toText(row.series_name) });
      const tvdbEpisodeId = toPositiveInt(firstNonEmpty(row.ep_id, row.episode_id));
      library.addPlay(show, {
        ...position,
        ...(tvdbEpisodeId !== null ? { tvdbEpisodeId } : {}),
        watchedAt,
      });
      v2Plays += 1;
    } else if (key.startsWith('user-series-') && showId !== null) {
      library.show(showId, { title: toText(row.series_name) });
      flags.set(showId, {
        addedAt: parseTvTimeDate(row.created_at, now),
        archived: toBool(row.is_archived),
        followed: toBool(row.is_followed),
        forLater: toBool(row.is_for_later),
      });
    }
  }

  // v1 episode rows copy v2's, so they're only read when v2 has none (or wasn't picked).
  if (v2Plays === 0) {
    for (const row of rows('tracking-prod-records.csv')) {
      if (toText(row.entity_type) !== 'episode') continue;
      const type = toText(row.type);
      if (type !== 'watch' && type !== 'rewatch') continue;
      const showId = toPositiveInt(row.series_id);
      const season = toNonNegativeInt(row.season_number);
      const episode = toNonNegativeInt(row.episode_number);
      if (showId === null || season === null || episode === null) {
        library.skip('malformed_row');
        continue;
      }
      const watchedAt = watchDate(row, now);
      if (watchedAt === null) {
        library.skip('invalid_date');
        continue;
      }
      const show = library.show(showId, { title: toText(row.series_name) });
      const tvdbEpisodeId = toPositiveInt(row.episode_id);
      library.addPlay(show, {
        episode,
        season,
        ...(tvdbEpisodeId !== null ? { tvdbEpisodeId } : {}),
        watchedAt,
      });
    }
  }

  // Older follows that predate the v2 flags.
  for (const row of rows('followed_tv_show.csv')) {
    const showId = toPositiveInt(row.tv_show_id);
    if (showId === null || flags.has(showId)) continue;
    library.show(showId, { title: toText(row.tv_show_name) });
    flags.set(showId, {
      addedAt: parseTvTimeDate(row.created_at, now),
      archived: toBool(row.archived),
      followed: true,
      forLater: false,
    });
  }

  for (const show of library.shows.values()) {
    const showFlags = show.tvdbId === null ? undefined : flags.get(show.tvdbId);
    applyStatus(show, showFlags);
    if (showFlags?.addedAt) library.show(show.tvdbId!, { addedAt: showFlags.addedAt });
  }

  // --- Show favorites and ratings ------------------------------------------
  for (const row of rows('user_tv_show_data.csv')) {
    const showId = toPositiveInt(row.tv_show_id);
    if (showId !== null && toBool(row.is_favorited)) {
      library.show(showId, { title: toText(row.tv_show_name) }).favorite = true;
    }
  }
  for (const row of rows('user_show_special_status.csv')) {
    const showId = toPositiveInt(row.tv_show_id);
    if (showId !== null && toText(row.status) === 'favorite') {
      library.show(showId, { title: toText(row.tv_show_name) }).favorite = true;
    }
  }
  for (const row of rows('tv_show_rate.csv')) {
    const showId = toPositiveInt(row.tv_show_id);
    const value = toRating(Number(row.rating) * 2); // 1–5 stars, halves allowed
    if (showId === null || value === null) continue;
    library.show(showId, { title: toText(row.tv_show_name) }).rating = {
      ratedAt: parseTvTimeDate(row.created_at, now) ?? now,
      value,
    };
  }

  // --- Movies (only in v1, keyed by TV Time uuid, no external ids) ---------
  for (const row of rows('tracking-prod-records.csv')) {
    if (toText(row.entity_type) !== 'movie') continue;
    const type = toText(row.type);
    const uuid = toText(row.uuid);
    const slug = toText(row.alpha_range_key)
      .replace(`${type}-alpha-`, '')
      .replace(/-/g, ' ')
      .trim();
    // The slug is a lower-cased, dashed copy of the title; good enough for an exact title match.
    const title = toText(row.movie_name) || slug;
    if (!title) {
      library.skip('missing_identifiers');
      continue;
    }

    const year = toYear(row.release_date);

    if (type === 'watch' || type === 'rewatch') {
      const watchedAt = watchDate(row, now);
      if (watchedAt === null) {
        library.skip('invalid_date');
        continue;
      }
      const movie = library.movie({
        altTitle: slug || null,
        title,
        uuid,
        year,
        addedAt: watchedAt,
      });
      movie.watches.add(watchedAt);
    } else if (type === 'towatch') {
      const movie = library.movie({
        addedAt: parseTvTimeDate(row.created_at, now),
        altTitle: slug || null,
        title,
        uuid,
        year,
      });
      movie.watchlist = true;
    } else {
      library.movie({ altTitle: slug || null, title, uuid, year }); // e.g. `follow`: identity only
    }
  }

  for (const name of RATING_FILES) {
    for (const row of rows(name)) {
      const voteId = toPositiveInt(toText(row.vote_key).split('-').pop());
      const value = voteId === null ? null : (VOTE_ID_TO_RATING[voteId] ?? null);
      if (value === null) continue;
      if (toPositiveInt(row.episode_id) !== null) {
        library.ignore('episode_ratings');
        continue;
      }
      const movie = library.findMovie({ uuid: toText(row.uuid) });
      if (movie) movie.rating = { ratedAt: movie.addedAt ?? now, value };
    }
  }

  // --- Lists and favorites (Go-printed maps) -------------------------------
  parseLists(rows('lists-prod-lists.csv'), library);
}

function applyStatus(show: ShowDraft, flags: SeriesFlags | undefined): void {
  const hasPlays = show.plays.length > 0;
  if (flags?.forLater) show.status = 'watchlist';
  else if (flags?.archived) show.status = 'dropped';
  // GDPR has no up_to_date/continuing distinction.
  else if (hasPlays) show.status = 'watching';
  else if (flags?.followed) show.status = 'watchlist';
}

/** New exports use s_no/ep_no; 2016-era rows leave ep_no = 0 and fill season_number/episode_number. */
function toV2Position(row: CsvRow): { season: number; episode: number } | null {
  const epNo = toNonNegativeInt(row.ep_no);
  const [seasonRaw, episodeRaw] =
    epNo !== null && epNo > 0
      ? [row.s_no, row.ep_no]
      : [firstNonEmpty(row.season_number, row.s_no), row.episode_number];
  const season = toNonNegativeInt(seasonRaw);
  const episode = toNonNegativeInt(episodeRaw);
  return season === null || episode === null ? null : { episode, season };
}

function watchDate(row: CsvRow, now: number): number | null {
  const epoch = toText(row.watch_date_range_key).match(/watch-date-(\d+)/)?.[1];
  return (epoch ? parseEpochSeconds(epoch, now) : null) ?? parseTvTimeDate(row.created_at, now);
}

function parseLists(rows: CsvRow[], library: TvTimeLibrary): void {
  const { now } = library;
  const collectionNames = new Map<string, string>();
  const collection = rows.find((row) => toText(row.s_key) === 'collection');
  for (const entry of toText(collection?.lists).split('map[')) {
    const name = entry.match(/(?:^|\s)name:(.*?) (?:order|posters|related|s_key):/)?.[1]?.trim();
    const sKey = entry.match(/(?:^|\s)s_key:([^\s\]]+)/)?.[1];
    if (name && name !== '<nil>' && sKey) collectionNames.set(sKey, name);
  }

  for (const row of rows) {
    const sKey = toText(row.s_key);
    if (!sKey || sKey === 'collection' || sKey === 'count') continue;
    const isFavorites = sKey.startsWith('favorite-');
    const listName = isFavorites ? null : toText(row.name) || collectionNames.get(sKey);
    if (!isFavorites && !listName) continue;

    for (const object of toText(row.objects).split('map[').slice(1)) {
      const type = object.match(/(?:^|\s)type:(\w+)/)?.[1];
      const addedAt =
        parseEpochSeconds(object.match(/(?:^|\s)created_at:([\d.e+-]+)/)?.[1], now) ?? now;

      if (type === 'series') {
        const showId = toPositiveInt(object.match(/(?:^|\s)id:(\d+)/)?.[1]);
        if (showId === null) continue;
        const show = library.show(showId);
        if (isFavorites) show.favorite = true;
        else addToList(show, listName!, addedAt);
      } else if (type === 'movie') {
        // Movies are referenced by TV Time uuid only; without the v1 file they can't be resolved.
        const movie = library.findMovie({ uuid: object.match(/(?:^|\s)uuid:([0-9a-f-]+)/)?.[1] });
        if (!movie) {
          library.skip('missing_identifiers');
          continue;
        }
        if (isFavorites) movie.favorite = true;
        else addToList(movie, listName!, addedAt);
      }
    }
  }
}

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  return values.find((value) => value !== undefined && value.trim() !== '');
}
