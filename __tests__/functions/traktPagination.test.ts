/**
 * Trakt API pagination, extended=progress handling and related transforms.
 */
jest.mock(
  'firebase-functions/params',
  () => jest.requireActual('./helpers/traktHarness').paramsModule,
  { virtual: true }
);
jest.mock(
  'firebase-functions/v2/https',
  () => jest.requireActual('./helpers/traktHarness').httpsModule,
  { virtual: true }
);
jest.mock(
  'firebase-functions/v2/tasks',
  () => jest.requireActual('./helpers/traktHarness').tasksModule,
  { virtual: true }
);
jest.mock(
  'firebase-admin/firestore',
  () => jest.requireActual('./helpers/traktHarness').firestoreModule,
  { virtual: true }
);
jest.mock(
  'firebase-admin/functions',
  () => jest.requireActual('./helpers/traktHarness').functionsModule,
  { virtual: true }
);
jest.mock(
  'firebase-admin',
  () => jest.requireActual('./helpers/traktHarness').firebaseAdminModule,
  { virtual: true }
);

import { __test__, runTraktSync } from '@/functions/src/trakt';
import {
  assertNoUndefined,
  firestoreFn,
  MockTimestamp,
  resetTraktMocks,
} from './helpers/traktHarness';

beforeEach(resetTraktMocks);

describe('Trakt sync Firestore sanitization', () => {
  describe('Post-June 30 2026 Trakt API Updates (Pagination & extended=progress)', () => {
    describe('toMillisOrNow helper', () => {
      it('returns numeric millis for valid ISO date strings', () => {
        const iso = '2026-07-15T10:30:00.000Z';
        const millis = __test__.toMillisOrNow(iso);
        expect(typeof millis).toBe('number');
        expect(millis).toBe(new Date(iso).getTime());
      });

      it('returns current millis when value is undefined, null, or empty string', () => {
        const before = Date.now();
        const millisNull = __test__.toMillisOrNow(null);
        const millisUndef = __test__.toMillisOrNow(undefined);
        const millisEmpty = __test__.toMillisOrNow('');
        const after = Date.now();

        for (const millis of [millisNull, millisUndef, millisEmpty]) {
          expect(typeof millis).toBe('number');
          expect(millis).toBeGreaterThanOrEqual(before);
          expect(millis).toBeLessThanOrEqual(after);
        }
      });

      it('returns current millis when value is an invalid date string', () => {
        const before = Date.now();
        const millis = __test__.toMillisOrNow('not-a-valid-date');
        const after = Date.now();

        expect(typeof millis).toBe('number');
        expect(millis).toBeGreaterThanOrEqual(before);
        expect(millis).toBeLessThanOrEqual(after);
      });
    });

    it('buildEpisodeTrackingDoc handles undefined seasons without throwing TypeError', () => {
      const showWithoutSeasons = {
        last_updated_at: '2026-07-01T00:00:00.000Z',
        last_watched_at: '2026-07-01T00:00:00.000Z',
        plays: 1,
        show: {
          ids: {
            slug: 'breaking-bad',
            tmdb: 1396,
            trakt: 1,
          },
          title: 'Breaking Bad',
          year: 2008,
        },
      };

      const result = __test__.buildEpisodeTrackingDoc(showWithoutSeasons as any);
      expect(result).not.toBeNull();
      expect(result?.showId).toBe('1396');
      expect(result?.metadata.tvShowName).toBe('Breaking Bad');
      expect(result?.episodes).toEqual({});
    });

    it('buildEpisodeTrackingDoc handles seasons with undefined episodes gracefully', () => {
      const showWithMalformedSeasons = {
        last_updated_at: '2026-07-01T00:00:00.000Z',
        last_watched_at: '2026-07-01T00:00:00.000Z',
        plays: 1,
        seasons: [
          {
            number: 1,
          },
        ],
        show: {
          ids: {
            slug: 'better-call-saul',
            tmdb: 60059,
            trakt: 2,
          },
          title: 'Better Call Saul',
          year: 2015,
        },
      };

      const result = __test__.buildEpisodeTrackingDoc(showWithMalformedSeasons as any);
      expect(result).not.toBeNull();
      expect(result?.showId).toBe('60059');
      expect(result?.episodes).toEqual({});
    });

    it('buildEpisodeTrackingDoc populates episodes when extended=progress data is present', () => {
      const showWithProgress = {
        last_updated_at: '2026-07-01T00:00:00.000Z',
        last_watched_at: '2026-07-01T00:00:00.000Z',
        plays: 5,
        seasons: [
          {
            episodes: [
              {
                last_watched_at: '2026-06-01T12:00:00.000Z',
                number: 1,
                plays: 1,
              },
              {
                last_watched_at: '2026-06-02T12:00:00.000Z',
                number: 2,
                plays: 2,
              },
            ],
            number: 1,
          },
          {
            episodes: [
              {
                last_watched_at: '2026-06-10T12:00:00.000Z',
                number: 1,
                plays: 1,
              },
            ],
            number: 2,
          },
        ],
        show: {
          ids: {
            slug: 'severance',
            tmdb: 93405,
            trakt: 3,
          },
          title: 'Severance',
          year: 2022,
        },
      };

      const result = __test__.buildEpisodeTrackingDoc(showWithProgress as any);
      expect(result).not.toBeNull();
      expect(result?.showId).toBe('93405');
      expect(Object.keys(result?.episodes ?? {})).toEqual(['1_1', '1_2', '2_1']);
      expect(result?.episodes['1_1'].watched).toBe(true);
      expect(result?.episodes['1_2'].watched).toBe(true);
      expect(result?.episodes['2_1'].watched).toBe(true);
    });

    it('buildEpisodeTrackingDoc reuses show-level last_watched_at or omits watchedAt when episode last_watched_at is missing/invalid', () => {
      const show = {
        last_updated_at: '2026-07-01T00:00:00.000Z',
        last_watched_at: '2026-05-01T12:00:00.000Z',
        plays: 2,
        seasons: [
          {
            episodes: [
              {
                number: 1,
                plays: 1,
              },
              {
                last_watched_at: 'invalid-date',
                number: 2,
                plays: 1,
              },
            ],
            number: 1,
          },
        ],
        show: {
          ids: {
            slug: 'severance',
            tmdb: 93405,
            trakt: 3,
          },
          title: 'Severance',
          year: 2022,
        },
      };

      const result = __test__.buildEpisodeTrackingDoc(show as any);
      expect(result).not.toBeNull();
      const episodes = (result?.episodes ?? {}) as any;
      expect(episodes['1_1'].watched).toBe(true);
      expect(episodes['1_1'].watchedAt.toMillis()).toBe(new Date('2026-05-01T12:00:00.000Z').getTime());
      expect(episodes['1_2'].watched).toBe(true);
      expect(episodes['1_2'].watchedAt.toMillis()).toBe(new Date('2026-05-01T12:00:00.000Z').getTime());

      const showWithoutShowWatchedAt = {
        ...show,
        last_watched_at: undefined,
      };
      const result2 = __test__.buildEpisodeTrackingDoc(showWithoutShowWatchedAt as any);
      const episodes2 = (result2?.episodes ?? {}) as any;
      expect(episodes2['1_1'].watched).toBe(true);
      expect(episodes2['1_1'].watchedAt).toBeUndefined();
    });

    it('traktPaginatedRequest fetches and combines multiple pages using pagination headers', async () => {
      const page1Items = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `Item ${i + 1}` }));
      const page2Items = Array.from({ length: 25 }, (_, i) => ({ id: i + 101, name: `Item ${i + 101}` }));

      (global.fetch as jest.Mock).mockImplementation((input: any) => {
        const url = String(input);
        if (url.includes('page=1')) {
          return Promise.resolve({
            headers: {
              get: (header: string) => {
                const lower = header.toLowerCase();
                if (lower === 'x-pagination-page') return '1';
                if (lower === 'x-pagination-limit') return '100';
                if (lower === 'x-pagination-page-count') return '2';
                if (lower === 'x-pagination-item-count') return '125';
                return null;
              },
            },
            json: jest.fn().mockResolvedValue(page1Items),
            ok: true,
            status: 200,
          });
        }

        if (url.includes('page=2')) {
          return Promise.resolve({
            headers: {
              get: (header: string) => {
                const lower = header.toLowerCase();
                if (lower === 'x-pagination-page') return '2';
                if (lower === 'x-pagination-limit') return '100';
                if (lower === 'x-pagination-page-count') return '2';
                if (lower === 'x-pagination-item-count') return '125';
                return null;
              },
            },
            json: jest.fn().mockResolvedValue(page2Items),
            ok: true,
            status: 200,
          });
        }

        throw new Error(`Unexpected URL: ${url}`);
      });

      const results = await __test__.traktPaginatedRequest<any>({
        accessToken: 'test-token',
        endpoint: '/sync/watched/movies',
      });

      expect(results).toHaveLength(125);
      expect(results[0].id).toBe(1);
      expect(results[124].id).toBe(125);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('traktPaginatedRequest warns when totalPages exceeds MAX_PAGINATION_PAGES', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          headers: {
            get: (h: string) => (h.toLowerCase() === 'x-pagination-page-count' ? '75' : null),
          },
          json: jest.fn().mockResolvedValue([{ id: 1 }]),
          ok: true,
          status: 200,
        })
      );

      await __test__.traktPaginatedRequest<any>({
        accessToken: 'test-token',
        endpoint: '/sync/watched/movies',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Total pages reported (75) exceeds MAX_PAGINATION_PAGES (50) for endpoint /sync/watched/movies')
      );
      expect(global.fetch).toHaveBeenCalledTimes(50);

      warnSpy.mockRestore();
    });

    it('traktPaginatedRequest warns when x-pagination-page-count is missing or invalid', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        headers: {
          get: () => null,
        },
        json: jest.fn().mockResolvedValue([{ id: 1 }]),
        ok: true,
        status: 200,
      });

      await __test__.traktPaginatedRequest<any>({
        accessToken: 'test-token',
        endpoint: '/sync/watched/movies',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Missing x-pagination-page-count header for endpoint /sync/watched/movies')
      );

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        headers: {
          get: (h: string) => (h.toLowerCase() === 'x-pagination-page-count' ? 'not-a-number' : null),
        },
        json: jest.fn().mockResolvedValue([{ id: 1 }]),
        ok: true,
        status: 200,
      });

      await __test__.traktPaginatedRequest<any>({
        accessToken: 'test-token',
        endpoint: '/sync/watched/movies',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid x-pagination-page-count header "not-a-number" for endpoint /sync/watched/movies')
      );

      warnSpy.mockRestore();
    });

    it('traktRequestRaw throws TraktSyncError when response is 200 OK but JSON parsing fails', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        headers: {
          get: () => null,
        },
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON at position 0')),
        ok: true,
        status: 200,
      });

      await expect(
        __test__.traktRequestRaw({
          accessToken: 'test-token',
          endpoint: '/sync/watched/movies',
        })
      ).rejects.toMatchObject({
        category: 'upstream_unavailable',
        message: 'Trakt returned an invalid JSON response.',
        retryable: true,
      });
    });

    it('enrichEpisodeTracking handles missing or non-array seasonData.episodes gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        headers: {
          get: () => null,
        },
        json: jest.fn().mockResolvedValue({
          episodes: null,
        }),
        ok: true,
        status: 200,
      });

      const result = await __test__.enrichEpisodeTracking(99, {
        '1_1': { watched: true },
      });

      expect(result['1_1']).toEqual({ watched: true });
    });

    it('transformRating and transformFavorite strip undefined fields', () => {
      const ratingWithUndefined = __test__.transformRating({
        movie: {
          ids: { slug: 'movie-slug', tmdb: 100, trakt: 200 },
          title: undefined as any,
          year: 2024,
        },
        rated_at: '2024-01-01T00:00:00.000Z',
        rating: 8,
        type: 'movie',
      });
      expect(ratingWithUndefined).toBeDefined();
      expect('title' in (ratingWithUndefined ?? {})).toBe(false);

      const favWithUndefined = __test__.transformFavorite({
        id: 1,
        listed_at: '2024-01-01T00:00:00.000Z',
        movie: {
          ids: { slug: 'movie-slug', tmdb: 100, trakt: 200 },
          title: undefined as any,
          year: 2024,
        },
        rank: 1,
        type: 'movie',
      });
      expect(favWithUndefined).toBeDefined();
      expect('title' in (favWithUndefined ?? {})).toBe(false);
    });

    it('end-to-end mirror sync succeeds with >100 items watch history and captures all items and episode progress', async () => {
      const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
      const batchCommit = jest.fn().mockResolvedValue(undefined);
      const listSet = jest.fn().mockResolvedValue(undefined);
      const episodeTrackingSet = jest.fn().mockResolvedValue(undefined);
      const requestedWatchedShowUrls: string[] = [];

      // Generate 120 watched movies across 2 pages
      const moviesPage1 = Array.from({ length: 100 }, (_, i) => ({
        last_updated_at: '2026-07-01T00:00:00.000Z',
        last_watched_at: '2026-07-01T00:00:00.000Z',
        movie: {
          ids: { slug: `movie-${i + 1}`, tmdb: 1000 + i + 1, trakt: 2000 + i + 1 },
          title: `Movie ${i + 1}`,
          year: 2020 + (i % 5),
        },
        plays: 1,
      }));
      const moviesPage2 = Array.from({ length: 20 }, (_, i) => ({
        last_updated_at: '2026-07-01T00:00:00.000Z',
        last_watched_at: '2026-07-01T00:00:00.000Z',
        movie: {
          ids: { slug: `movie-${i + 101}`, tmdb: 1000 + i + 101, trakt: 2000 + i + 101 },
          title: `Movie ${i + 101}`,
          year: 2024,
        },
        plays: 1,
      }));

      // Generate 5 watched shows with extended=progress season/episode data
      const watchedShows = [
        {
          last_updated_at: '2026-07-01T00:00:00.000Z',
          last_watched_at: '2026-07-01T00:00:00.000Z',
          plays: 10,
          seasons: [
            {
              episodes: [
                { last_watched_at: '2026-06-01T00:00:00.000Z', number: 1, plays: 1 },
                { last_watched_at: '2026-06-02T00:00:00.000Z', number: 2, plays: 1 },
              ],
              number: 1,
            },
            {
              episodes: [
                { last_watched_at: '2026-06-15T00:00:00.000Z', number: 1, plays: 1 },
              ],
              number: 2,
            },
          ],
          show: {
            ids: { slug: 'mega-show-1', tmdb: 5001, trakt: 6001 },
            title: 'Mega Show 1',
            year: 2021,
          },
        },
        {
          // Show with undefined seasons (defensive check)
          last_updated_at: '2026-07-01T00:00:00.000Z',
          last_watched_at: '2026-07-01T00:00:00.000Z',
          plays: 1,
          show: {
            ids: { slug: 'mega-show-2', tmdb: 5002, trakt: 6002 },
            title: 'Mega Show 2',
            year: 2022,
          },
        },
      ];

      const episodeTrackingCollection = {
        doc: jest.fn((id: string) => ({
          id,
          path: `users/user-1/episode_tracking/${id}`,
          set: episodeTrackingSet,
        })),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };

      const listsCollection = {
        doc: jest.fn((id: string) => ({
          get: jest.fn().mockResolvedValue({ data: () => undefined, exists: false }),
          id,
          path: `users/user-1/lists/${id}`,
          set: listSet,
        })),
        get: jest.fn().mockResolvedValue({ docs: [] }),
      };

      const userRef = {
        collection: jest.fn((name: string) => {
          if (name === 'traktSyncRuns') {
            return {
              doc: jest.fn((id: string) => ({ id, path: `users/user-1/traktSyncRuns/${id}` })),
            };
          }
          if (name === 'traktEnrichmentRuns') {
            return {
              doc: jest.fn((id = 'enrich-1') => ({ id, path: `users/user-1/traktEnrichmentRuns/${id}` })),
            };
          }
          if (name === 'lists') {
            return listsCollection;
          }
          if (name === 'episode_tracking') {
            return episodeTrackingCollection;
          }
          if (name === 'ratings') {
            return { get: jest.fn().mockResolvedValue({ docs: [] }) };
          }
          throw new Error(`Unexpected collection ${name}`);
        }),
        get: jest.fn().mockResolvedValue({
          data: () => ({
            traktAccessToken: 'test-token',
            traktConnected: true,
            traktSyncStatus: { runId: 'run-1' },
            traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
          }),
          exists: true,
        }),
        path: 'users/user-1',
      };

      firestoreFn.mockImplementation(() => ({
        batch: jest.fn(() => ({
          commit: batchCommit,
          delete: jest.fn(),
          set: batchSet,
        })),
        collection: jest.fn((name: string) => {
          if (name !== 'users') throw new Error(`Unexpected collection ${name}`);
          return { doc: jest.fn(() => userRef) };
        }),
        runTransaction: jest.fn().mockResolvedValue({
          kind: 'active',
          status: { runId: 'enrich-1', status: 'in_progress' },
          userData: {},
        }),
      }));

      (global.fetch as jest.Mock).mockImplementation((input: any) => {
        const url = String(input);

        if (url.includes('/users/settings')) {
          return Promise.resolve({
            json: jest.fn().mockResolvedValue({
              user: { ids: { slug: 'tester' }, name: 'Tester', private: false, username: 'tester', vip: false, vip_ep: false },
            }),
            ok: true,
            status: 200,
          });
        }

        if (url.includes('/sync/last_activities')) {
          return Promise.resolve({
            json: jest.fn().mockResolvedValue({}),
            ok: true,
            status: 200,
          });
        }

        if (url.includes('/sync/watched/movies')) {
          if (url.includes('page=2')) {
            return Promise.resolve({
              headers: {
                get: (h: string) => (h.toLowerCase() === 'x-pagination-page-count' ? '2' : null),
              },
              json: jest.fn().mockResolvedValue(moviesPage2),
              ok: true,
              status: 200,
            });
          }
          return Promise.resolve({
            headers: {
              get: (h: string) => (h.toLowerCase() === 'x-pagination-page-count' ? '2' : null),
            },
            json: jest.fn().mockResolvedValue(moviesPage1),
            ok: true,
            status: 200,
          });
        }

        if (url.includes('/sync/watched/shows')) {
          requestedWatchedShowUrls.push(url);
          return Promise.resolve({
            headers: {
              get: (h: string) => (h.toLowerCase() === 'x-pagination-page-count' ? '1' : null),
            },
            json: jest.fn().mockResolvedValue(watchedShows),
            ok: true,
            status: 200,
          });
        }

        if (url.includes('/sync/ratings') || url.includes('/sync/watchlist') || url.includes('/sync/favorites') || url.includes('/users/tester/lists')) {
          return Promise.resolve({
            headers: {
              get: () => '1',
            },
            json: jest.fn().mockResolvedValue([]),
            ok: true,
            status: 200,
          });
        }

        if (url.includes('api.themoviedb.org')) {
          return Promise.resolve({
            json: jest.fn().mockResolvedValue({ id: 5001, name: 'Show' }),
            ok: true,
            status: 200,
          });
        }

        throw new Error(`Unexpected fetch URL ${url}`);
      });

      await expect(
        (runTraktSync as any)({
          data: { runId: 'run-1', userId: 'user-1' },
          retryCount: 0,
          retryReason: undefined,
        })
      ).resolves.toBeUndefined();

      // Verify extended=progress was requested on all watched-show requests
      expect(requestedWatchedShowUrls.length).toBeGreaterThan(0);
      requestedWatchedShowUrls.forEach((url) => {
        expect(url).toContain('extended=progress');
      });

      // Verify sync completed with all 120 movies + 2 shows = 122 total items and 3 episodes
      const completedWrite = batchSet.mock.calls
        .map(([_ref, data]) => ('traktSyncStatus' in data ? data.traktSyncStatus : data))
        .find((data) => data?.status === 'completed') as any;

      expect(completedWrite).toBeDefined();
      expect(completedWrite.status).toBe('completed');
      expect(completedWrite.itemsSynced.movies).toBe(120);
      expect(completedWrite.itemsSynced.shows).toBe(2);
      expect(completedWrite.itemsSynced.episodes).toBe(3);

      // Verify already-watched list contains all 120 movies + 2 shows
      const alreadyWatchedCall = listSet.mock.calls.find(
        ([data]) => data?.id === 'already-watched'
      );
      expect(alreadyWatchedCall).toBeDefined();
      const alreadyWatchedItems = alreadyWatchedCall[0].items;
      expect(Object.keys(alreadyWatchedItems)).toHaveLength(122);
    });
  });
});
