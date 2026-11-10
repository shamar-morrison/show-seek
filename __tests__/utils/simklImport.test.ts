import {
  FILE_IMPORT_MAX_ENTITIES_PER_CHUNK,
  FILE_IMPORT_MAX_PLAYS_PER_CHUNK,
  type FileImportMovieEntity,
  type FileImportShowEntity,
} from '@/functions/src/shared/fileImport';
import { parseFileImportChunk } from '@/functions/src/fileImport/core';
import {
  SIMKL_MAX_EXPORT_BYTES,
  SimklImportError,
  readSimklExportFile,
  type PickedSimklFile,
} from '@/src/utils/simklImport/files';
import { parseSimklBackupJson } from '@/src/utils/simklImport/parsers/json';
import { buildSimklChunks, prepareSimklImport } from '@/src/utils/simklImport/prepare';
import { parseEpisodeLabel, parseSimklDate } from '@/src/utils/simklImport/values';
import { strToU8, zipSync } from 'fflate';
import { readFileSync } from 'fs';
import { join } from 'path';

// The server validator is imported to prove client chunks satisfy the real contract.
// (babel-jest hoists these mocks above the imports.)
jest.mock('firebase-admin', () => ({ firestore: jest.fn() }), { virtual: true });
jest.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: jest.fn() } }), {
  virtual: true,
});
jest.mock('firebase-functions/params', () => ({ defineSecret: () => ({ value: () => '' }) }), {
  virtual: true,
});
jest.mock(
  'firebase-functions/v2/https',
  () => jest.requireActual('../../__mocks__/firebase-functions-v2-https.js'),
  { virtual: true }
);

const FIXTURES = join(__dirname, '../fixtures/simkl');
/** The real backup was downloaded 2026-11-10 ~05:41 UTC. */
const NOW = Date.UTC(2026, 10, 11);
const at = (iso: string) => Date.parse(iso);

function file(name: string, contents: string | Uint8Array): PickedSimklFile {
  return { bytes: typeof contents === 'string' ? strToU8(contents) : contents, name };
}

function realBackup(): PickedSimklFile {
  return file(
    'SimklBackup.zip',
    new Uint8Array(readFileSync(join(FIXTURES, 'real-backup-2026/SimklBackup.zip')))
  );
}

function show(shows: FileImportShowEntity[], title: string): FileImportShowEntity {
  const found = shows.find((entity) => entity.title === title);
  if (!found) throw new Error(`no show ${title}`);
  return found;
}

function movie(movies: FileImportMovieEntity[], title: string): FileImportMovieEntity {
  const found = movies.find((entity) => entity.title === title);
  if (!found) throw new Error(`no movie ${title}`);
  return found;
}

function backupJson(data: unknown): string {
  return JSON.stringify(data);
}

/** A minimal Simkl row; `media` goes under `show` or `movie`. */
function row(
  mediaKey: 'show' | 'movie',
  media: Record<string, unknown>,
  fields: Record<string, unknown> = {}
) {
  return {
    added_to_watchlist_at: '2024-01-01T00:00:00Z',
    is_rewatch: false,
    last_watched_at: null,
    status: 'watching',
    user_rated_at: null,
    user_rating: null,
    watched_episodes_count: 0,
    total_episodes_count: 10,
    [mediaKey]: { year: 2020, ...media },
    ...fields,
  };
}

// ---------------------------------------------------------------------------
// The real backup (free test account, 2026-11-10)
// ---------------------------------------------------------------------------

describe('Simkl import — real SimklBackup.zip', () => {
  const prepared = () => prepareSimklImport([realBackup()], NOW);
  const parsed = () => {
    const found = readSimklExportFile([realBackup()]);
    return parseSimklBackupJson(found.text, NOW);
  };

  it('reads SimklBackup.json out of the ZIP', () => {
    expect(readSimklExportFile([realBackup()]).kind).toBe('json');
  });

  it('maps statuses, ratings and listed episodes', () => {
    const { shows } = parsed();

    expect(show(shows, 'Charmed')).toMatchObject({
      imdbId: 'tt0158552',
      plays: [],
      status: 'watchlist',
      tmdbId: 1981,
      tvdbId: 70626,
      year: 1998,
    });
    // Simkl's importer leaves user_rated_at null: the rating takes the last-watched date.
    expect(show(shows, 'The Walking Dead')).toMatchObject({
      rating: { ratedAt: at('2018-03-07T00:00:00Z'), value: 4 },
      status: 'dropped',
    });
    expect(show(shows, 'The Walking Dead').plays).toHaveLength(6);
    expect(show(shows, 'Game of Thrones')).toMatchObject({ status: 'watching' }); // hold
    expect(show(shows, 'The Office (US)')).toMatchObject({ status: 'dropped' }); // "not interesting"
    expect(show(shows, 'Doctor Who').plays).toHaveLength(16);
    expect(show(shows, 'Bridgerton')).toMatchObject({ plays: [], status: 'watching' });
  });

  it('keeps each episode date, and stamps "I don\'t remember" with the last-watched date', () => {
    const futurama = show(parsed().shows, 'Futurama');
    expect(futurama.plays.map((play) => [play.season, play.episode, play.watchedAt])).toEqual([
      [1, 1, at('2024-03-15T14:32:57Z')],
      [1, 2, at('2024-03-15T14:32:58Z')],
      [1, 3, at('2024-03-15T14:32:59Z')],
      [1, 4, at('2024-03-15T14:33:00Z')],
      [1, 5, at('2024-03-15T14:33:01Z')],
      [1, 6, at('2026-11-10T05:39:00Z')], // was 1970-01-01T00:00:01Z
      [1, 7, at('2026-11-10T05:39:00Z')],
      [1, 8, at('1999-05-11T11:00:00Z')],
    ]);
    expect(futurama).toMatchObject({ rating: { value: 8 }, status: 'watching', tmdbId: 615 });
  });

  it('turns completed entries without an episode list into "watched up to" (all)', () => {
    expect(show(parsed().shows, 'Breaking Bad')).toMatchObject({
      plays: [],
      rating: { value: 10 },
      status: 'up_to_date',
      watchedThrough: { kind: 'all' },
      watchedThroughAt: at('2019-10-05T00:00:00Z'),
    });
  });

  it('maps anime: entry numbering, ids-less cours, extras and anime movies', () => {
    const { movies, shows, stats } = parsed();

    expect(show(shows, 'One Piece')).toMatchObject({
      anime: { entryEpisodeTotal: 1184, groupedEntries: 1 },
      tmdbId: 37854,
    });
    expect(show(shows, 'One Piece').plays).toHaveLength(120);
    expect(show(shows, 'One Piece').plays.at(-1)).toMatchObject({ episode: 120, season: 1 });
    expect(show(shows, 'Cowboy Bebop')).toMatchObject({
      anime: { entryEpisodeTotal: 26, groupedEntries: 1 },
      watchedThrough: { kind: 'all' },
      watchedThroughAt: at('2022-12-24T00:00:00Z'),
    });
    expect(show(shows, 'Shingeki no Kyojin')).toMatchObject({
      anime: { entryEpisodeTotal: 25, groupedEntries: 1 },
      tmdbId: 1429,
    });
    // Season 3 Part 2 carries only anime-site ids: resolved by romaji title + year, or not at all.
    const season3 = show(shows, 'Shingeki no Kyojin Season 3');
    expect(season3).toMatchObject({ imdbId: null, tvdbId: null, year: 2019 });
    expect(season3.tmdbId).toBeUndefined();
    expect(season3.plays).toHaveLength(3);

    expect(movie(movies, 'Kimi no Na wa.')).toMatchObject({
      rating: { value: 9 },
      tmdbId: 372058,
      tvdbId: null,
      watches: [at('2022-02-14T00:00:00Z')],
    });
    expect(stats.ignored).toMatchObject({ anime_extras: 1 }); // the OAD
  });

  it('maps movies, never sending TVDB movie ids', () => {
    const { movies, stats } = parsed();

    expect(movie(movies, 'The Godfather')).toMatchObject({
      rating: { value: 10 },
      tmdbId: 238,
      tvdbId: null,
      watches: [at('1985-06-01T00:00:00Z')], // old dates are real
    });
    expect(movie(movies, 'Terminator 3: Rise of the Machines')).toMatchObject({
      watches: [],
      watchlist: true, // movies can be on hold
    });
    expect(movie(movies, 'Interstellar')).toMatchObject({ watches: [], watchlist: true });
    expect(movies.find((entity) => entity.title === 'Pulp Fiction')).toBeUndefined();
    expect(stats.ignored).toMatchObject({ dropped_movies: 1 });
    expect(movies.every((entity) => entity.tvdbId === null)).toBe(true);
  });

  it('summarizes the file for the preview', () => {
    // 7 anime entries: the OAD is ignored and Your Name is a movie, leaving 5 anime shows.
    expect(prepared().summary).toEqual({
      anime: 5,
      episodes: 156,
      movieWatches: 6,
      movies: 8,
      ratings: 9,
      shows: 15,
      summaryOnlyShows: 3,
      watchlist: 3,
    });
    expect(prepared().stats).toMatchObject({
      ignored: { anime_extras: 1, dropped_movies: 1, summary_only_episodes: 3 },
      skipped: {},
    });
  });

  it('builds chunks the server validator accepts', () => {
    const { chunks } = prepared();
    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach((chunk, index) => {
      expect(() =>
        parseFileImportChunk({
          ...chunk,
          importId: 'import-1234',
          ...(index === chunks.length - 1 ? { final: true } : {}),
        })
      ).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// The real 2020 capture (made without per-episode dates)
// ---------------------------------------------------------------------------

describe('Simkl import — real 2020 capture without episode dates', () => {
  const parsed = () =>
    parseSimklBackupJson(readFileSync(join(FIXTURES, 'real-api-2020/all_items.json'), 'utf8'), NOW);

  it('treats every listed episode as watched, stamped with the last-watched date', () => {
    const { shows } = parsed();
    const bigBang = show(shows, 'The Big Bang Theory');
    expect(bigBang.plays).toHaveLength(279);
    expect(bigBang.plays.every((play) => play.watchedAt === at('2020-07-25T10:45:37Z'))).toBe(true);
    expect(show(shows, "It's Always Sunny in Philadelphia").plays).toHaveLength(153);
    expect(show(shows, 'The Office (US)').plays).toHaveLength(1);
  });

  it('handles empty watching shows, completed shows without episodes, and extra id keys', () => {
    const { movies, shows, stats } = parsed();
    expect(shows).toHaveLength(58);
    expect(
      shows.filter((entity) => entity.status === 'watching' && entity.plays.length === 0)
    ).toHaveLength(54);
    expect(show(shows, 'The Americans')).toMatchObject({
      status: 'up_to_date',
      watchedThrough: { kind: 'all' },
      watchedThroughAt: at('2018-05-30T00:00:00Z'),
    });
    expect(show(shows, 'The 100')).toMatchObject({
      imdbId: 'tt2661044',
      tmdbId: 48866,
      tvdbId: 268592,
    });
    expect(movies).toHaveLength(59);
    expect(movie(movies, 'Terminator 3: Rise of the Machines')).toMatchObject({ watchlist: true });
    expect(stats.ignored).toEqual({ summary_only_episodes: 1 });
  });

  it('builds chunks the server validator accepts', () => {
    const { movies, showWeights, shows } = parsed();
    for (const chunk of buildSimklChunks(shows, movies, showWeights)) {
      expect(() => parseFileImportChunk({ ...chunk, importId: 'import-1234' })).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases the real files don't cover
// ---------------------------------------------------------------------------

describe('Simkl import — edge cases', () => {
  it('merges VIP rewatch rows into the main entry (episodes and movie watches)', () => {
    const { movies, shows } = parseSimklBackupJson(
      backupJson({
        movies: [
          row(
            'movie',
            { ids: { simkl: 9, tmdb: 238 }, title: 'The Godfather' },
            { last_watched_at: '2001-01-01T00:00:00Z', status: 'completed' }
          ),
          row(
            'movie',
            { ids: { simkl: 9, tmdb: 238 }, title: 'The Godfather' },
            { is_rewatch: true, last_watched_at: '2020-05-05T00:00:00Z', status: 'completed' }
          ),
        ],
        shows: [
          row(
            'show',
            { ids: { simkl: 1, tmdb: '1399' }, title: 'Game of Thrones' },
            {
              seasons: [
                { episodes: [{ number: 1, watched_at: '2015-01-01T00:00:00Z' }], number: 1 },
              ],
              watched_episodes_count: 1,
            }
          ),
          row(
            'show',
            { ids: { simkl: 1, tmdb: '1399' }, title: 'Game of Thrones' },
            {
              is_rewatch: true,
              seasons: [
                { episodes: [{ number: 1, watched_at: '2026-05-16T14:02:10Z' }], number: 1 },
              ],
              watched_episodes_count: 1,
            }
          ),
        ],
      }),
      NOW
    );

    expect(shows).toHaveLength(1);
    expect(shows[0].plays.map((play) => play.watchedAt)).toEqual([
      at('2015-01-01T00:00:00Z'),
      at('2026-05-16T14:02:10Z'),
    ]);
    expect(movies[0].watches).toEqual([at('2001-01-01T00:00:00Z'), at('2020-05-05T00:00:00Z')]);
  });

  it('drops unwatched listed episodes when more are listed than watched, and keeps TVDB episode ids', () => {
    const { shows } = parseSimklBackupJson(
      backupJson({
        shows: [
          row(
            'show',
            { ids: { simkl: 2, tvdb: 153021 }, title: 'The Walking Dead' },
            {
              last_watched_at: '2024-02-02T00:00:00Z',
              seasons: [
                {
                  episodes: [
                    { ids: { tvdb_id: 3254641 }, number: 1, watched_at: '2024-02-01T00:00:00Z' },
                    { number: 2 },
                    { number: 3 },
                  ],
                  number: 1,
                },
              ],
              watched_episodes_count: 1,
            }
          ),
        ],
      }),
      NOW
    );

    expect(shows[0].plays).toEqual([
      { episode: 1, season: 1, tvdbEpisodeId: 3254641, watchedAt: at('2024-02-01T00:00:00Z') },
    ]);
  });

  it('uses last_watched for a summary-only entry, and adds "all" to a completed entry with a partial list', () => {
    const { shows, stats } = parseSimklBackupJson(
      backupJson({
        shows: [
          row(
            'show',
            { ids: { simkl: 3, tmdb: 615 }, title: 'Futurama' },
            {
              last_watched: 'S08E02',
              last_watched_at: '2026-05-04T19:40:59Z',
              watched_episodes_count: 126,
            }
          ),
          row(
            'show',
            { ids: { simkl: 4, tmdb: 1396 }, title: 'Breaking Bad' },
            {
              last_watched_at: '2019-10-05T00:00:00Z',
              seasons: [
                { episodes: [{ number: 1, watched_at: '2019-01-01T00:00:00Z' }], number: 1 },
              ],
              status: 'completed',
              watched_episodes_count: 62,
            }
          ),
          // Specials label: no usable "through" point.
          row(
            'show',
            { ids: { simkl: 5, tmdb: 7 }, title: 'Specials Only' },
            { last_watched: 'S00E03', watched_episodes_count: 3 }
          ),
        ],
      }),
      NOW
    );

    expect(show(shows, 'Futurama')).toMatchObject({
      watchedThrough: { episode: 2, kind: 'through', season: 8 },
      watchedThroughAt: at('2026-05-04T19:40:59Z'),
    });
    expect(show(shows, 'Breaking Bad')).toMatchObject({ watchedThrough: { kind: 'all' } });
    expect(show(shows, 'Breaking Bad').plays).toHaveLength(1);
    expect(show(shows, 'Specials Only').watchedThrough).toBeUndefined();
    expect(stats.ignored.summary_only_episodes).toBe(2);
  });

  it('groups anime cours that share a TMDB id, at show level only', () => {
    const { shows } = parseSimklBackupJson(
      backupJson({
        anime: [
          row(
            'show',
            { ids: { simkl: 39687, tmdb: '1429' }, title: 'Shingeki no Kyojin' },
            {
              anime_type: 'tv',
              last_watched_at: '2021-06-20T00:00:00Z',
              seasons: [
                { episodes: [{ number: 1, watched_at: '2021-06-20T00:00:00Z' }], number: 1 },
              ],
              status: 'completed',
              watched_episodes_count: 1,
            }
          ),
          row(
            'show',
            { ids: { simkl: 931899, tmdb: '1429' }, title: 'Shingeki no Kyojin Season 3 Part 2' },
            {
              anime_type: 'tv',
              seasons: [
                { episodes: [{ number: 1, watched_at: '2022-01-01T00:00:00Z' }], number: 1 },
              ],
              status: 'watching',
              user_rating: 9,
              watched_episodes_count: 1,
            }
          ),
        ],
      }),
      NOW
    );

    expect(shows).toHaveLength(1);
    expect(shows[0]).toMatchObject({
      anime: { entryEpisodeTotal: null, groupedEntries: 2 },
      rating: { value: 9 },
      status: 'watching', // from the entry with the latest activity
      tmdbId: 1429,
    });
    expect(shows[0].plays).toHaveLength(2);
    expect(shows[0].watchedThrough).toBeUndefined();
  });

  it('skips rows without any identifier, malformed episodes, and completed movies without a date', () => {
    const { movies, shows, stats } = parseSimklBackupJson(
      backupJson({
        movies: [
          row(
            'movie',
            { ids: { simkl: 7 }, title: 'Dateless' },
            { added_to_watchlist_at: null, status: 'completed' }
          ),
          row('movie', { ids: {}, title: '' }, { status: 'plantowatch' }),
        ],
        shows: [
          row(
            'show',
            { ids: { simkl: 8, tmdb: 9 }, title: 'Odd Episodes' },
            {
              last_watched_at: '2024-01-01T00:00:00Z',
              seasons: [
                {
                  episodes: [{ number: 'x' }, { number: 2, watched_at: '2024-01-01T00:00:00Z' }],
                  number: 1,
                },
              ],
              watched_episodes_count: 2,
            }
          ),
        ],
      }),
      NOW
    );

    expect(show(shows, 'Odd Episodes').plays).toHaveLength(1);
    expect(movies).toEqual([]);
    expect(stats.skipped).toEqual({ invalid_date: 1, malformed_row: 1, missing_identifiers: 1 });
  });

  it('treats an empty library as no history and other JSON as an unknown format', () => {
    expect(() => parseSimklBackupJson('{}', NOW)).toThrow(
      expect.objectContaining({ code: 'no_history' })
    );
    expect(() => parseSimklBackupJson('{"shows": []}', NOW)).toThrow(
      expect.objectContaining({ code: 'no_history' })
    );
    expect(() => parseSimklBackupJson('{"watched": []}', NOW)).toThrow(
      expect.objectContaining({ code: 'unknown_format' })
    );
    expect(() => parseSimklBackupJson('{not json', NOW)).toThrow(
      expect.objectContaining({ code: 'unreadable_file' })
    );
  });
});

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

describe('Simkl import — picking files', () => {
  const SECRET = 'FIXTURE-SECRET-MUST-NOT-BE-READ';
  const minimal = backupJson({
    movies: [
      row(
        'movie',
        { ids: { simkl: 1, tmdb: 603 }, title: 'The Matrix' },
        { status: 'plantowatch' }
      ),
    ],
  });

  it('finds SimklBackup.json in a nested folder, by content, and never reads other entries', () => {
    const zip = zipSync({
      'backup/SimklBackup.json': strToU8(minimal),
      'backup/profile.json': strToU8(JSON.stringify({ email: SECRET })),
    });
    // Saved without an extension (Simkl serves the ZIP as text/json).
    const prepared = prepareSimklImport([file('download', zip)], NOW);
    expect(prepared.summary.movies).toBe(1);
    expect(JSON.stringify(prepared)).not.toContain(SECRET);
  });

  it('accepts the loose JSON file, with or without a BOM', () => {
    expect(readSimklExportFile([file('SimklBackup.json', `﻿${minimal}`)]).kind).toBe('json');
  });

  it('recognizes a Simkl CSV but leaves it for phase 2', () => {
    const csv = readFileSync(join(FIXTURES, 'source/simkl-official-import-sample.csv'), 'utf8');
    expect(readSimklExportFile([file('export.csv', csv)]).kind).toBe('csv');
    expect(() => prepareSimklImport([file('export.csv', csv)], NOW)).toThrow(
      expect.objectContaining({ code: 'csv_not_supported' })
    );
  });

  it.each([
    [
      [
        file(
          'tv-time-export.zip',
          zipSync({ 'tracking-prod-records-v2.csv': strToU8('key,s_id\n') })
        ),
      ],
      'tvtime_export',
    ],
    [[file('trakt.zip', zipSync({ 'watched-shows.json': strToU8('[]') }))], 'trakt_export'],
    [[file('notes.txt', 'hello')], 'unknown_format'],
    [[], 'empty'],
    [[file('broken.zip', new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))], 'unreadable_zip'],
  ])('explains unusable picks (%#)', (files, code) => {
    expect(() => readSimklExportFile(files as PickedSimklFile[])).toThrow(
      expect.objectContaining({ code })
    );
  });

  it('refuses files over the size cap before reading them', () => {
    const huge = {
      bytes: { byteLength: SIMKL_MAX_EXPORT_BYTES + 1 } as Uint8Array,
      name: 'SimklBackup.zip',
    };
    expect(() => readSimklExportFile([huge])).toThrow(SimklImportError);
  });
});

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

describe('Simkl import — chunking', () => {
  const baseShow = (
    title: string,
    playCount: number,
    extra: Partial<FileImportShowEntity> = {}
  ): FileImportShowEntity => ({
    addedAt: NOW - 1,
    favorite: false,
    imdbId: null,
    lists: [],
    plays: Array.from({ length: playCount }, (_, index) => ({
      episode: (index % 100) + 1,
      season: Math.floor(index / 100) + 1,
      watchedAt: NOW - 1000 + index,
    })),
    rating: null,
    status: 'watching',
    title,
    tmdbId: 1000 + playCount,
    tvdbId: null,
    ...extra,
  });

  it('respects the entity and play limits, and splits a long show with "watched up to" on part 0 only', () => {
    const long = baseShow('Long', 1600, {
      watchedThrough: { kind: 'all' },
      watchedThroughAt: NOW - 5,
    });
    const shows = [
      long,
      ...Array.from({ length: 20 }, (_, index) => baseShow(`Show ${index}`, 10)),
    ];
    const chunks = buildSimklChunks(shows, [], [1700, ...shows.slice(1).map(() => 10)]);

    for (const chunk of chunks) {
      expect(chunk.shows.length + chunk.movies.length).toBeLessThanOrEqual(
        FILE_IMPORT_MAX_ENTITIES_PER_CHUNK
      );
      expect(
        chunk.shows.reduce((total, entity) => total + entity.plays.length, 0)
      ).toBeLessThanOrEqual(FILE_IMPORT_MAX_PLAYS_PER_CHUNK);
      expect(() => parseFileImportChunk({ ...chunk, importId: 'import-1234' })).not.toThrow();
    }
    const parts = chunks
      .flatMap((chunk) => chunk.shows)
      .filter((entity) => entity.title === 'Long');
    expect(parts.map((part) => part.part)).toEqual([
      { index: 0, total: 2 },
      { index: 1, total: 2 },
    ]);
    expect(parts[0].watchedThrough).toEqual({ kind: 'all' });
    expect(parts[1].watchedThrough).toBeUndefined();
  });

  it('gives heavy "watched up to" shows their own chunks by expected episodes', () => {
    const shows = [baseShow('A', 0), baseShow('B', 0), baseShow('C', 0)];
    const chunks = buildSimklChunks(shows, [], [1000, 1000, 10]);
    expect(chunks.map((chunk) => chunk.shows.map((entity) => entity.title))).toEqual([
      ['A'],
      ['B', 'C'],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

describe('Simkl import — values', () => {
  it('parses dates, treating the 1970 "I don\'t remember" placeholder and future dates as missing', () => {
    expect(parseSimklDate('2024-03-15T14:32:57Z', NOW)).toBe(at('2024-03-15T14:32:57Z'));
    expect(parseSimklDate('1985-06-01T00:00:00Z', NOW)).toBe(at('1985-06-01T00:00:00Z'));
    expect(parseSimklDate('2024-03-15T10:32:57-04:00', NOW)).toBe(at('2024-03-15T14:32:57Z'));
    expect(parseSimklDate('1970-01-01T00:00:01Z', NOW)).toBeNull();
    expect(parseSimklDate('2030-01-01T00:00:00Z', NOW)).toBeNull();
    expect(parseSimklDate('2024-02-30T00:00:00Z', NOW)).toBeNull();
    expect(parseSimklDate(null, NOW)).toBeNull();
  });

  it('parses episode labels', () => {
    expect(parseEpisodeLabel('S04E08')).toEqual({ episode: 8, season: 4 });
    expect(parseEpisodeLabel('E120')).toEqual({ episode: 120, season: 1 });
    expect(parseEpisodeLabel('s1e2')).toEqual({ episode: 2, season: 1 });
    expect(parseEpisodeLabel('S00E03')).toBeNull();
    expect(parseEpisodeLabel('pilot')).toBeNull();
  });
});
