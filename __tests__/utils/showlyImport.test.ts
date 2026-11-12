import {
  FILE_IMPORT_MAX_ENTITIES_PER_CHUNK,
  FILE_IMPORT_MAX_PLAYS_PER_CHUNK,
  type FileImportMovieEntity,
  type FileImportShowEntity,
} from '@/functions/src/shared/fileImport';
import { parseFileImportChunk } from '@/functions/src/fileImport/core';
import {
  SHOWLY_MAX_EXPORT_BYTES,
  ShowlyImportError,
  type PickedShowlyFile,
} from '@/src/utils/showlyImport/files';
import { parseShowlyBackup } from '@/src/utils/showlyImport/parse';
import { buildShowlyChunks, prepareShowlyImport } from '@/src/utils/showlyImport/prepare';
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

const FIXTURES = join(__dirname, '../fixtures/showly');
/** The real export was made 2026-11-12T06:13:35.601Z. */
const NOW = Date.UTC(2026, 10, 12, 7);
const at = (iso: string) => Date.parse(iso);

function file(name: string, contents: string | Uint8Array): PickedShowlyFile {
  return { bytes: typeof contents === 'string' ? strToU8(contents) : contents, name };
}

function realExport(): PickedShowlyFile {
  return file(
    'showly_export.json',
    new Uint8Array(readFileSync(join(FIXTURES, 'real-v2-small/showly_export.json')))
  );
}

function byTmdb<T extends FileImportShowEntity | FileImportMovieEntity>(
  entities: T[],
  tmdbId: number
): T {
  const found = entities.find((entity) => entity.tmdbId === tmdbId);
  if (!found) throw new Error(`no entity with TMDB id ${tmdbId}`);
  return found;
}

/** A v2 backup, written the way Showly's exporter writes it (nulls left out). */
function backup(overrides: {
  version?: number;
  createdAt?: string;
  shows?: Record<string, unknown>;
  movies?: Record<string, unknown>;
  lists?: unknown[];
}): string {
  return JSON.stringify({
    version: overrides.version ?? 2,
    platform: 'android',
    createdAt: overrides.createdAt ?? '2026-11-12T06:00:00Z',
    shows: {
      cH: [],
      cW: [],
      cHid: [],
      pEp: [],
      pSe: [],
      pP: [],
      pOH: [],
      rS: [],
      rSe: [],
      rEp: [],
      ...overrides.shows,
    },
    movies: { cH: [], cW: [], cHid: [], pP: [], rM: [], ...overrides.movies },
    lists: { l: overrides.lists ?? [] },
  });
}

const showRow = (id: number, tmId: number, t: string, a = '2024-01-01T00:00:00Z', u = a) => ({
  a,
  id,
  t,
  tmId,
  u,
});
const movieRow = (id: number, tmId: number, t: string, a = '2024-02-01T00:00:00Z') => ({
  a,
  id,
  t,
  tmId,
});
const episodeRow = (sId: number, stmId: number, sN: number, eN: number, a?: string) => ({
  ...(a === undefined ? {} : { a }),
  eN,
  id: sId * 1000 + sN * 100 + eN,
  sId,
  sN,
  stmId,
});

describe('Showly import — the real export (2026-11-12)', () => {
  const prepared = () => prepareShowlyImport([realExport()], NOW);

  it('reads My Shows as following and the watchlist show as watchlist', () => {
    const { shows } = parseShowlyBackup(
      readFileSync(join(FIXTURES, 'real-v2-small/showly_export.json'), 'utf8'),
      NOW
    );

    expect(shows).toEqual([
      {
        addedAt: at('2026-11-12T06:08:24.343Z'),
        favorite: false,
        imdbId: null,
        lists: [],
        plays: [],
        rating: null,
        status: 'following',
        title: 'VisionQuest',
        tmdbId: 213375,
        tvdbId: null,
      },
      {
        addedAt: at('2026-11-12T06:08:28.199Z'),
        favorite: false,
        imdbId: null,
        lists: [],
        plays: [],
        rating: null,
        status: 'watchlist',
        title: 'Stick',
        tmdbId: 248830,
        tvdbId: null,
      },
    ]);
  });

  it('keeps watch dates, and replaces the one dated after the export with the export time', () => {
    const { movies } = parseShowlyBackup(readReal(), NOW);

    // Showly's "release date" option.
    expect(byTmdb(movies, 1368337).watches).toEqual([at('2026-07-17T01:00:00Z')]);
    expect(byTmdb(movies, 1423191).watches).toEqual([at('2026-11-12T06:09:11.023Z')]);
    // Other Mommy is dated 2026-11-21, nine days after the export: kept, at the export time.
    expect(byTmdb(movies, 1400837).watches).toEqual([at('2026-11-12T06:13:35.601Z')]);
  });

  it('turns list-only movies into title-less entities carrying their TMDB id and lists', () => {
    const { movies } = parseShowlyBackup(readReal(), NOW);

    expect(byTmdb(movies, 969681)).toEqual({
      addedAt: at('2026-11-12T06:09:45.418Z'),
      favorite: false,
      imdbId: null,
      lists: [
        {
          addedAt: at('2026-11-12T06:10:20.294Z'),
          description: 'description for showly list',
          name: 'showly list 2',
        },
        {
          addedAt: at('2026-11-12T06:09:45.418Z'),
          description: 'showlt 1 list description',
          name: 'showly 1',
        },
      ],
      rating: null,
      title: '',
      tmdbId: 969681,
      tvdbId: null,
      watches: [],
      watchlist: false,
      year: null,
    });
    expect(byTmdb(movies, 1003596).lists).toEqual([
      {
        addedAt: at('2026-11-12T06:10:25.495Z'),
        description: 'description for showly list',
        name: 'showly list 2',
      },
    ]);
    expect(movies).toHaveLength(6);
  });

  it('summarizes the file and reports nothing skipped', () => {
    const result = prepared();

    expect(result.summary).toEqual({
      customLists: 2,
      dropped: 0,
      emptyLists: 0,
      episodes: 0,
      following: 1,
      movieWatchlist: 0,
      ratings: 0,
      showWatchlist: 1,
      watchedMovies: 3,
    });
    expect(result.stats.skipped).toEqual({});
    expect(result.stats.ignored).toEqual({});
  });

  it('builds chunks the server accepts', () => {
    const result = prepared();

    expect(result.chunks).toHaveLength(1);
    for (const chunk of result.chunks) {
      expect(() => parseFileImportChunk({ importId: 'import-1234', ...chunk })).not.toThrow();
    }
  });
});

describe('Showly import — shows and episodes', () => {
  it('applies section precedence: My Shows, then watchlist, then hidden', () => {
    const { shows } = parseShowlyBackup(
      backup({
        shows: {
          cH: [showRow(1, 1396, 'Breaking Bad')],
          cW: [showRow(1, 1396, 'Breaking Bad'), showRow(2, 1399, 'Game of Thrones')],
          cHid: [showRow(2, 1399, 'Game of Thrones'), showRow(3, 60059, 'Better Call Saul')],
        },
      }),
      NOW
    );

    expect(shows.map((show) => [show.tmdbId, show.status])).toEqual([
      [1396, 'following'],
      [1399, 'watchlist'],
      [60059, 'dropped'],
    ]);
  });

  it('dates episodes, falling back to the show date, and never to the epoch placeholder', () => {
    const { shows, stats } = parseShowlyBackup(
      backup({
        shows: {
          cH: [
            showRow(1, 1396, 'Breaking Bad', '2024-01-01T00:00:00Z', '2024-03-01T00:00:00Z'),
            // Showly's "no date" placeholder in `u`, as in the real export.
            showRow(2, 1399, 'Game of Thrones', '2024-01-05T00:00:00Z', '1970-01-01T00:00:00Z'),
          ],
          pEp: [
            episodeRow(1, 1396, 1, 1, '2024-02-01T10:00:00.123Z'),
            episodeRow(1, 1396, 1, 2), // no `a` key
            episodeRow(2, 1399, 1, 1, '1969-12-31T23:59:59.999Z'), // the -1 default
          ],
        },
      }),
      NOW
    );

    expect(byTmdb(shows, 1396).plays).toEqual([
      { episode: 1, season: 1, watchedAt: at('2024-02-01T10:00:00.123Z') },
      { episode: 2, season: 1, watchedAt: at('2024-03-01T00:00:00Z') },
    ]);
    // `u` is the placeholder, so `a` is used.
    expect(byTmdb(shows, 1399).plays).toEqual([
      { episode: 1, season: 1, watchedAt: at('2024-01-05T00:00:00Z') },
    ]);
    expect(stats.skipped).toEqual({});
  });

  it('keeps one play per episode, with the latest date', () => {
    const { shows, stats } = parseShowlyBackup(
      backup({
        shows: {
          cH: [showRow(1, 1396, 'Breaking Bad')],
          pEp: [
            episodeRow(1, 1396, 1, 1, '2024-02-01T00:00:00Z'),
            episodeRow(1, 1396, 1, 1, '2024-05-01T00:00:00Z'),
          ],
        },
      }),
      NOW
    );

    expect(byTmdb(shows, 1396).plays).toEqual([
      { episode: 1, season: 1, watchedAt: at('2024-05-01T00:00:00Z') },
    ]);
    expect(stats.ignored).toEqual({ duplicate_plays: 1 });
  });

  it('sends specials (season 0) as they are, and sorts plays', () => {
    const { shows } = parseShowlyBackup(
      backup({
        shows: {
          cH: [showRow(1, 1396, 'Breaking Bad')],
          pEp: [
            episodeRow(1, 1396, 2, 1, '2024-02-03T00:00:00Z'),
            episodeRow(1, 1396, 0, 1, '2024-02-01T00:00:00Z'),
            episodeRow(1, 1396, 1, 3, '2024-02-02T00:00:00Z'),
          ],
        },
      }),
      NOW
    );

    expect(byTmdb(shows, 1396).plays.map((play) => [play.season, play.episode])).toEqual([
      [0, 1],
      [1, 3],
      [2, 1],
    ]);
  });

  it('imports episodes of a show that is in no section (v2 carries its TMDB id)', () => {
    const { shows } = parseShowlyBackup(
      backup({
        shows: {
          cH: [showRow(1, 1396, 'Breaking Bad')],
          pEp: [episodeRow(9, 4607, 1, 1, '2024-02-01T00:00:00Z')],
        },
      }),
      NOW
    );

    expect(byTmdb(shows, 4607)).toMatchObject({ status: null, title: '', tmdbId: 4607 });
    expect(byTmdb(shows, 4607).plays).toHaveLength(1);
  });

  it('counts malformed episodes and leaves the rest', () => {
    const { shows, stats } = parseShowlyBackup(
      backup({
        shows: {
          cH: [showRow(1, 1396, 'Breaking Bad')],
          pEp: [
            episodeRow(1, 1396, 1, 1, '2024-02-01T00:00:00Z'),
            { ...episodeRow(1, 1396, 1, 2), eN: 'two' },
            { ...episodeRow(1, 1396, -1, 3) },
            'not an object',
          ],
        },
      }),
      NOW
    );

    expect(byTmdb(shows, 1396).plays).toHaveLength(1);
    expect(stats.skipped).toEqual({ malformed_row: 3 });
  });

  it('falls back to a title search when a show has no TMDB id', () => {
    const { shows } = parseShowlyBackup(
      backup({ shows: { cH: [showRow(1, -1, 'Some Obscure Show')] } }),
      NOW
    );

    expect(shows).toHaveLength(1);
    expect(shows[0].tmdbId).toBeUndefined();
    expect(shows[0].title).toBe('Some Obscure Show');
  });

  it('merges the same show listed under two Trakt ids', () => {
    const { shows } = parseShowlyBackup(
      backup({
        shows: {
          cH: [showRow(1, 1396, 'Breaking Bad')],
          cW: [showRow(77, 1396, 'Breaking Bad')],
          pEp: [
            episodeRow(1, 1396, 1, 1, '2024-02-01T00:00:00Z'),
            episodeRow(77, 1396, 1, 2, '2024-02-02T00:00:00Z'),
          ],
        },
      }),
      NOW
    );

    expect(shows).toHaveLength(1);
    expect(shows[0]).toMatchObject({ status: 'following', tmdbId: 1396 });
    expect(shows[0].plays).toHaveLength(2);
  });
});

describe('Showly import — v1 backups', () => {
  it('joins episodes and list items to their TMDB ids through Trakt ids', () => {
    const v1 = JSON.stringify({
      version: 1,
      shows: {
        cH: [showRow(1, 1396, 'Breaking Bad')],
        pEp: [
          { a: '2024-02-01T00:00:00Z', eN: 1, id: 5, sId: 1, sN: 1 },
          { a: '2024-02-01T00:00:00Z', eN: 1, id: 6, sId: 999, sN: 1 }, // orphan
        ],
      },
      movies: { cH: [movieRow(10, 27205, 'Inception')] },
      lists: {
        l: [
          {
            c: '2024-01-01T00:00:00Z',
            id: 1,
            ic: 2,
            it: [
              {
                c: '2024-01-02T00:00:00Z',
                id: 1,
                l: '2024-01-02T00:00:00Z',
                lId: 1,
                r: 1,
                t: 'movie',
                tId: 10,
                u: '2024-01-02T00:00:00Z',
              },
              {
                c: '2024-01-02T00:00:00Z',
                id: 2,
                l: '2024-01-02T00:00:00Z',
                lId: 1,
                r: 2,
                t: 'movie',
                tId: 555,
                u: '2024-01-02T00:00:00Z',
              },
            ],
            n: 'Favourites',
            p: 'private',
            sId: '',
            u: '2024-01-02T00:00:00Z',
          },
        ],
      },
    });

    const { movies, shows, stats } = parseShowlyBackup(v1, NOW);

    expect(byTmdb(shows, 1396).plays).toEqual([
      { episode: 1, season: 1, watchedAt: at('2024-02-01T00:00:00Z') },
    ]);
    expect(byTmdb(movies, 27205).lists).toEqual([
      { addedAt: at('2024-01-02T00:00:00Z'), name: 'Favourites' },
    ]);
    // The orphan episode and the list item with an unknown Trakt id.
    expect(stats.skipped).toEqual({ missing_identifiers: 2 });
  });
});

describe('Showly import — movies', () => {
  it('drops a watched movie from the watchlist and counts hidden movies', () => {
    const { movies, stats } = parseShowlyBackup(
      backup({
        movies: {
          cH: [movieRow(10, 27205, 'Inception')],
          cW: [movieRow(10, 27205, 'Inception'), movieRow(11, 157336, 'Interstellar')],
          cHid: [movieRow(12, 680, 'Pulp Fiction'), movieRow(10, 27205, 'Inception')],
          pP: [10],
        },
      }),
      NOW
    );

    expect(byTmdb(movies, 27205)).toMatchObject({
      watches: [at('2024-02-01T00:00:00Z')],
      watchlist: false,
    });
    expect(byTmdb(movies, 157336)).toMatchObject({ watches: [], watchlist: true });
    expect(movies.find((movie) => movie.tmdbId === 680)).toBeUndefined();
    expect(stats.ignored).toEqual({ hidden_movies: 2, pinned_items: 1 });
  });

  it('uses the export time for a watch with a placeholder date', () => {
    const { movies } = parseShowlyBackup(
      backup({
        createdAt: '2026-11-12T06:00:00Z',
        movies: { cH: [movieRow(10, 27205, 'Inception', '1970-01-01T00:00:00Z')] },
      }),
      NOW
    );

    expect(byTmdb(movies, 27205).watches).toEqual([at('2026-11-12T06:00:00Z')]);
  });

  it('judges future dates against the export, not today', () => {
    // An old backup: a watch dated after it was made is wrong, though it's in the past now.
    const { movies } = parseShowlyBackup(
      backup({
        createdAt: '2020-01-01T00:00:00Z',
        movies: { cH: [movieRow(10, 27205, 'Inception', '2020-01-10T00:00:00Z')] },
      }),
      NOW
    );

    expect(byTmdb(movies, 27205).watches).toEqual([at('2020-01-01T00:00:00Z')]);
  });
});

describe('Showly import — ratings', () => {
  it('imports show and movie ratings and fills a -1 TMDB id through the Trakt id', () => {
    const { movies, shows, stats } = parseShowlyBackup(
      backup({
        shows: {
          cH: [showRow(1, 1396, 'Breaking Bad')],
          rS: [
            { id: 1, r: 9, rA: '2024-04-01T00:00:00Z', tmId: -1 },
            { id: 2, r: 7, rA: '2024-04-01T00:00:00Z', tmId: 1399 },
            { id: 3, r: 7, rA: '2024-04-01T00:00:00Z', tmId: -1 }, // unknown
            { id: 4, r: 11, rA: '2024-04-01T00:00:00Z', tmId: 60059 }, // out of range
          ],
        },
        movies: { rM: [{ id: 10, r: 6, tmId: 27205 }] }, // no rA
      }),
      NOW
    );

    expect(byTmdb(shows, 1396).rating).toEqual({ ratedAt: at('2024-04-01T00:00:00Z'), value: 9 });
    expect(byTmdb(shows, 1399)).toMatchObject({ rating: { value: 7 }, status: null, title: '' });
    expect(byTmdb(movies, 27205).rating).toEqual({ ratedAt: at('2026-11-12T06:00:00Z'), value: 6 });
    expect(stats.skipped).toEqual({ malformed_row: 1, missing_identifiers: 1 });
    expect(stats.ignored).toEqual({});
  });

  it('imports season and episode ratings, joined to the show by Trakt id when needed', () => {
    const { shows, stats } = parseShowlyBackup(
      backup({
        shows: {
          cH: [showRow(1, 1396, 'Breaking Bad', '2024-01-01T00:00:00Z')],
          rSe: [
            { id: 5, r: 8, rA: '2024-04-01T00:00:00Z', sId: 1, sN: 1, stmId: 1396 },
            { id: 6, r: 7, sId: 1, sN: 2, stmId: -1 }, // no rA, TMDB id via the Trakt id
            { id: 7, r: 9, rA: '2024-04-01T00:00:00Z', sId: 1, sN: -1, stmId: 1396 }, // unknown season
            { id: 8, r: 6, rA: '2024-05-01T00:00:00Z', sId: 1, sN: 1, stmId: 1396 }, // duplicate
          ],
          rEp: [
            { eN: 3, id: 9, r: 10, rA: '2024-04-02T00:00:00Z', sId: 1, sN: 1, stmId: 1396 },
            { eN: 1, id: 10, r: 4, rA: '2024-04-03T00:00:00Z', sId: 1, sN: 0, stmId: 1396 },
            { eN: -1, id: 11, r: 5, rA: '2024-04-03T00:00:00Z', sId: 1, sN: 1, stmId: 1396 },
            { eN: 1, id: 12, r: 5, rA: '2024-04-03T00:00:00Z', sId: 404, sN: 1, stmId: -1 },
          ],
        },
      }),
      NOW
    );

    expect(byTmdb(shows, 1396).seasonRatings).toEqual([
      { ratedAt: at('2024-04-01T00:00:00Z'), season: 1, value: 8 },
      { ratedAt: at('2024-01-01T00:00:00Z'), season: 2, value: 7 },
    ]);
    expect(byTmdb(shows, 1396).episodeRatings).toEqual([
      { episode: 1, ratedAt: at('2024-04-03T00:00:00Z'), season: 0, value: 4 },
      { episode: 3, ratedAt: at('2024-04-02T00:00:00Z'), season: 1, value: 10 },
    ]);
    expect(stats.skipped).toEqual({ malformed_row: 2, missing_identifiers: 1 });
  });

  it('counts a rated show as importable even with nothing else', () => {
    const { shows } = parseShowlyBackup(
      backup({ shows: { rEp: [{ eN: 1, id: 1, r: 8, sId: 3, sN: 1, stmId: 1396 }] } }),
      NOW
    );
    expect(shows).toHaveLength(1);
    expect(shows[0]).toMatchObject({ status: null, tmdbId: 1396 });
  });
});

describe('Showly import — values the server would reject', () => {
  it('counts out-of-range season and episode numbers as malformed instead of sending them', () => {
    const { shows, stats } = parseShowlyBackup(
      backup({
        shows: {
          cH: [showRow(1, 1396, 'Breaking Bad')],
          pEp: [
            episodeRow(1, 1396, 1, 10_001, '2024-02-01T00:00:00Z'),
            episodeRow(1, 1396, 10_001, 1, '2024-02-01T00:00:00Z'),
            episodeRow(1, 1396, 1, 10_000, '2024-02-01T00:00:00Z'),
          ],
        },
      }),
      NOW
    );

    expect(byTmdb(shows, 1396).plays.map((play) => play.episode)).toEqual([10_000]);
    expect(stats.skipped).toEqual({ malformed_row: 2 });
  });

  it('treats a TMDB id beyond the safe-integer range as missing', () => {
    const { movies, stats } = parseShowlyBackup(
      backup({
        movies: {
          cH: [movieRow(10, 1e20, ''), movieRow(11, 2 ** 53, 'Too Big')],
        },
      }),
      NOW
    );

    // The first has no other identifier; the second falls back to its title.
    expect(stats.skipped).toEqual({ missing_identifiers: 1 });
    expect(movies).toHaveLength(1);
    expect(movies[0]).toMatchObject({ title: 'Too Big' });
    expect(movies[0].tmdbId).toBeUndefined();
  });

  it('keeps every chunk inside the server limits for heavily rated shows', () => {
    const episodeRatings = Array.from({ length: 1600 }, (_, index) => ({
      eN: (index % 100) + 1,
      id: index,
      r: 8,
      rA: '2024-04-01T00:00:00Z',
      sId: 1,
      sN: Math.floor(index / 100) + 1,
      stmId: 1396,
    }));
    const result = prepareShowlyImport(
      [
        file(
          'showly_export.json',
          backup({
            shows: {
              cH: [showRow(1, 1396, 'Breaking Bad'), showRow(2, 1399, 'Game of Thrones')],
              rEp: [
                ...episodeRatings,
                { eN: 1, id: 9999, r: 7, rA: '2024-04-01T00:00:00Z', sId: 2, sN: 1, stmId: 1399 },
              ],
            },
          })
        ),
      ],
      NOW
    );

    // 100 over the per-show cap are counted, not sent.
    expect(result.stats.ignored).toEqual({ episode_ratings: 100 });
    for (const chunk of result.chunks) {
      expect(() => parseFileImportChunk({ importId: 'import-1234', ...chunk })).not.toThrow();
    }
  });
});

describe('Showly import — custom lists', () => {
  const list = (n: string, it: unknown[]) => ({
    c: '2024-01-01T00:00:00Z',
    id: 1,
    ic: 0, // stale in real exports
    it,
    n,
    p: 'private',
    sId: '',
    u: '2024-01-01T00:00:00Z',
  });
  const item = (t: string, tId: number, tmId: number, l = '2024-01-02T00:00:00Z') => ({
    c: l,
    id: tId,
    l,
    lId: 1,
    r: 1,
    t,
    tId,
    tmId,
    u: l,
  });

  it('attaches items to shows and movies, merges same-name lists, skips empty ones', () => {
    const parsed = parseShowlyBackup(
      backup({
        shows: { cH: [showRow(1, 1396, 'Breaking Bad')] },
        lists: [
          list('Crime', [item('show', 1, 1396), item('movie', 10, 680)]),
          list('crime ', [item('movie', 10, 680, '2023-12-01T00:00:00Z')]),
          list('Nothing yet', []),
          list('   ', [item('movie', 11, 27205)]),
          list('Mixed', [item('episode', 50, 62085), item('person', 51, 17419)]),
        ],
      }),
      NOW
    );

    expect(byTmdb(parsed.shows, 1396).lists).toEqual([
      { addedAt: at('2024-01-02T00:00:00Z'), name: 'Crime' },
    ]);
    expect(byTmdb(parsed.movies, 680).lists).toEqual([
      { addedAt: at('2023-12-01T00:00:00Z'), name: 'Crime' },
    ]);
    expect(byTmdb(parsed.movies, 27205).lists).toEqual([
      { addedAt: at('2024-01-02T00:00:00Z'), name: 'Showly list' },
    ]);
    expect(parsed.emptyLists).toBe(1);
    expect(parsed.customLists).toBe(2);
    expect(parsed.stats.ignored).toEqual({ non_media_list_items: 2 });
  });
});

describe('Showly import — list descriptions', () => {
  const listWith = (n: string, d: string | undefined, tmId: number) => ({
    c: '2024-01-01T00:00:00Z',
    ...(d === undefined ? {} : { d }),
    id: 1,
    ic: 1,
    it: [
      {
        c: '2024-01-02T00:00:00Z',
        id: 1,
        l: '2024-01-02T00:00:00Z',
        lId: 1,
        r: 1,
        t: 'movie',
        tId: tmId,
        tmId,
        u: '2024-01-02T00:00:00Z',
      },
    ],
    n,
    p: 'private',
    sId: '',
    u: '2024-01-01T00:00:00Z',
  });

  it('carries descriptions, trimmed and capped at 120 characters, and leaves out empty ones', () => {
    const { movies } = parseShowlyBackup(
      backup({
        lists: [
          listWith('Long', `  ${'x'.repeat(200)}  `, 680),
          listWith('Blank', '   ', 27205),
          listWith('None', undefined, 157336),
        ],
      }),
      NOW
    );

    expect(byTmdb(movies, 680).lists[0].description).toBe('x'.repeat(120));
    expect(byTmdb(movies, 27205).lists[0]).not.toHaveProperty('description');
    expect(byTmdb(movies, 157336).lists[0]).not.toHaveProperty('description');
  });

  it('keeps the first description when two lists share a name', () => {
    const { movies } = parseShowlyBackup(
      backup({ lists: [listWith('Crime', 'First', 680), listWith('crime', 'Second', 680)] }),
      NOW
    );

    expect(byTmdb(movies, 680).lists).toEqual([
      { addedAt: at('2024-01-02T00:00:00Z'), description: 'First', name: 'Crime' },
    ]);
  });
});

describe('Showly import — files', () => {
  const prepare = (picked: PickedShowlyFile[]) => () => prepareShowlyImport(picked, NOW);
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      return error instanceof ShowlyImportError ? error.code : String(error);
    }
    return null;
  };

  it.each([
    ['nothing picked', [], 'empty'],
    ['an empty file', [file('showly_export.json', '')], 'empty'],
    [
      'a ZIP',
      [file('showly.zip', zipSync({ 'showly_export.json': strToU8(backup({})) }))],
      'zip_not_supported',
    ],
    ['invalid JSON', [file('showly_export.json', '{"version":2,')], 'unreadable_file'],
    ['a Simkl backup', [file('SimklBackup.json', '{"shows":[],"movies":[]}')], 'simkl_export'],
    ['an empty object', [file('x.json', '{}')], 'unknown_format'],
    ['a Trakt export', [file('watched-shows.json', '[]')], 'trakt_export'],
    ['a TV Time export', [file('tracking-prod-records.csv', 'a,b')], 'tvtime_export'],
    ['a backup with nothing in it', [file('showly_export.json', backup({}))], 'no_history'],
  ])('refuses %s', (_label, picked, expected) => {
    expect(code(prepare(picked as PickedShowlyFile[]))).toBe(expected);
  });

  it('refuses files over the size cap', () => {
    const huge = {
      bytes: { byteLength: SHOWLY_MAX_EXPORT_BYTES + 1 } as Uint8Array,
      name: 'x.json',
    };
    expect(code(prepare([huge]))).toBe('too_large');
  });

  it('reads a renamed file with a BOM by its content', () => {
    const text = `﻿${backup({ shows: { cW: [showRow(1, 1396, 'Breaking Bad')] } })}`;
    const result = prepareShowlyImport([file('showly_export (1).txt', text)], NOW);
    expect(result.summary.showWatchlist).toBe(1);
  });

  it('parses an unknown future version that has the v2 sections', () => {
    const result = prepareShowlyImport(
      [file('showly_export.json', backup({ version: 3, shows: { cW: [showRow(1, 1396, 'X')] } }))],
      NOW
    );
    expect(result.summary.showWatchlist).toBe(1);
  });
});

describe('Showly import — chunking', () => {
  function longShow(tmdbId: number, seasons: number, perSeason: number): FileImportShowEntity {
    const plays = [];
    for (let season = 1; season <= seasons; season += 1) {
      for (let episode = 1; episode <= perSeason; episode += 1) {
        plays.push({ episode, season, watchedAt: at('2024-01-01T00:00:00Z') });
      }
    }
    return {
      addedAt: at('2024-01-01T00:00:00Z'),
      favorite: false,
      imdbId: null,
      lists: [{ addedAt: at('2024-01-01T00:00:00Z'), name: 'Soaps' }],
      plays,
      rating: { ratedAt: at('2024-01-01T00:00:00Z'), value: 8 },
      status: 'following',
      title: 'Long Show',
      tmdbId,
      tvdbId: null,
    };
  }

  it('splits a long show into parts that stay in order, with rating and lists on part 0 only', () => {
    const other = { ...longShow(2, 1, 900), title: 'Other' };
    const chunks = buildShowlyChunks([other, longShow(1, 8, 400)], []);

    const parts = chunks
      .flatMap((chunk) => chunk.shows)
      .filter((show) => show.tmdbId === 1)
      .map((show) => show.part);
    expect(parts).toEqual(
      Array.from({ length: parts.length }, (_, index) => ({ index, total: parts.length }))
    );
    expect(parts.length).toBeGreaterThan(1);

    const longParts = chunks.flatMap((chunk) => chunk.shows).filter((show) => show.tmdbId === 1);
    expect(longParts[0]).toMatchObject({ rating: { value: 8 }, status: 'following' });
    expect(longParts[0].lists).toHaveLength(1);
    for (const part of longParts.slice(1)) {
      expect(part).toMatchObject({ lists: [], rating: null, status: 'following' });
    }
    expect(longParts.reduce((total, part) => total + part.plays.length, 0)).toBe(3200);

    for (const chunk of chunks) {
      expect(chunk.shows.reduce((total, show) => total + show.plays.length, 0)).toBeLessThanOrEqual(
        FILE_IMPORT_MAX_PLAYS_PER_CHUNK
      );
      expect(() => parseFileImportChunk({ importId: 'import-1234', ...chunk })).not.toThrow();
    }
  });

  it('caps entities per chunk', () => {
    const movies = Array.from({ length: 40 }, (_, index) => ({
      addedAt: 1,
      favorite: false,
      imdbId: null,
      lists: [],
      rating: null,
      title: '',
      tmdbId: index + 1,
      tvdbId: null,
      watches: [1],
      watchlist: false,
      year: null,
    }));
    const chunks = buildShowlyChunks([], movies);
    expect(chunks.map((chunk) => chunk.movies.length)).toEqual([
      FILE_IMPORT_MAX_ENTITIES_PER_CHUNK,
      FILE_IMPORT_MAX_ENTITIES_PER_CHUNK,
      10,
    ]);
  });
});

function readReal(): string {
  return readFileSync(join(FIXTURES, 'real-v2-small/showly_export.json'), 'utf8');
}
