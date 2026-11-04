#!/usr/bin/env node
/**
 * Generates synthetic TV Time exports for the TV Time importer.
 *
 * One synthetic user library (SCENARIO below) is rendered into every export
 * format still in circulation after TV Time's July 2026 shutdown:
 *   - gdpr       official GDPR data request ZIP (CSV files)
 *   - refract    "TV Time Out by Refract" / "export my data" (tvtime-*.csv|json)
 *   - liberator  TV Time Liberator (movies.json, shows.json, activity_history.csv, ...)
 *   - extractor  TV Time Data Extractor (tv-time-export.csv)
 * and an expected.json describing what a correct parser recovers from each.
 *
 * File shapes are reconstructed from public sources (see
 * __tests__/fixtures/tvtime/README.md). No third-party fixture data is copied;
 * IDs are real public catalog IDs so the ZIPs also resolve against live TMDB.
 *
 * Usage:
 *   node scripts/generate-tvtime-fixtures.mjs                 # rewrite committed fixtures
 *   node scripts/generate-tvtime-fixtures.mjs --zip <dir>     # also write importable ZIPs
 *   node scripts/generate-tvtime-fixtures.mjs --zip <dir> --stress
 *        # ZIPs include a 1,100-episode One Piece history (chunk-splitting / timeout QA)
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_DIR = join(ROOT, '__tests__/fixtures/tvtime');
const EXPORT_DATE = '2026-07-01';
const USER_ID = 4242;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const at = (value) => {
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`bad date ${value}`);
  return date;
};
const addHours = (date, hours) => new Date(date.getTime() + hours * 3_600_000);
const pad = (n) => String(n).padStart(2, '0');
/** GDPR / Refract CSV style: `2024-11-02 11:53:58` (UTC, no zone). */
const spaced = (d) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes()
  )}:${pad(d.getUTCSeconds())}`;
/** Refract JSON style: `2025-05-13T00:37:58Z`. */
const isoZ = (d) => d.toISOString().replace('.000Z', 'Z');
/** Liberator style: millisecond ISO. */
const isoMs = (d) => d.toISOString();
const epochSeconds = (d) => Math.floor(d.getTime() / 1000);
/** Go's %v for a float64: `1.707766149e+09`. */
const goFloat = (n) => n.toExponential().replace(/e([+-])(\d)$/, 'e$10$2');

const uuid = (seed) => {
  const h = createHash('sha1').update(`tvtime-fixture:${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
/** Synthetic TVDB episode ids live in 90M–99M, far above real TVDB ids (~11M in 2026). */
const syntheticEpisodeId = (showTvdb, season, episode) =>
  90_000_000 +
  (parseInt(
    createHash('sha1').update(`${showTvdb}:${season}:${episode}`).digest('hex').slice(0, 8),
    16
  ) %
    9_000_000);

const csvField = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const toCsv = (header, rows) =>
  `${[header.join(','), ...rows.map((row) => header.map((column) => csvField(row[column])).join(','))].join('\n')}\n`;

// ---------------------------------------------------------------------------
// Scenario: one synthetic user's TV Time library
// ---------------------------------------------------------------------------

/** Real TVDB episode ids (from public real-export samples) for a few episodes. */
const REAL_EPISODE_IDS = {
  '266189:1:13': 4764625,
  '336924:1:3': 6461784,
  '336924:2:9': 7448023,
  '349310:1:6': 6733513,
  '397770:1386:1': 8253358,
};

const episodeId = (tvdb, season, episode) =>
  REAL_EPISODE_IDS[`${tvdb}:${season}:${episode}`] ?? syntheticEpisodeId(tvdb, season, episode);

/** Watched run: season `season`, episodes from..to, first at `start`, then every `everyHours`. */
const run = (season, from, to, start, everyHours = 24) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    episode: from + i,
    season,
    watchedAt: addHours(at(start), i * everyHours),
  }));

const LISTS = {
  fantasy: {
    createdAt: at('2024-02-12 19:28:40'),
    isPublic: true,
    name: 'Fantasy & Sci-Fi',
    uuid: uuid('list:fantasy'),
  },
  // GDPR stores this list's name only in the `collection` row (empty `name` column).
  korea: {
    createdAt: at('2024-03-18 17:07:05'),
    isPublic: false,
    name: 'Best of Korea',
    uuid: uuid('list:korea'),
  },
};

/**
 * status uses TV Time's vocabulary: up_to_date | continuing | not_started_yet | stopped.
 * ratingStars: TV Time 1–5 stars (halves allowed in GDPR tv_show_rate.csv).
 */
const SHOWS = [
  {
    favorite: true,
    followedAt: at('2016-01-03 20:00:00'),
    imdb: 'tt0903747',
    key: 'breakingBad',
    lists: [],
    plays: [
      ...run(1, 1, 7, '2016-01-04 21:00:00'),
      ...run(2, 1, 13, '2016-01-12 21:00:00'),
      ...run(3, 1, 13, '2016-01-26 21:00:00'),
      ...run(4, 1, 13, '2016-02-09 21:00:00'),
      ...run(5, 1, 16, '2016-02-23 21:00:00'),
      { episode: 16, rewatch: 1, season: 5, watchedAt: at('2020-05-01 22:10:00') },
    ],
    ratingStars: 5,
    episodeRatingStars: { '5:16': 5 }, // ignored by the importer (episode ratings unsupported)
    status: 'up_to_date',
    title: 'Breaking Bad',
    tvdb: 81189,
    unwatched: [],
  },
  {
    favorite: false,
    followedAt: at('2020-06-30 18:00:00'),
    imdb: 'tt5753856',
    key: 'dark',
    lists: ['fantasy'],
    plays: [
      ...run(1, 1, 10, '2020-07-01 20:00:00'),
      ...run(2, 1, 8, '2020-07-11 20:00:00'),
      ...run(3, 1, 8, '2020-07-19 20:00:00'),
    ],
    ratingStars: 4.5,
    status: 'up_to_date',
    title: 'Dark',
    tvdb: 334824,
    unwatched: [],
  },
  {
    favorite: false,
    followedAt: at('2017-04-20 12:00:00'),
    imdb: null,
    key: 'blacklist',
    lists: [],
    plays: [...run(1, 1, 22, '2017-04-21 12:38:26', 12), ...run(2, 1, 5, '2017-06-01 20:00:00')],
    ratingStars: null,
    status: 'stopped',
    title: 'The Blacklist',
    tvdb: 266189,
    unwatched: [
      { episode: 6, season: 2 },
      { episode: 7, season: 2 },
    ],
  },
  {
    favorite: false,
    followedAt: at('2019-01-01 10:00:00'),
    imdb: null,
    key: 'you',
    lists: [],
    plays: [
      ...run(1, 1, 10, '2019-01-02 21:00:00'),
      ...run(2, 1, 10, '2020-01-02 21:00:00'),
      // Exact duplicate of the original S1E3 play (shared timestamp) — must collapse.
      { duplicateOf: { episode: 3, season: 1 }, episode: 3, rewatch: 1, season: 1 },
      { episode: 3, rewatch: 2, season: 1, watchedAt: at('2025-02-02 12:45:17') },
      { episode: 9, rewatch: 1, season: 2, watchedAt: at('2025-04-24 11:02:44') },
    ],
    ratingStars: null,
    status: 'continuing',
    title: 'You',
    tvdb: 336924,
    unwatched: [{ episode: 1, season: 3 }],
  },
  {
    favorite: false,
    followedAt: at('2015-12-01 19:00:00'),
    imdb: 'tt1475582',
    key: 'sherlock',
    lists: [],
    plays: [
      ...run(1, 1, 3, '2015-12-02 20:00:00'),
      ...run(2, 1, 3, '2015-12-05 20:00:00'),
      ...run(3, 1, 3, '2015-12-08 20:00:00'),
      ...run(0, 1, 1, '2016-01-01 21:00:00'), // special
      ...run(4, 1, 3, '2017-01-01 21:00:00'),
    ],
    ratingStars: null,
    status: 'up_to_date',
    title: 'Sherlock',
    tvdb: 176941,
    unwatched: [{ episode: 2, season: 0 }],
  },
  {
    favorite: false,
    followedAt: at('2018-09-08 10:16:19'),
    forLater: true,
    imdb: null,
    key: 'agentCarter',
    lists: [],
    plays: [],
    ratingStars: null,
    status: 'not_started_yet',
    title: "Marvel's Agent Carter",
    tvdb: 281485,
    unwatched: [
      { episode: 1, season: 1 },
      { episode: 2, season: 1 },
    ],
  },
  {
    favorite: true,
    followedAt: at('2019-04-10 18:00:00'),
    imdb: 'tt0944947',
    key: 'got',
    lists: ['fantasy'],
    plays: run(1, 1, 10, '2019-04-11 21:00:00'),
    ratingStars: null,
    status: 'continuing',
    title: 'Game of Thrones',
    tvdb: 121361,
    unwatched: [{ episode: 1, season: 2 }],
  },
  {
    favorite: false,
    followedAt: at('2021-01-28 20:00:00'),
    gdprName: 'Bodyguard (2018)', // GDPR series_name carries a year suffix
    imdb: null,
    key: 'bodyguard',
    lists: [],
    plays: run(1, 1, 6, '2021-01-30 22:11:37', 30),
    ratingStars: null,
    status: 'up_to_date',
    title: 'Bodyguard',
    tvdb: 349310,
    unwatched: [],
  },
  {
    favorite: false,
    followedAt: at('2020-03-22 00:18:25'),
    forLater: true,
    imdb: null,
    key: 'legion',
    lists: [],
    plays: [],
    ratingStars: null,
    status: 'not_started_yet',
    title: 'Legion',
    tvdb: 320724,
    unwatched: [{ episode: 1, season: 1 }],
  },
  {
    favorite: false,
    followedAt: at('2016-08-04 15:10:45'),
    imdb: null,
    key: 'rayDonovan',
    legacyColumns: true, // 2016-era v2 rows: ep_id empty, s_no/ep_no = 0, ids in legacy columns
    lists: [],
    plays: run(1, 1, 4, '2016-08-05 16:48:22'),
    invalidDatePlays: [{ episode: 5, raw: '2016-02-30 21:00:00', season: 1 }], // GDPR-only junk row
    ratingStars: null,
    status: 'stopped',
    title: 'Ray Donovan',
    tvdb: 259866,
    unwatched: [{ episode: 5, season: 1 }],
  },
  {
    favorite: false,
    followedAt: at('2025-03-20 10:15:42'),
    imdb: null,
    key: 'mahEAsal',
    lists: [],
    plays: run(1386, 1, 3, '2025-03-20 10:31:09', 1), // year-numbered season (TVDB) — likely absent on TMDB
    ratingStars: null,
    status: 'continuing',
    title: 'Mah-e Asal',
    tvdb: 397770,
    unwatched: [],
  },
  {
    favorite: false,
    followedAt: at('2025-05-12 23:00:00'),
    imdb: null,
    key: 'helloDivorce',
    lists: [],
    plays: run(1, 1, 2, '2025-05-13 00:37:58', 0.01),
    ratingStars: null,
    status: 'continuing',
    title: 'Hello, Nice to Meet You. Could You Please Divorce Me?', // comma → CSV quoting
    tvdb: 455514,
    unwatched: [{ episode: 3, season: 1 }],
  },
  {
    favorite: false,
    followedAt: at('2019-06-01 12:00:00'),
    imdb: null,
    key: 'lostShow',
    lists: [],
    plays: run(1, 1, 2, '2019-06-02 20:00:00'),
    ratingStars: null,
    status: 'continuing',
    title: '', // TV Time lost this show's metadata; legacy id unknown to TMDB
    tvdb: 999000001,
    unwatched: [],
  },
  {
    favorite: false,
    followedAt: at('2022-03-10 09:00:00'),
    imdb: null,
    key: 'halo',
    legacyFollowOnly: true, // GDPR: only in followed_tv_show.csv, no v2 user-series row
    lists: [],
    plays: [],
    ratingStars: null,
    status: 'not_started_yet',
    title: 'Halo',
    tvdb: 366524,
    unwatched: [{ episode: 1, season: 1 }],
  },
];

/**
 * Movies. `gdprName` is the (possibly localized) GDPR movie_name; `slug` feeds
 * alpha_range_key, which TV Time keeps in English.
 */
const MOVIES = [
  {
    imdb: 'tt1375666',
    key: 'inception',
    ratingStars: 4,
    slug: 'inception',
    title: 'Inception',
    tmdb: 27205,
    tvdb: null,
    watches: [at('2018-03-10 20:00:00'), at('2023-08-01 21:00:00')],
    year: 2010,
  },
  {
    favorite: true,
    imdb: 'tt0133093',
    key: 'matrix',
    slug: 'the-matrix',
    title: 'The Matrix',
    tmdb: 603,
    tvdb: 169,
    watches: [at('2015-06-01 21:30:00')],
    year: 1999,
  },
  {
    imdb: 'tt0816692',
    key: 'interstellar',
    slug: 'interstellar',
    title: 'Interstellar',
    tvdb: null,
    watches: [],
    watchlist: true,
    year: 2014,
  },
  {
    imdb: 'tt6751668',
    key: 'parasite',
    lists: ['korea'],
    slug: 'parasite',
    title: 'Parasite',
    tmdb: 496243,
    tvdb: null,
    watches: [at('2020-02-15 19:00:00')],
    year: 2019,
  },
  {
    imdb: 'tt1396484',
    key: 'it',
    slug: 'it',
    title: 'It',
    tvdb: 1435,
    watches: [at('2019-09-10 08:01:29')],
    year: 2017,
  },
  {
    imdb: 'tt17196124',
    key: 'grimcutty',
    slug: 'grimcutty',
    title: 'Grimcutty',
    tvdb: 340491,
    watches: [],
    watchlist: true,
    year: 2022,
  },
  {
    imdb: 'tt27554389',
    key: 'dontCallItMystery',
    slug: 'dont-call-it-mystery',
    title: 'Don’t Call it Mystery', // curly apostrophe
    tvdb: 341914,
    watches: [at('2025-02-11 17:34:58')],
    year: 2023,
  },
  {
    gdprName: '승리호', // GDPR keeps the localized title; slug stays English
    imdb: null,
    key: 'spaceSweepers',
    slug: 'space-sweepers',
    title: 'Space Sweepers',
    tvdb: null,
    watches: [at('2021-02-06 13:00:00')],
    year: 2021,
  },
  {
    imdb: null,
    key: 'lionKing2019', // no ids anywhere: must resolve by title + year (1994 original also exists)
    slug: 'the-lion-king',
    title: 'The Lion King',
    tvdb: null,
    watches: [at('2019-08-01 18:00:00')],
    year: 2019,
  },
];

/** GDPR-only junk rows (real-world noise). */
const GDPR_JUNK_MOVIES = [
  {
    kind: 'nameless-follow',
    movieName: '',
    releaseDate: '0001-01-01',
    type: 'follow',
    created: at('2024-04-05 12:00:00'),
  },
  {
    kind: 'junk-date',
    movieName: 'Glitch Movie',
    releaseDate: '2003-05-01',
    type: 'watch',
    rawCreated: '50663409-12-05 02:20:00',
  },
];

for (const show of SHOWS) show.uuid = uuid(`show:${show.key}`);
for (const movie of MOVIES) {
  movie.uuid = uuid(`movie:${movie.key}`);
  movie.lists ??= [];
  movie.favorite ??= false;
  movie.watchlist ??= false;
  movie.ratingStars ??= null;
}

/** Resolve duplicate plays (shared timestamp with the original watch). */
for (const show of SHOWS) {
  for (const play of show.plays) {
    if (play.duplicateOf) {
      const original = show.plays.find(
        (p) =>
          !p.rewatch &&
          p.season === play.duplicateOf.season &&
          p.episode === play.duplicateOf.episode
      );
      play.watchedAt = original.watchedAt;
    }
    play.tvdbEpisodeId = episodeId(show.tvdb, play.season, play.episode);
  }
  for (const ep of show.unwatched) ep.tvdbEpisodeId = episodeId(show.tvdb, ep.season, ep.episode);
}

function stressShow() {
  // One Piece: 1,100 plays across TMDB-style arcs. TVDB/TMDB season splits differ,
  // so this also exercises the per-call fallback-lookup cap.
  const plays = [];
  let start = at('2021-01-01 18:00:00');
  for (let i = 0; i < 1100; i += 1) {
    const season = Math.floor(i / 50) + 1;
    plays.push({ episode: (i % 50) + 1, season, watchedAt: addHours(start, i * 6) });
  }
  const show = {
    favorite: false,
    followedAt: at('2020-12-31 18:00:00'),
    imdb: null,
    key: 'onePiece',
    lists: [],
    plays,
    ratingStars: null,
    status: 'continuing',
    title: 'One Piece',
    tvdb: 81797,
    unwatched: [],
    uuid: uuid('show:onePiece'),
  };
  for (const play of plays) play.tvdbEpisodeId = episodeId(show.tvdb, play.season, play.episode);
  return show;
}

// Derived views ---------------------------------------------------------------

const firstPlays = (show) => {
  const byKey = new Map();
  for (const play of show.plays) {
    const key = `${play.season}:${play.episode}`;
    if (!play.rewatch && !byKey.has(key)) byKey.set(key, play);
  }
  return [...byKey.values()];
};
const rewatchCount = (show, season, episode) =>
  show.plays.filter(
    (p) => p.rewatch && !p.duplicateOf && p.season === season && p.episode === episode
  ).length;
const seasonsOf = (show) => {
  const seasons = new Map();
  for (const play of firstPlays(show)) {
    if (!seasons.has(play.season)) seasons.set(play.season, []);
    seasons.get(play.season).push({ ...play, watched: true });
  }
  for (const ep of show.unwatched) {
    if (!seasons.has(ep.season)) seasons.set(ep.season, []);
    seasons.get(ep.season).push({ ...ep, watched: false });
  }
  return [...seasons.entries()]
    .sort(([a], [b]) => a - b)
    .map(([number, episodes]) => ({
      episodes: episodes.sort((a, b) => a.episode - b.episode),
      number,
    }));
};
const latestPlay = (show) =>
  show.plays.reduce((latest, p) => (!latest || p.watchedAt > latest.watchedAt ? p : latest), null);

// ---------------------------------------------------------------------------
// GDPR
// ---------------------------------------------------------------------------

const GDPR_V2_HEADER = [
  // Column order differs between real exports; parsers must read by header name.
  'episode_number',
  'user_id',
  'ep_no',
  'gsi',
  'created_at',
  'episode_id',
  's_no',
  'series_name',
  'bulk_type',
  'ep_id',
  'runtime',
  'key',
  's_id',
  'season_number',
  'movie_watch_count',
  'series_follow_count',
  'updated_at',
  'ep_watch_count',
  'total_movies_runtime',
  'total_series_runtime',
  'most_recent_ep_watched',
  'is_for_later',
  'uuid',
  'is_archived',
  'is_followed',
  'followed_at',
  'rewatch_count',
  'is_unitary',
  'is_special',
];

/**
 * A second real-world v2 column set: TV Time prunes columns per account, so this
 * variant has `movie_name` but no `episode_id` (and a different order again).
 */
const GDPR_V2_HEADER_PRUNED = [
  'created_at',
  'user_id',
  'key',
  'total_series_runtime',
  'updated_at',
  'total_movies_runtime',
  'movie_watch_count',
  'ep_watch_count',
  'series_follow_count',
  'uuid',
  'is_archived',
  'is_followed',
  's_id',
  'is_for_later',
  'most_recent_ep_watched',
  'followed_at',
  'runtime',
  'bulk_type',
  's_no',
  'ep_no',
  'is_unitary',
  'ep_id',
  'rewatch_count',
  'gsi',
  'is_special',
  'movie_name',
  'series_name',
  'season_number',
  'episode_number',
];

const GDPR_V1_HEADER = [
  'series_name',
  'uuid',
  'type-uuid-n',
  'watch_count',
  'type',
  'updated_at',
  'created_at',
  'series_id',
  'user_id',
  'watches',
  'movie_name',
  'runtime',
  'entity_type',
  'alpha_range_key',
  'follow_date_range_key',
  'release_date',
  'release_date_range_key',
  'rewatch_count',
  'series_uuid',
  'season_number',
  'episode_id',
  'watch_date',
  'episode_number',
  'total_movies_runtime',
  'total_series_runtime',
  'country',
  'bulk_type',
  'watched_episode_range_key',
  'watch_date_range_key',
  'unitarian',
];

/** `minimal`: a real-world ZIP with only v2 (pruned columns) + lists — no movies, ratings or follows. */
function gdprFiles(shows, { minimal = false } = {}) {
  const v2 = [];
  const allPlays = shows.flatMap((s) => s.plays);
  v2.push({
    created_at: '2015-11-12 17:11:33',
    ep_watch_count: allPlays.length,
    key: 'tracking-stats',
    movie_watch_count: MOVIES.reduce((n, m) => n + m.watches.length, 0),
    series_follow_count: shows.length,
    total_movies_runtime: 0,
    total_series_runtime: allPlays.length * 2700,
    updated_at: spaced(at(`${EXPORT_DATE} 08:00:00`)),
    user_id: USER_ID,
  });

  for (const show of shows) {
    const seriesName = show.gdprName ?? show.title;
    for (const play of show.plays) {
      const epUuid = uuid(`ep:${show.tvdb}:${play.season}:${play.episode}`);
      const isRewatch = Boolean(play.rewatch);
      const original = show.plays.find(
        (p) => !p.rewatch && p.season === play.season && p.episode === play.episode
      );
      const row = {
        created_at: spaced(play.watchedAt),
        key: isRewatch
          ? `rewatch-episode-${show.uuid}-${epUuid}-${play.rewatch}`
          : `watch-episode-${show.uuid}-${epUuid}`,
        s_id: show.tvdb,
        series_name: seriesName,
        updated_at: spaced(play.watchedAt),
        user_id: USER_ID,
      };
      if (isRewatch) row.gsi = `watch-episode-${epochSeconds(original.watchedAt)}`;
      if (show.legacyColumns && !minimal) {
        Object.assign(row, {
          ep_id: '',
          ep_no: 0,
          episode_id: play.tvdbEpisodeId,
          episode_number: play.episode,
          s_no: 0,
          season_number: play.season,
          rewatch_count: 0,
          is_unitary: 'false',
        });
      } else {
        Object.assign(row, {
          ep_id: play.tvdbEpisodeId,
          ep_no: play.episode,
          episode_id: play.tvdbEpisodeId,
          episode_number: play.episode,
          s_no: play.season,
          season_number: play.season,
          is_unitary: 'false',
        });
        if (play.watchedAt.getUTCFullYear() >= 2022)
          Object.assign(row, { bulk_type: 'season', runtime: 2940 });
        else row.rewatch_count = 0;
      }
      v2.push(row);
    }
    for (const junk of show.invalidDatePlays ?? []) {
      v2.push({
        created_at: junk.raw,
        ep_id: episodeId(show.tvdb, junk.season, junk.episode),
        ep_no: junk.episode,
        key: `watch-episode-${show.uuid}-${uuid(`junk:${show.tvdb}:${junk.episode}`)}`,
        s_id: show.tvdb,
        s_no: junk.season,
        series_name: seriesName,
        updated_at: junk.raw,
        user_id: USER_ID,
      });
    }

    if (show.legacyFollowOnly) continue;
    const latest = latestPlay(show);
    v2.push({
      created_at: spaced(show.followedAt),
      ep_watch_count: firstPlays(show).length || '',
      is_archived: String(show.status === 'stopped'),
      is_followed: 'true',
      is_for_later: String(Boolean(show.forLater)),
      key: `user-series-${show.uuid}`,
      most_recent_ep_watched: latest
        ? `map[ep_id:${latest.tvdbEpisodeId} ep_no:${latest.episode} s_no:${latest.season} uuid:${uuid(
            `ep:${show.tvdb}:${latest.season}:${latest.episode}`
          )} watch_date:${goFloat(latest.watchedAt.getTime() * 1000)}]`
        : '',
      s_id: show.tvdb,
      series_name: show.gdprName ?? show.title,
      updated_at: spaced(latest?.watchedAt ?? show.followedAt),
      user_id: USER_ID,
      uuid: show.uuid,
    });
  }

  // v1: movies (the only source of movie history) + legacy count/episode rows.
  const v1 = [];
  for (const show of shows.filter((s) => s.plays.length > 0)) {
    v1.push({
      created_at: spaced(show.followedAt),
      series_id: show.tvdb,
      type: 'count-watch-episode-series',
      'type-uuid-n': `count-watch-episode-series-${show.uuid}`,
      user_id: USER_ID,
      uuid: show.uuid,
      watch_count: firstPlays(show).length,
    });
  }
  const rd = shows.find((s) => s.key === 'rayDonovan');
  if (rd) {
    // Legacy v1 copy of a play that v2 also has — v2 is authoritative; must not double count.
    const p = rd.plays[0];
    v1.push({
      created_at: spaced(p.watchedAt),
      entity_type: 'episode',
      episode_id: p.tvdbEpisodeId,
      episode_number: p.episode,
      season_number: p.season,
      series_id: rd.tvdb,
      series_name: rd.title,
      series_uuid: rd.uuid,
      type: 'watch',
      'type-uuid-n': `watch-${uuid('legacy-ep')}-0`,
      user_id: USER_ID,
      uuid: uuid('legacy-ep'),
      watch_date_range_key: `watch-date-${epochSeconds(p.watchedAt)}`,
    });
  }
  for (const movie of MOVIES) {
    const base = {
      entity_type: 'movie',
      movie_name: movie.gdprName ?? movie.title,
      release_date: `${movie.year}-01-01`,
      runtime: 7800,
      user_id: USER_ID,
      uuid: movie.uuid,
    };
    movie.watches.forEach((watchedAt, index) => {
      const type = index === 0 ? 'watch' : 'rewatch';
      v1.push({
        ...base,
        alpha_range_key: `${type}-alpha-${movie.slug}`,
        created_at: spaced(watchedAt),
        type,
        'type-uuid-n': `${type}-${movie.uuid}-${index}`,
        updated_at: spaced(watchedAt),
        watch_date_range_key: `watch-date-${epochSeconds(watchedAt)}`,
      });
    });
    if (movie.watchlist) {
      v1.push({
        ...base,
        alpha_range_key: `towatch-alpha-${movie.slug}`,
        created_at: spaced(at('2024-01-15 10:00:00')),
        type: 'towatch',
        'type-uuid-n': `towatch-${movie.uuid}-0`,
      });
    }
  }
  for (const junk of GDPR_JUNK_MOVIES) {
    const id = uuid(`junk-movie:${junk.kind}`);
    v1.push({
      created_at: junk.rawCreated ?? spaced(junk.created),
      entity_type: 'movie',
      movie_name: junk.movieName,
      release_date: junk.releaseDate,
      type: junk.type,
      'type-uuid-n': `${junk.type}-${id}-0`,
      user_id: USER_ID,
      uuid: id,
    });
  }

  const followed = shows
    .filter((s) => s.title || s.legacyFollowOnly)
    .map((s) => ({
      active: 1,
      archived: s.status === 'stopped' ? 1 : 0,
      created_at: spaced(s.followedAt),
      diffusion: 'original',
      notification_offset: 1440,
      notification_type: 2,
      tv_show_id: s.tvdb,
      tv_show_name: s.gdprName ?? s.title,
      updated_at: spaced(s.followedAt),
      user_id: USER_ID,
    }));

  const userShowData = shows
    .filter((s) => s.title)
    .map((s) => ({
      is_favorited: s.favorite ? 1 : 0,
      is_followed: 1,
      nb_episodes_seen: firstPlays(s).length,
      tv_show_id: s.tvdb,
      tv_show_name: s.gdprName ?? s.title,
      user_id: USER_ID,
    }));

  const specialStatus = shows
    .filter((s) => s.key === 'breakingBad')
    .map((s) => ({
      created_at: spaced(s.followedAt),
      status: 'favorite',
      tv_show_id: s.tvdb,
      tv_show_name: s.title,
      updated_at: spaced(s.followedAt),
      user_id: USER_ID,
    }));

  const showRatings = shows
    .filter((s) => s.ratingStars !== null)
    .map((s) => {
      const ratedAt = spaced(latestPlay(s).watchedAt);
      return {
        created_at: ratedAt,
        rating: s.ratingStars,
        tv_show_id: s.tvdb,
        tv_show_name: s.title,
        updated_at: ratedAt,
        user_id: USER_ID,
      };
    });

  // stars_wording_scalev2: 1 bad, 27 ok, 28 good, 29 great, 3 wow (→ 2/4/6/8/10).
  const STAR_TO_VOTE_ID = { 1: 1, 2: 27, 3: 28, 4: 29, 5: 3 };
  const votes = [];
  for (const movie of MOVIES.filter((m) => m.ratingStars !== null)) {
    votes.push({
      episode_id: '',
      movie_name: movie.gdprName ?? movie.title,
      user_id: USER_ID,
      uuid: movie.uuid,
      vote_key: `stars_wording_scalev2-${STAR_TO_VOTE_ID[movie.ratingStars]}`,
    });
  }
  for (const show of shows) {
    for (const [key, stars] of Object.entries(show.episodeRatingStars ?? {})) {
      const [season, episode] = key.split(':').map(Number);
      votes.push({
        episode_id: episodeId(show.tvdb, season, episode),
        movie_name: '',
        user_id: USER_ID,
        uuid: uuid(`ep:${show.tvdb}:${key}`),
        vote_key: `stars_wording_scalev2-${STAR_TO_VOTE_ID[stars]}`,
      });
    }
  }

  // Custom lists, favorites and the `collection` row (Go-printed maps).
  const goObj = (createdAt, entry) =>
    entry.type === 'movie'
      ? `map[created_at:${goFloat(epochSeconds(createdAt))} type:movie uuid:${entry.uuid}]`
      : `map[created_at:${goFloat(epochSeconds(createdAt))} id:${entry.id} type:series]`;
  const listItems = (listKey) => [
    ...shows.filter((s) => s.lists.includes(listKey)).map((s) => ({ id: s.tvdb, type: 'series' })),
    ...MOVIES.filter((m) => m.lists.includes(listKey)).map((m) => ({
      type: 'movie',
      uuid: m.uuid,
    })),
  ];
  const lists = [];
  lists.push({
    lists: `[${Object.values(LISTS)
      .map(
        (l) =>
          `map[created_at:${goFloat(epochSeconds(l.createdAt))} description:<nil> is_public:${l.isPublic} name:${l.name} order:<nil> posters:[] s_key:${l.uuid}]`
      )
      .join(' ')}]`,
    s_key: 'collection',
    user_id: USER_ID,
  });
  lists.push({ list_count: Object.keys(LISTS).length, s_key: 'count', user_id: USER_ID });
  const favSeries = shows.filter((s) => s.favorite);
  lists.push({
    created_at: spaced(at('2019-07-17 21:01:26')),
    is_public: 'false',
    objects: `[${favSeries.map((s) => goObj(s.followedAt, { id: s.tvdb, type: 'series' })).join(' ')}]`,
    ordering: 0,
    s_key: 'favorite-series',
    type: 'list',
    user_id: USER_ID,
  });
  lists.push({
    created_at: spaced(at('2019-12-05 14:13:22')),
    is_public: 'false',
    objects: `[${MOVIES.filter((m) => m.favorite)
      .map((m) => goObj(m.watches[0] ?? at('2020-01-01'), { type: 'movie', uuid: m.uuid }))
      .join(' ')}]`,
    ordering: 0,
    s_key: 'favorite-movies',
    type: 'list',
    user_id: USER_ID,
  });
  for (const [key, list] of Object.entries(LISTS)) {
    lists.push({
      created_at: spaced(list.createdAt),
      is_public: String(list.isPublic),
      name: key === 'korea' ? '' : list.name,
      objects: `[${listItems(key)
        .map((item) => goObj(list.createdAt, item))
        .join(' ')}]`,
      ordering: 0,
      s_key: list.uuid,
      type: 'list',
      user_id: USER_ID,
    });
  }

  const listsHeader = [
    'ordering',
    's_key',
    'name',
    'type',
    'description',
    'is_public',
    'user_id',
    'objects',
    'created_at',
    'lists',
    'list_count',
  ];
  if (minimal) {
    return {
      'tracking-prod-records-v2.csv': toCsv(GDPR_V2_HEADER_PRUNED, v2),
      'lists-prod-lists.csv': toCsv(listsHeader, lists),
    };
  }

  const SECRET = 'FIXTURE-SECRET-MUST-NOT-BE-READ';
  return {
    // Files the importer reads.
    'tracking-prod-records-v2.csv': toCsv(GDPR_V2_HEADER, v2),
    'tracking-prod-records.csv': toCsv(GDPR_V1_HEADER, v1),
    'followed_tv_show.csv': toCsv(
      [
        'updated_at',
        'active',
        'notification_type',
        'folder_id',
        'archived',
        'notification_offset',
        'user_id',
        'tv_show_id',
        'tv_show_name',
        'created_at',
        'diffusion',
      ],
      followed
    ),
    'user_tv_show_data.csv': toCsv(
      ['user_id', 'tv_show_id', 'is_followed', 'is_favorited', 'nb_episodes_seen', 'tv_show_name'],
      userShowData
    ),
    'user_show_special_status.csv': toCsv(
      ['created_at', 'updated_at', 'tv_show_name', 'user_id', 'tv_show_id', 'status'],
      specialStatus
    ),
    'tv_show_rate.csv': toCsv(
      ['created_at', 'updated_at', 'tv_show_name', 'user_id', 'tv_show_id', 'rating'],
      showRatings
    ),
    'ratings-live-votes.csv': toCsv(
      ['episode_id', 'movie_name', 'uuid', 'vote_key', 'user_id'],
      votes
    ),
    'lists-prod-lists.csv': toCsv(listsHeader, lists),
    // Noise the importer must ignore. Same header as ratings — route by file name.
    'emotions-live-votes.csv': toCsv(
      ['episode_id', 'movie_name', 'uuid', 'vote_key', 'user_id'],
      [
        {
          episode_id: episodeId(81189, 1, 1),
          uuid: uuid('emotion'),
          user_id: USER_ID,
          vote_key: 'emotions_v1-12',
        },
      ]
    ),
    'seen_episode_source.csv': toCsv(
      [
        'updated_at',
        'tv_show_name',
        'episode_season_number',
        'episode_number',
        'user_id',
        'episode_id',
        'source',
        'created_at',
      ],
      [
        {
          created_at: '2016-01-04 21:00:00',
          episode_id: episodeId(81189, 1, 1),
          episode_number: 1,
          episode_season_number: 1,
          source: 'episode-detail',
          tv_show_name: 'Breaking Bad',
          updated_at: '2016-01-04 21:00:00',
          user_id: USER_ID,
        },
      ]
    ),
    'show_comment.csv': toCsv(
      ['id', 'tv_show_id', 'tv_show_name', 'user_id', 'comment', 'created_at'],
      [
        {
          comment: 'Say my name.',
          created_at: '2016-02-28 22:00:00',
          id: 1,
          tv_show_id: 81189,
          tv_show_name: 'Breaking Bad',
          user_id: USER_ID,
        },
      ]
    ),
    // Account files that must NEVER be read or uploaded.
    'access_token.csv': toCsv(
      ['token', 'user_id', 'created_at'],
      [{ created_at: '2026-06-30 10:00:00', token: SECRET, user_id: USER_ID }]
    ),
    'auth-prod-login.csv': toCsv(
      ['email', 'password_hash', 'user_id'],
      [{ email: 'fixture-user@example.invalid', password_hash: SECRET, user_id: USER_ID }]
    ),
    'gdpr_requests.csv': toCsv(
      ['user_id', 'requested_at', 'status'],
      [{ requested_at: '2026-06-30 10:00:00', status: 'completed', user_id: USER_ID }]
    ),
  };
}

// ---------------------------------------------------------------------------
// Refract ("TV Time Out" / "export my data")
// ---------------------------------------------------------------------------

const REFRACT_STATUS = (s) => s.status; // same vocabulary as TV Time
function refractFiles(shows) {
  const suffix = `-${EXPORT_DATE}`;
  const series = shows.map((s) => ({
    // Real exports mix second- and microsecond-precision timestamps.
    created_at:
      s.key === 'mahEAsal' ? isoZ(s.followedAt).replace('Z', '.067614Z') : isoZ(s.followedAt),
    imdb_id: s.imdb ?? '',
    status: REFRACT_STATUS(s),
    title: s.title,
    tvdb_id: s.tvdb,
    uuid: s.uuid,
  }));
  const episodes = shows.flatMap((s) =>
    seasonsOf(s).flatMap((season) =>
      season.episodes.map((ep) => ({
        episode: ep.episode,
        is_watched: String(ep.watched),
        rewatch_count: ep.watched ? rewatchCount(s, ep.season ?? season.number, ep.episode) : 0,
        season: season.number,
        series_imdb_id: s.imdb ?? '',
        series_tvdb_id: s.tvdb,
        series_uuid: s.uuid,
        special: String(season.number === 0),
        title: s.title,
        tvdb_id: ep.tvdbEpisodeId,
        watched_at: ep.watched ? spaced(ep.watchedAt) : '',
      }))
    )
  );
  const movies = MOVIES.map((m) => ({
    created_at: isoZ(m.watches[0] ?? at('2024-01-15 10:00:00')),
    imdb_id: m.imdb ?? '',
    is_watched: String(m.watches.length > 0),
    rewatch_count: Math.max(0, m.watches.length - 1),
    title: m.title,
    tvdb_id: m.tvdb ?? '',
    uuid: m.uuid,
    watched_at: m.watches[0] ? isoZ(m.watches[0]) : '',
    year: m.year,
  }));
  const listRows = [];
  const listsJson = [];
  for (const [key, list] of Object.entries(LISTS)) {
    const items = [
      ...shows
        .filter((s) => s.lists.includes(key))
        .map((s) => ({ name: s.title, tvdb_id: s.tvdb, type: 'series', uuid: '' })),
      ...MOVIES.filter((m) => m.lists.includes(key)).map((m) => ({
        name: m.title,
        tvdb_id: m.tvdb ?? '',
        type: 'movie',
        uuid: m.uuid,
      })),
    ];
    items.forEach((item, index) =>
      listRows.push({
        custom_order: index,
        item_type: item.type,
        list_id: list.uuid,
        list_name: list.name,
        name: item.name,
        tvdb_id: item.tvdb_id,
        uuid: item.uuid,
      })
    );
    listsJson.push({
      id: list.uuid,
      items: items.map((item, index) => ({
        custom_order: index,
        name: item.name,
        tvdb_id: item.tvdb_id === '' ? null : item.tvdb_id,
        type: item.type,
        uuid: item.uuid || null,
      })),
      name: list.name,
    });
  }

  const seriesJson = shows.map((s) => ({
    id: { imdb: s.imdb, tvdb: s.tvdb },
    seasons: seasonsOf(s).map((season) => ({
      episodes: season.episodes.map((ep) => ({
        id: { imdb: null, tvdb: ep.tvdbEpisodeId },
        is_watched: ep.watched,
        number: ep.episode,
        watched_at: ep.watched ? isoZ(ep.watchedAt) : null,
      })),
      number: season.number,
    })),
    status: s.status,
    title: s.title,
  }));
  const moviesJson = MOVIES.map((m) => ({
    id: { imdb: m.imdb, tvdb: m.tvdb },
    is_watched: m.watches.length > 0,
    title: m.title,
    watched_at: m.watches[0] ? isoZ(m.watches[0]) : null,
    year: m.year,
  }));

  return {
    [`tvtime-series${suffix}.csv`]: toCsv(
      ['uuid', 'tvdb_id', 'imdb_id', 'title', 'status', 'created_at'],
      series
    ),
    [`tvtime-series-episodes${suffix}.csv`]: toCsv(
      [
        'series_tvdb_id',
        'series_imdb_id',
        'series_uuid',
        'title',
        'season',
        'episode',
        'tvdb_id',
        'is_watched',
        'watched_at',
        'rewatch_count',
        'special',
      ],
      episodes
    ),
    [`tvtime-movies${suffix}.csv`]: toCsv(
      [
        'uuid',
        'tvdb_id',
        'imdb_id',
        'title',
        'year',
        'created_at',
        'watched_at',
        'is_watched',
        'rewatch_count',
      ],
      movies
    ),
    [`tvtime-lists${suffix}.csv`]: toCsv(
      ['list_id', 'list_name', 'item_type', 'tvdb_id', 'uuid', 'name', 'custom_order'],
      listRows
    ),
    [`tvtime-series${suffix}.json`]: `${JSON.stringify(seriesJson, null, 2)}\n`,
    [`tvtime-movies${suffix}.json`]: `${JSON.stringify(moviesJson, null, 2)}\n`,
    [`tvtime-lists${suffix}.json`]: `${JSON.stringify(listsJson, null, 2)}\n`,
    // Decoy: profile summary page, not data.
    [`tvtime-summary${suffix}.html`]:
      '<!doctype html><title>TV Time summary</title><h1>Your TV Time profile</h1>\n',
  };
}

// ---------------------------------------------------------------------------
// TV Time Liberator
// ---------------------------------------------------------------------------

const LIBERATOR_CSV_HEADER = [
  'imdb_id',
  'tvdb_id',
  'type',
  'title',
  'season',
  'episode',
  'is_special',
  'is_watched',
  'watched_at',
  'status',
  'is_watchlisted',
  'rating',
];

function liberatorShow(s) {
  return {
    created_at: isoMs(s.followedAt),
    id: { imdb: s.imdb, tvdb: s.tvdb },
    seasons: seasonsOf(s).map((season) => ({
      episodes: season.episodes.map((ep) => {
        const stars = s.episodeRatingStars?.[`${season.number}:${ep.episode}`];
        const episode = {
          id: { imdb: null, tvdb: ep.tvdbEpisodeId },
          is_watched: ep.watched,
          number: ep.episode,
          rating: stars ? stars * 2 : null,
          special: season.number === 0,
        };
        if (ep.watched) {
          episode.watched_at = isoMs(ep.watchedAt);
          episode.rewatch_count = rewatchCount(s, season.number, ep.episode);
        }
        return episode;
      }),
      number: season.number,
    })),
    status: s.status,
    title: s.title,
    uuid: s.uuid,
  };
}
function liberatorMovie(m) {
  const movie = {
    created_at: isoMs(m.watches[0] ?? at('2024-01-15 10:00:00')),
    id: { imdb: m.imdb, tvdb: m.tvdb },
    is_watched: m.watches.length > 0,
    rating: m.ratingStars ? m.ratingStars * 2 : null,
    title: m.title,
    uuid: m.uuid,
  };
  if (m.watches[0]) {
    movie.watched_at = isoMs(m.watches[0]);
    movie.rewatch_count = m.watches.length - 1;
  }
  return movie;
}
/** Mirrors Liberator's toCsv: show rows' is_watchlisted means "has an unwatched episode", not a watchlist. */
function liberatorCsv({ movies, shows }) {
  const rows = [];
  for (const m of movies) {
    rows.push({
      imdb_id: m.id.imdb,
      is_special: 'false',
      is_watched: String(m.is_watched ?? false),
      is_watchlisted: String(m.watched_at == null),
      rating: m.rating ?? '',
      title: m.title,
      tvdb_id: m.id.tvdb,
      type: 'movie',
      watched_at: m.watched_at ?? '',
    });
  }
  for (const s of shows) {
    for (const season of s.seasons ?? []) {
      for (const ep of season.episodes.filter((e) => e.is_watched)) {
        rows.push({
          episode: ep.number,
          imdb_id: ep.id.imdb,
          is_special: String(ep.special),
          is_watched: 'true',
          is_watchlisted: String(ep.watched_at == null),
          rating: ep.rating ?? '',
          season: season.number,
          status: s.status,
          title: s.title,
          tvdb_id: ep.id.tvdb,
          type: 'episode',
          watched_at: ep.watched_at ?? '',
        });
      }
    }
  }
  for (const s of shows) {
    const hasUnwatched = (s.seasons ?? []).some((season) =>
      season.episodes.some((e) => !e.is_watched)
    );
    rows.push({
      imdb_id: s.id.imdb,
      is_watchlisted: String(hasUnwatched),
      status: s.status,
      title: s.title,
      tvdb_id: s.id.tvdb,
      type: 'show',
    });
  }
  return toCsv(LIBERATOR_CSV_HEADER, rows);
}
function liberatorFiles(shows) {
  const libShows = shows.filter((s) => s.title).map(liberatorShow); // Liberator only sees shows the API still returns
  const libMovies = MOVIES.map(liberatorMovie);
  const favorites = {
    movies: MOVIES.filter((m) => m.favorite).map(liberatorMovie),
    shows: shows.filter((s) => s.favorite).map(liberatorShow),
  };
  const lists = Object.entries(LISTS).map(([key, list]) => ({
    description: '',
    is_public: list.isPublic,
    movies: MOVIES.filter((m) => m.lists.includes(key)).map((m) => {
      const { created_at: _c, is_watched: _w, ...rest } = liberatorMovie(m);
      return { ...rest, added_at: isoMs(list.createdAt) };
    }),
    name: list.name,
    shows: shows
      .filter((s) => s.lists.includes(key))
      .map((s) => {
        const { created_at: _c, status: _s, ...rest } = liberatorShow(s);
        return { ...rest, added_at: isoMs(list.createdAt) };
      }),
  }));
  const files = {
    'movies.json': `${JSON.stringify(libMovies, null, 2)}\n`,
    'shows.json': `${JSON.stringify(libShows, null, 2)}\n`,
    'activity_history.csv': liberatorCsv({ movies: libMovies, shows: libShows }),
    'favorites.json': `${JSON.stringify(favorites, null, 2)}\n`,
    'favorites.csv': liberatorCsv(favorites),
    'lists.json': `${JSON.stringify(lists, null, 2)}\n`,
  };
  for (const list of lists)
    files[`list_${list.name.toLowerCase().replace(/ /g, '_')}.csv`] = liberatorCsv(list);
  return files;
}

// ---------------------------------------------------------------------------
// TV Time Data Extractor (movies only)
// ---------------------------------------------------------------------------

function extractorFiles() {
  const rows = MOVIES.filter((m) => m.watches.length > 0).map((m) => ({
    imdb_id: m.imdb ?? '',
    media_type: 'movie',
    title: m.title,
    tmdb_id: m.tmdb ?? '',
    tvdb_id: m.tvdb ?? '',
    type: 'watch',
    watched_at: isoZ(m.watches[0]),
    year: m.year,
  }));
  return {
    'tv-time-export.csv': toCsv(
      [
        'type',
        'media_type',
        'tmdb_id',
        'imdb_id',
        'tvdb_id',
        'title',
        'year',
        'season',
        'episode',
        'watched_at',
        'rating',
        'review',
      ],
      rows
    ),
  };
}

// ---------------------------------------------------------------------------
// Expected parser output
// ---------------------------------------------------------------------------

const STATUS_TO_CONTRACT = {
  continuing: 'watching',
  not_started_yet: 'watchlist',
  stopped: 'dropped',
  up_to_date: 'up_to_date',
};
const listNames = (keys) => keys.map((k) => LISTS[k].name).sort();
const stars = (value) => (value === null || value === undefined ? null : Math.round(value * 2));

function expectedFor(format, shows) {
  const out = { clientIgnored: {}, clientSkipped: {}, movies: [], shows: [] };
  const bump = (bucket, key, n = 1) => {
    if (n) out[bucket][key] = (out[bucket][key] ?? 0) + n;
  };

  if (format !== 'extractor') {
    for (const s of shows) {
      if (format === 'liberator' && !s.title) continue;
      if (format === 'gdpr-minimal' && s.legacyFollowOnly) continue; // no followed_tv_show.csv
      const distinctEpisodes = firstPlays(s).length;
      let status = STATUS_TO_CONTRACT[s.status];
      let plays = distinctEpisodes;
      const isGdpr = format === 'gdpr' || format === 'gdpr-minimal';
      if (isGdpr) {
        // GDPR has no up_to_date / continuing distinction: followed + watched → watching.
        status = s.forLater
          ? 'watchlist'
          : s.status === 'stopped'
            ? 'dropped'
            : distinctEpisodes > 0
              ? 'watching'
              : 'watchlist';
        plays = s.plays.filter((p) => !p.duplicateOf).length; // rewatch timestamps survive in GDPR
        bump('clientIgnored', 'duplicate_plays', s.plays.filter((p) => p.duplicateOf).length);
        bump('clientSkipped', 'invalid_date', (s.invalidDatePlays ?? []).length);
      }
      out.shows.push({
        distinctEpisodes,
        favorite: format === 'refract' ? false : s.favorite,
        imdbId: isGdpr ? null : s.imdb,
        lists: listNames(s.lists),
        plays,
        rating: format === 'gdpr' ? stars(s.ratingStars) : null,
        status,
        title: isGdpr ? (s.gdprName ?? s.title) : s.title,
        tvdbId: s.tvdb,
      });
      if (format === 'gdpr' || format === 'liberator')
        bump('clientIgnored', 'episode_ratings', Object.keys(s.episodeRatingStars ?? {}).length);
    }
  }

  if (format === 'gdpr-minimal') {
    // Movie history lives only in v1; list/favorite movie refs are bare TV Time uuids.
    bump(
      'clientSkipped',
      'missing_identifiers',
      MOVIES.filter((m) => m.favorite || m.lists.length > 0).length
    );
    out.shows.sort((a, b) => a.tvdbId - b.tvdbId);
    return out;
  }

  for (const m of MOVIES) {
    if (format === 'extractor' && m.watches.length === 0) continue;
    const entry = {
      favorite: format === 'gdpr' || format === 'liberator' ? m.favorite : false,
      imdbId: format === 'gdpr' ? null : m.imdb,
      lists: format === 'extractor' ? [] : listNames(m.lists),
      rating: format === 'gdpr' || format === 'liberator' ? stars(m.ratingStars) : null,
      title: format === 'gdpr' ? (m.gdprName ?? m.title) : m.title,
      tvdbId: format === 'gdpr' ? null : m.tvdb,
      watches: format === 'gdpr' ? m.watches.length : Math.min(1, m.watches.length), // only GDPR keeps rewatch timestamps
      watchlist: format === 'extractor' ? false : m.watchlist,
      year: format === 'liberator' ? null : m.year, // Liberator's Movie type has no year
    };
    if (format === 'gdpr') entry.altTitle = m.slug.replace(/-/g, ' ');
    if (format === 'extractor') entry.tmdbId = m.tmdb ?? null;
    out.movies.push(entry);
  }
  if (format === 'gdpr') {
    bump(
      'clientSkipped',
      'missing_identifiers',
      GDPR_JUNK_MOVIES.filter((j) => !j.movieName).length
    );
    bump('clientSkipped', 'invalid_date', GDPR_JUNK_MOVIES.filter((j) => j.rawCreated).length);
  }

  out.shows.sort((a, b) => a.tvdbId - b.tvdbId);
  out.movies.sort((a, b) => a.title.localeCompare(b.title));
  return out;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function writeTree(dir, files) {
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
}

async function writeZips(outDir, shows, stress) {
  const { default: AdmZip } = await import('adm-zip');
  mkdirSync(outDir, { recursive: true });
  const zipOf = (files, prefix = '') => {
    const zip = new AdmZip();
    for (const [name, content] of Object.entries(files))
      zip.addFile(`${prefix}${name}`, Buffer.from(content, 'utf8'));
    return zip.toBuffer();
  };
  const tag = stress ? '-stress' : '';
  const written = {
    [`tvtime-gdpr-data${tag}.zip`]: zipOf(gdprFiles(shows), 'gdpr-data/'), // real exports can nest everything in a folder
    [`tvtime-gdpr-minimal${tag}.zip`]: zipOf(gdprFiles(shows, { minimal: true })),
    [`tvtime-export-${EXPORT_DATE}${tag}.zip`]: zipOf(refractFiles(shows)),
    [`tv-time-export${tag}.zip`]: zipOf(liberatorFiles(shows)), // Liberator's default ZIP name
    [`tv-time-export${tag}.csv`]: Buffer.from(extractorFiles()['tv-time-export.csv'], 'utf8'),
  };
  for (const [name, buffer] of Object.entries(written)) writeFileSync(join(outDir, name), buffer);
  return Object.keys(written).map((name) => join(outDir, name));
}

const FORMATS = ['gdpr', 'gdpr-minimal', 'refract', 'liberator', 'extractor'];

async function main() {
  const args = process.argv.slice(2);
  const zipIndex = args.indexOf('--zip');
  const zipDir = zipIndex >= 0 ? resolve(args[zipIndex + 1] ?? '') : null;
  const stress = args.includes('--stress');
  if (zipIndex >= 0 && !args[zipIndex + 1]) throw new Error('--zip needs an output directory');

  const shows = stress ? [...SHOWS, stressShow()] : SHOWS;

  if (!stress) {
    for (const format of FORMATS)
      rmSync(join(FIXTURE_DIR, format), { force: true, recursive: true });
    writeTree(join(FIXTURE_DIR, 'gdpr'), gdprFiles(SHOWS));
    writeTree(join(FIXTURE_DIR, 'gdpr-minimal'), gdprFiles(SHOWS, { minimal: true }));
    writeTree(join(FIXTURE_DIR, 'refract'), refractFiles(SHOWS));
    writeTree(join(FIXTURE_DIR, 'liberator'), liberatorFiles(SHOWS));
    writeTree(join(FIXTURE_DIR, 'extractor'), extractorFiles());
    const expected = Object.fromEntries(FORMATS.map((f) => [f, expectedFor(f, SHOWS)]));
    writeFileSync(join(FIXTURE_DIR, 'expected.json'), `${JSON.stringify(expected, null, 2)}\n`);
    console.log(`Fixtures written to ${FIXTURE_DIR}`);
  }

  if (zipDir) {
    const files = await writeZips(zipDir, shows, stress);
    console.log(`ZIPs written:\n  ${files.join('\n  ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
