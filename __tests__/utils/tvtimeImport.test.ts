import {
  TVTIME_IMPORT_MAX_ENTITIES_PER_CHUNK,
  TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK,
} from '@/functions/src/shared/tvtimeImport';
import { parseTvTimeImportChunk } from '@/functions/src/tvtimeImport';
import { readTvTimeExportFiles, type PickedTvTimeFile } from '@/src/utils/tvtimeImport/files';
import {
  buildTvTimeChunks,
  parseTvTimeEntries,
  prepareTvTimeImport,
} from '@/src/utils/tvtimeImport/prepare';
import { parseTvTimeDate } from '@/src/utils/tvtimeImport/values';
import { strToU8, zipSync } from 'fflate';
import { readdirSync, readFileSync } from 'fs';
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

const FIXTURES = join(__dirname, '../fixtures/tvtime');
const EXPECTED = JSON.parse(readFileSync(join(FIXTURES, 'expected.json'), 'utf8'));
/** The fixtures were exported 2026-07-01. */
const NOW = Date.UTC(2026, 6, 2);
const FORMATS = ['gdpr', 'gdpr-minimal', 'refract', 'liberator', 'extractor'] as const;
const SECRET = 'FIXTURE-SECRET-MUST-NOT-BE-READ';

function looseFiles(
  format: string,
  filter: (name: string) => boolean = () => true
): PickedTvTimeFile[] {
  return readdirSync(join(FIXTURES, format))
    .filter(filter)
    .map((name) => ({ bytes: new Uint8Array(readFileSync(join(FIXTURES, format, name))), name }));
}

function zipOf(files: PickedTvTimeFile[], name: string, prefix = ''): PickedTvTimeFile {
  return {
    bytes: zipSync(Object.fromEntries(files.map((file) => [`${prefix}${file.name}`, file.bytes]))),
    name,
  };
}

function parse(files: PickedTvTimeFile[]) {
  return parseTvTimeEntries(readTvTimeExportFiles(files), NOW);
}

/** Project parser output onto expected.json's shape. */
function normalize(format: string, result: ReturnType<typeof parse>) {
  const shows = result.shows
    .map((show) => ({
      distinctEpisodes: new Set(show.plays.map((play) => `${play.season}:${play.episode}`)).size,
      favorite: show.favorite,
      imdbId: show.imdbId,
      lists: show.lists.map((list) => list.name).sort(),
      plays: show.plays.length,
      rating: show.rating?.value ?? null,
      status: show.status,
      title: show.title,
      tvdbId: show.tvdbId,
    }))
    .sort((a, b) => (a.tvdbId ?? 0) - (b.tvdbId ?? 0));

  const movies = result.movies
    .map((movie) => ({
      ...(format === 'gdpr' ? { altTitle: movie.altTitle } : {}),
      ...(format === 'extractor' ? { tmdbId: movie.tmdbId ?? null } : {}),
      favorite: movie.favorite,
      imdbId: movie.imdbId,
      lists: movie.lists.map((list) => list.name).sort(),
      rating: movie.rating?.value ?? null,
      title: movie.title,
      tvdbId: movie.tvdbId,
      watches: movie.watches.length,
      watchlist: movie.watchlist,
      year: movie.year,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    clientIgnored: result.stats.ignored,
    clientSkipped: result.stats.skipped,
    movies,
    shows,
  };
}

describe('TV Time export parsing — fixtures', () => {
  it.each(FORMATS)('recovers the expected library from the %s export', (format) => {
    const result = parse(looseFiles(format));
    expect(result.format).toBe(format === 'gdpr-minimal' ? 'gdpr' : format);
    expect(normalize(format, result)).toEqual(EXPECTED[format]);
  });

  it('reads a GDPR ZIP that nests everything in a folder', () => {
    const zipped = parse([zipOf(looseFiles('gdpr'), 'tvtime-gdpr-data.zip', 'gdpr-data/')]);
    expect(normalize('gdpr', zipped)).toEqual(EXPECTED.gdpr);
  });

  it('never decodes GDPR account files, so secrets cannot reach a payload', () => {
    const zip = zipOf(looseFiles('gdpr'), 'export.zip', 'gdpr-data/');
    const entries = readTvTimeExportFiles([zip]);

    expect(entries.map((entry) => entry.name)).not.toEqual(
      expect.arrayContaining(['access_token.csv', 'auth-prod-login.csv', 'gdpr_requests.csv'])
    );
    expect(JSON.stringify(entries)).not.toContain(SECRET);
    expect(JSON.stringify(prepareTvTimeImport([zip], NOW))).not.toContain(SECRET);
  });

  it('gives the same Refract result from CSV only, JSON only, or both', () => {
    const plays = (result: ReturnType<typeof parse>) =>
      result.shows.map((show) => [show.tvdbId, show.status, show.plays.length]).sort();
    const movieState = (result: ReturnType<typeof parse>) =>
      result.movies
        .map((movie) => [
          movie.title,
          movie.watches.length,
          movie.watchlist,
          movie.lists.map((list) => list.name).sort(),
        ])
        .sort();

    const both = parse(looseFiles('refract'));
    const csvOnly = parse(looseFiles('refract', (name) => name.endsWith('.csv')));
    const jsonOnly = parse(looseFiles('refract', (name) => name.endsWith('.json')));

    expect(plays(csvOnly)).toEqual(plays(both));
    expect(plays(jsonOnly)).toEqual(plays(both));
    expect(movieState(csvOnly)).toEqual(movieState(both));
    expect(movieState(jsonOnly)).toEqual(movieState(both));
    expect(both.stats.ignored).toEqual({}); // CSV+JSON overlap is not reported as duplicates
  });

  it('falls back to activity_history.csv when Liberator JSON is missing', () => {
    const fromJson = parse(looseFiles('liberator'));
    const fromCsv = parse(looseFiles('liberator', (name) => name === 'activity_history.csv'));
    const view = (result: ReturnType<typeof parse>) => ({
      movies: result.movies
        .map((m) => [m.title, m.watches.length, m.watchlist, m.rating?.value ?? null])
        .sort(),
      shows: result.shows.map((s) => [s.tvdbId, s.status, s.plays.length]).sort(),
    });

    expect(view(fromCsv)).toEqual(view(fromJson));
  });
});

describe('TV Time export parsing — edge cases', () => {
  const file = (name: string, text: string): PickedTvTimeFile => ({ bytes: strToU8(text), name });

  it('reads GDPR episodes from the v1 file when v2 is missing, without doubling them when present', () => {
    const withV2 = parse(looseFiles('gdpr'));
    const v1Only = parse(looseFiles('gdpr', (name) => name !== 'tracking-prod-records-v2.csv'));
    const rayDonovan = (result: ReturnType<typeof parse>) =>
      result.shows.find((show) => show.tvdbId === 259866)?.plays ?? [];

    expect(rayDonovan(v1Only)).toEqual([
      {
        episode: 1,
        season: 1,
        tvdbEpisodeId: 90569530,
        watchedAt: Date.UTC(2016, 7, 5, 16, 48, 22),
      },
    ]);
    // With v2 present the v1 copy is ignored, so the fixture totals stay as expected.
    expect(normalize('gdpr', withV2)).toEqual(EXPECTED.gdpr);
  });

  it('counts Data Extractor TV rows as unsupported episodes, not unreadable rows', () => {
    const header = 'type,media_type,tmdb_id,imdb_id,tvdb_id,title,year,season,episode,watched_at\n';
    const result = parse([
      file(
        'tv-time-export.csv',
        header +
          'watch,movie,27205,tt1375666,,Inception,2010,,,2018-03-10T20:00:00Z\n' +
          'watch,episode,,,,Lost,2004,1,1,2018-03-11T20:00:00Z\n' +
          'watch,,,,,,,,,\n'
      ),
    ]);

    expect(result.movies).toHaveLength(1);
    expect(result.stats.ignored).toEqual({ unsupported_episodes: 1 });
    expect(result.stats.skipped).toEqual({ malformed_row: 1 });
  });

  it('keeps a Liberator favorite movie that appears nowhere else in the export', () => {
    const favorites = JSON.stringify({
      movies: [{ id: { imdb: 'tt0110912', tvdb: null }, title: 'Pulp Fiction' }],
      shows: [],
    });
    const result = parse([
      ...looseFiles('liberator', (name) => name !== 'favorites.json'),
      file('favorites.json', favorites),
    ]);

    expect(result.movies.find((movie) => movie.imdbId === 'tt0110912')).toMatchObject({
      favorite: true,
      title: 'Pulp Fiction',
    });
  });

  it('keeps two same-titled films from one year apart when their ids differ', () => {
    const header = 'type,media_type,tmdb_id,imdb_id,tvdb_id,title,year,season,episode,watched_at\n';
    const result = parse([
      file(
        'tv-time-export.csv',
        header +
          'watch,movie,1001,tt0000001,,Twin,2020,,,2021-01-01T00:00:00Z\n' +
          'watch,movie,1002,tt0000002,,Twin,2020,,,2021-02-01T00:00:00Z\n'
      ),
    ]);

    expect(result.movies.map((movie) => movie.imdbId).sort()).toEqual(['tt0000001', 'tt0000002']);
  });
});

describe('TV Time export parsing — errors', () => {
  const error = (files: PickedTvTimeFile[]) => {
    try {
      prepareTvTimeImport(files, NOW);
    } catch (thrown) {
      return (thrown as { code?: string }).code;
    }
    return 'no error';
  };
  const file = (name: string, text: string): PickedTvTimeFile => ({ bytes: strToU8(text), name });

  it('explains archives with nothing to import', () => {
    expect(error([])).toBe('empty');
    expect(
      error([
        zipOf(
          looseFiles('gdpr', (n) => /access_token|auth-prod|gdpr_requests/.test(n)),
          'gdpr.zip'
        ),
      ])
    ).toBe('no_history');
    expect(error([zipOf([file('watched-history-1.json', '[]')], 'trakt.zip')])).toBe(
      'trakt_export'
    );
    expect(
      error([
        zipOf(
          looseFiles('refract', (n) => n.endsWith('.html')),
          'summary.zip'
        ),
      ])
    ).toBe('summary_only');
    expect(error([file('notes.csv', 'Title,Year\nExample,2000\n')])).toBe('unknown_format');
    expect(
      error([{ bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), name: 'broken.zip' }])
    ).toBe('unreadable_zip');
  });

  it('refuses to mix formats in one import', () => {
    expect(
      error([...looseFiles('extractor'), ...looseFiles('liberator', (n) => n === 'movies.json')])
    ).toBe('mixed_formats');
  });

  it('identifies a renamed GDPR tracking file by its header', () => {
    const [v2] = looseFiles('gdpr', (name) => name === 'tracking-prod-records-v2.csv');
    const result = parse([{ ...v2, name: 'my export.csv' }]);
    expect(result.format).toBe('gdpr');
    expect(result.shows.length).toBeGreaterThan(0);
  });
});

describe('TV Time chunking', () => {
  it('produces chunks the server validator accepts, for every format', () => {
    for (const format of FORMATS) {
      const prepared = prepareTvTimeImport(looseFiles(format), NOW);
      for (const chunk of prepared.chunks) {
        expect(() => parseTvTimeImportChunk({ importId: 'import-1234', ...chunk })).not.toThrow();
      }
    }
  });

  it('splits a very long show into parts within the limits and keeps every play once', () => {
    const plays = Array.from({ length: 3200 }, (_, index) => ({
      episode: (index % 50) + 1,
      season: Math.floor(index / 50) + 1,
      watchedAt: NOW - (3200 - index) * 3_600_000,
    }));
    const show = {
      addedAt: NOW - 1e10,
      favorite: true,
      imdbId: null,
      lists: [{ addedAt: NOW - 1e10, name: 'Anime' }],
      plays,
      rating: { ratedAt: NOW - 1e9, value: 10 },
      status: 'watching' as const,
      title: 'One Piece',
      tvdbId: 81797,
    };
    const movies = Array.from({ length: 40 }, (_, index) => ({
      addedAt: NOW - 1e9,
      favorite: false,
      imdbId: null,
      lists: [],
      rating: null,
      title: `Movie ${index}`,
      tvdbId: null,
      watches: [NOW - 1e9],
      watchlist: false,
      year: 2000,
    }));

    const chunks = buildTvTimeChunks([show], movies);
    const parts = chunks.flatMap((chunk) => chunk.shows);

    for (const chunk of chunks) {
      expect(chunk.shows.length + chunk.movies.length).toBeLessThanOrEqual(
        TVTIME_IMPORT_MAX_ENTITIES_PER_CHUNK
      );
      expect(chunk.shows.reduce((n, s) => n + s.plays.length, 0)).toBeLessThanOrEqual(
        TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK
      );
      expect(() => parseTvTimeImportChunk({ importId: 'import-1234', ...chunk })).not.toThrow();
    }
    expect(parts.map((part) => part.part)).toEqual([
      { index: 0, total: 3 },
      { index: 1, total: 3 },
      { index: 2, total: 3 },
    ]);
    // Parts are cut at season boundaries (50 plays per season here).
    expect(parts.every((part) => part.plays.length % 50 === 0)).toBe(true);
    expect(parts.flatMap((part) => part.plays)).toEqual(plays);
    expect(chunks.flatMap((chunk) => chunk.movies)).toHaveLength(40);
  });
});

describe('parseTvTimeDate', () => {
  it.each([
    ['2024-11-02 11:53:58', Date.UTC(2024, 10, 2, 11, 53, 58)],
    ['2025-05-13T00:37:58Z', Date.UTC(2025, 4, 13, 0, 37, 58)],
    ['2025-03-20T10:15:42.067614Z', Date.UTC(2025, 2, 20, 10, 15, 42, 67)],
    ['2024-09-13T10:50:29.147Z', Date.UTC(2024, 8, 13, 10, 50, 29, 147)],
    ['2024-01-01T02:00:00+02:00', Date.UTC(2024, 0, 1, 0, 0, 0)],
  ])('parses %s', (raw, expected) => {
    expect(parseTvTimeDate(raw, NOW)).toBe(expected);
  });

  it.each([
    '2016-02-30 21:00:00',
    '2024-01-01 10:75:00',
    '2024-01-01 24:00:00',
    '50663409-12-05 02:20:00',
    '0001-01-01',
    '1985-01-01',
    '2027-01-01',
    '',
    'banana',
  ])('rejects %s', (raw) => {
    expect(parseTvTimeDate(raw, NOW)).toBeNull();
  });
});
