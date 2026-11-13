/**
 * Trakt enrichment: queued runs, cooldowns, TMDB retries and skips, list document
 * relocation and season enrichment.
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

import {
  enrichMediaItem,
  enrichMediaItems,
  needsMediaEnrichment,
  planEnrichmentRelocation,
  runTraktEnrichment,
  runTraktSync,
  traktApi,
} from '@/functions/src/trakt';
import {
  assertNoUndefined,
  createResponse,
  DAY_MS,
  firestoreFn,
  mockEnqueue,
  MockTimestamp,
  resetTraktMocks,
} from './helpers/traktHarness';

beforeEach(resetTraktMocks);

describe('Trakt sync Firestore sanitization', () => {
  it('auto-queues post-sync enrichment without episode tracking scans', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const listsCollection = {
      doc: jest.fn((id: string) => ({
        id,
        path: `users/user-1/lists/${id}`,
        get: jest.fn().mockResolvedValue({
          data: () => undefined,
          exists: false,
        }),
        set: listSet,
      })),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktSyncRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktSyncRuns/${id}`,
            })),
          };
        }

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id = 'enrich-1') => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return listsCollection;
        }

        if (name === 'episode_tracking') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/episode_tracking/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'ratings') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/ratings/${id}`,
            })),
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktAccessToken: 'token',
          traktConnected: true,
          traktSyncStatus: {
            runId: 'run-1',
          },
          traktTokenExpiresAt: MockTimestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };
    const runTransaction = jest.fn().mockResolvedValue({
      kind: 'queued',
      status: {
        includeEpisodes: false,
        lists: ['already-watched', 'watchlist', 'favorites'],
        runId: 'enrich-1',
        userId: 'user-1',
      },
    });

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
        set: batchSet,
      })),
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
      runTransaction,
    }));

    (global.fetch as jest.Mock).mockImplementation((input: any) => {
      const url = String(input);

      if (url.includes('/users/settings')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue({
            user: {
              ids: {
                slug: 'tester',
              },
              name: 'Tester',
              private: false,
              username: 'tester',
              vip: false,
              vip_ep: false,
            },
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
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              last_updated_at: '2024-01-01T00:00:00.000Z',
              last_watched_at: '2024-01-01T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-1',
                  tmdb: 101,
                  trakt: 201,
                },
                title: 'Movie One',
                year: 2024,
              },
              plays: 1,
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/watchlist')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 1,
              listed_at: '2024-01-02T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-2',
                  tmdb: 102,
                  trakt: 202,
                },
                title: 'Movie Two',
                year: 2024,
              },
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (url.includes('/sync/favorites')) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([
            {
              id: 2,
              listed_at: '2024-01-03T00:00:00.000Z',
              movie: {
                ids: {
                  slug: 'movie-3',
                  tmdb: 103,
                  trakt: 203,
                },
                title: 'Movie Three',
                year: 2024,
              },
              type: 'movie',
            },
          ]),
          ok: true,
          status: 200,
        });
      }

      if (
        url.includes('/sync/watched/shows') ||
        url.includes('/sync/ratings') ||
        url.includes('/users/tester/lists')
      ) {
        return Promise.resolve({
          json: jest.fn().mockResolvedValue([]),
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

    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      {
        includeEpisodes: false,
        lists: ['already-watched', 'watchlist', 'favorites'],
        runId: 'enrich-1',
        userId: 'user-1',
      },
      expect.objectContaining({
        dispatchDeadlineSeconds: 1800,
        id: 'enrich-1',
      })
    );
  });

  it('returns an existing active enrichment run instead of creating a duplicate', async () => {
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => ({
        traktEnrichmentStatus: {
          attempt: 2,
          counts: {
            episodes: 0,
            items: 4,
            lists: 1,
          },
          includeEpisodes: true,
          lists: ['watchlist'],
          maxAttempts: 5,
          runId: 'enrich-1',
          status: 'retrying',
        },
      }),
    });
    const transactionSet = jest.fn();
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'lists') {
          return {
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id?: string) => ({
              id: id ?? 'enrich-1',
              path: `users/user-1/traktEnrichmentRuns/${id ?? 'enrich-1'}`,
            })),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
      runTransaction: jest.fn(async (callback: any) =>
        callback({
          get: transactionGet,
          set: transactionSet,
        })
      ),
    }));

    const response = createResponse();

    await (traktApi as any)(
      {
        body: { includeEpisodes: true },
        header: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer token' : undefined),
        method: 'POST',
        path: '/enrich',
      },
      response
    );

    expect(transactionSet).toHaveBeenCalledWith(
      userRef,
      expect.objectContaining({
        traktEnrichmentStatus: expect.objectContaining({
          pendingLists: expect.arrayContaining(['already-watched', 'watchlist', 'favorites']),
        }),
      }),
      { merge: true }
    );
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'enrich-1',
        status: 'retrying',
      })
    );
  });

  it('writes a 24-hour cooldown when queueing a new enrichment run', async () => {
    const frozenNow = Date.UTC(2026, 2, 25, 12, 0, 0);
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(frozenNow);
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => ({}),
    });
    const transactionSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'lists') {
          return {
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id?: string) => ({
              id: id ?? 'enrich-1',
              path: `users/user-1/traktEnrichmentRuns/${id ?? 'enrich-1'}`,
            })),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
      runTransaction: jest.fn(async (callback: any) =>
        callback({
          get: transactionGet,
          set: transactionSet,
        })
      ),
    }));

    const response = createResponse();

    try {
      await (traktApi as any)(
        {
          body: { includeEpisodes: true },
          header: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer token' : undefined),
          method: 'POST',
          path: '/enrich',
        },
        response
      );
    } finally {
      dateNowSpy.mockRestore();
    }

    const userStatusWriteCall = transactionSet.mock.calls.find(
      ([_ref, data]) => data && typeof data === 'object' && 'traktEnrichmentStatus' in data
    ) as [unknown, { traktEnrichmentStatus: Record<string, MockTimestamp> }] | undefined;

    expect(response.status).toHaveBeenCalledWith(202);
    expect(userStatusWriteCall?.[1].traktEnrichmentStatus).toBeDefined();
    expect(userStatusWriteCall?.[1].traktEnrichmentStatus.startedAt.toMillis()).toBe(frozenNow);
    expect(userStatusWriteCall?.[1].traktEnrichmentStatus.nextAllowedEnrichAt.toMillis()).toBe(
      frozenNow + DAY_MS
    );
  });

  it('keeps the manual enrichment cooldown after a completed run until the next allowed time', async () => {
    const futureCooldown = MockTimestamp.fromMillis(Date.now() + DAY_MS);
    const transactionGet = jest.fn().mockResolvedValue({
      data: () => ({
        traktEnrichmentStatus: {
          completedAt: MockTimestamp.fromMillis(Date.now() - 30_000),
          counts: {
            episodes: 0,
            items: 3,
            lists: 1,
          },
          includeEpisodes: true,
          lists: ['watchlist'],
          maxAttempts: 5,
          nextAllowedEnrichAt: futureCooldown,
          runId: 'completed-enrich-run',
          status: 'completed',
        },
      }),
    });
    const transactionSet = jest.fn();
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'lists') {
          return {
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id?: string) => ({
              id: id ?? 'enrich-1',
              path: `users/user-1/traktEnrichmentRuns/${id ?? 'enrich-1'}`,
            })),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
      runTransaction: jest.fn(async (callback: any) =>
        callback({
          get: transactionGet,
          set: transactionSet,
        })
      ),
    }));

    const response = createResponse();

    await (traktApi as any)(
      {
        body: { includeEpisodes: true },
        header: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer token' : undefined),
        method: 'POST',
        path: '/enrich',
      },
      response
    );

    expect(transactionSet).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCategory: 'rate_limited',
        nextAllowedEnrichAt: futureCooldown.toDate().toISOString(),
      })
    );
  });

  it('schedules a delayed enrichment retry when TMDB returns Retry-After', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listRef = {
      get: jest.fn().mockResolvedValue({
        data: () => ({
          items: {
            '1': {
              id: 1,
              media_type: 'movie',
              title: 'Movie',
            },
          },
          metadata: {
            needsEnrichment: true,
          },
        }),
        exists: true,
      }),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return {
            doc: jest.fn(() => listRef),
          };
        }

        if (name === 'episode_tracking') {
          return {
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktEnrichmentStatus: {
            runId: 'run-1',
          },
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
        set: batchSet,
      })),
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
    }));

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: (name: string) => (name.toLowerCase() === 'retry-after' ? '60' : null),
      },
      ok: false,
      status: 429,
    });

    await expect(
      (runTraktEnrichment as any)({
        data: { includeEpisodes: false, lists: ['watchlist'], runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: 'rate-limited',
      })
    ).resolves.toBeUndefined();

    expect(batchCommit).toHaveBeenCalledTimes(2);
    expect(listRef.set).not.toHaveBeenCalled();
    expect(mockEnqueue).toHaveBeenCalledWith(
      {
        includeEpisodes: false,
        lists: ['watchlist'],
        runId: 'run-1',
        userId: 'user-1',
      },
      expect.objectContaining({
        dispatchDeadlineSeconds: 1800,
        scheduleDelaySeconds: 60,
      })
    );
    expect(mockEnqueue.mock.calls[0][1]).not.toHaveProperty('id');

    const retryingWrite = batchSet.mock.calls
      .map(([_ref, data]) => ('traktEnrichmentStatus' in data ? data.traktEnrichmentStatus : data))
      .find((data) => data?.status === 'retrying') as Record<string, unknown> | undefined;

    expect(retryingWrite).toMatchObject({
      errorCategory: 'rate_limited',
      status: 'retrying',
    });
    expect(retryingWrite?.nextRetryAt).toBeDefined();
  });

  it('treats missing TMDB items as skips and still completes enrichment', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const listRef = {
      get: jest.fn().mockResolvedValue({
        data: () => ({
          items: {
            '1': {
              id: 1,
              media_type: 'movie',
              title: 'Movie',
            },
          },
          metadata: {
            needsEnrichment: true,
          },
        }),
        exists: true,
      }),
      set: listSet,
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return {
            doc: jest.fn(() => listRef),
          };
        }

        if (name === 'episode_tracking') {
          return {
            get: jest.fn().mockResolvedValue({ docs: [] }),
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktEnrichmentStatus: {
            runId: 'run-1',
          },
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
        set: batchSet,
      })),
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
    }));

    (global.fetch as jest.Mock).mockResolvedValue({
      headers: {
        get: () => null,
      },
      ok: false,
      status: 404,
    });

    await expect(
      (runTraktEnrichment as any)({
        data: { includeEpisodes: false, lists: ['watchlist'], runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    expect(listSet).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          needsEnrichment: false,
        }),
      }),
      { merge: true }
    );
    expect(batchCommit).toHaveBeenCalledTimes(2);
  });

  it('does not read episode tracking when includeEpisodes is false', async () => {
    const batchSet = jest.fn((_ref, data) => assertNoUndefined(data));
    const batchCommit = jest.fn().mockResolvedValue(undefined);
    const listSet = jest.fn().mockResolvedValue(undefined);
    const episodeTrackingGet = jest.fn().mockResolvedValue({ docs: [] });
    const listRef = {
      get: jest.fn().mockResolvedValue({
        data: () => ({
          items: {},
          metadata: {
            needsEnrichment: true,
          },
        }),
        exists: true,
      }),
      set: listSet,
    };
    const userRef = {
      collection: jest.fn((name: string) => {
        if (name === 'traktEnrichmentRuns') {
          return {
            doc: jest.fn((id: string) => ({
              id,
              path: `users/user-1/traktEnrichmentRuns/${id}`,
            })),
          };
        }

        if (name === 'lists') {
          return {
            doc: jest.fn(() => listRef),
          };
        }

        if (name === 'episode_tracking') {
          return {
            get: episodeTrackingGet,
          };
        }

        throw new Error(`Unexpected subcollection ${name}`);
      }),
      get: jest.fn().mockResolvedValue({
        data: () => ({
          traktEnrichmentStatus: {
            runId: 'run-1',
          },
        }),
        exists: true,
      }),
      path: 'users/user-1',
    };

    firestoreFn.mockImplementation(() => ({
      batch: jest.fn(() => ({
        commit: batchCommit,
        set: batchSet,
      })),
      collection: jest.fn((name: string) => {
        if (name !== 'users') {
          throw new Error(`Unexpected collection ${name}`);
        }

        return {
          doc: jest.fn(() => userRef),
        };
      }),
    }));

    await expect(
      (runTraktEnrichment as any)({
        data: { includeEpisodes: false, lists: ['watchlist'], runId: 'run-1', userId: 'user-1' },
        retryCount: 0,
        retryReason: undefined,
      })
    ).resolves.toBeUndefined();

    expect(episodeTrackingGet).not.toHaveBeenCalled();
    expect(listSet).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          needsEnrichment: false,
        }),
      }),
      { merge: true }
    );
    expect(batchCommit).toHaveBeenCalledTimes(2);
  });
});

describe('Trakt list item enrichment', () => {
  it('only treats never-enriched items as needing TMDB data', () => {
    expect(needsMediaEnrichment({ id: 1, media_type: 'movie', title: 'From Trakt' })).toBe(true);
    expect(
      needsMediaEnrichment({ id: 1, media_type: 'movie', poster_path: null, vote_average: 0 })
    ).toBe(false);
    expect(needsMediaEnrichment({ id: 'x', media_type: 'movie' })).toBe(false);
    // Enriched before genre ids were read correctly: looked up again to fill them in.
    expect(
      needsMediaEnrichment({ id: 1, media_type: 'movie', poster_path: '/p.jpg', vote_average: 7, genre_ids: [] })
    ).toBe(true);
    expect(
      needsMediaEnrichment({ id: 1, media_type: 'movie', poster_path: '/p.jpg', vote_average: 7, genre_ids: [18] })
    ).toBe(false);
    // A complete season (as the app saves it, or after enrichment) isn't looked up again, even
    // when its show has no genres.
    expect(
      needsMediaEnrichment({
        genre_ids: [],
        id: 1,
        media_type: 'season',
        poster_path: null,
        season_name: 'Season 2',
        season_number: 2,
      })
    ).toBe(false);
  });

  it('reads genre ids from the genres TMDB details actually return', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      headers: { get: () => null },
      json: jest.fn().mockResolvedValue({
        genres: [{ id: 18, name: 'Drama' }, { id: 80, name: 'Crime' }],
        poster_path: '/p.jpg',
        release_date: '2008-07-18',
        title: 'The Dark Knight',
        vote_average: 8.5,
      }),
      ok: true,
      status: 200,
    });

    const enriched = await enrichMediaItem({ id: 155, media_type: 'movie', title: 'The Dark Knight' });

    expect(enriched).toMatchObject({ genre_ids: [18, 80], poster_path: '/p.jpg', vote_average: 8.5 });
  });
});

describe('enrichment on a full list document', () => {
  const movieItem = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    media_type: 'movie',
    title: `Movie ${id}`,
    ...extra,
  });
  const singlePage = (items: Record<string, Record<string, unknown>>) => ({
    items,
    layout: { overflowItemPages: {}, pageCount: 0, pageSizes: [Object.keys(items).length] },
  });
  const manyItems = (count: number, extra: Record<string, unknown> = {}) =>
    Object.fromEntries(
      Array.from({ length: count }, (_, i) => [`movie-${i + 1}`, movieItem(i + 1, extra)])
    );

  it('updates items in place while the list document has room', () => {
    const list = singlePage(manyItems(10));
    const result = planEnrichmentRelocation(list, { 'movie-1': movieItem(1, { poster_path: '/p' }) });

    expect(Object.keys(result.itemsInPlace)).toEqual(['movie-1']);
    expect(result.itemsToMove).toEqual({});
    expect(result.removeFromListDocKeys).toEqual([]);
  });

  it('moves items off a document holding more than a page', () => {
    const list = singlePage(manyItems(2500));
    const result = planEnrichmentRelocation(list, { 'movie-7': movieItem(7, { poster_path: '/p' }) });

    expect(Object.keys(result.itemsToMove)).toEqual(['movie-7']);
    expect(result.removeFromListDocKeys).toEqual(['movie-7']);
  });

  it('moves items off a document under 2,000 items that enrichment would bring near 1 MiB', () => {
    const heavy = { overview: 'x'.repeat(450) };
    const list = singlePage(manyItems(1900, heavy));
    const result = planEnrichmentRelocation(list, {
      'movie-3': movieItem(3, { ...heavy, poster_path: '/p' }),
    });

    expect(Object.keys(result.itemsToMove)).toEqual(['movie-3']);
  });

  it('moves a legacy numeric key under its canonical key', () => {
    const list = singlePage({ ...manyItems(2500), '900001': movieItem(900001) });
    const result = planEnrichmentRelocation(list, {
      '900001': movieItem(900001, { poster_path: '/p' }),
    });

    expect(result.itemsToMove).toEqual({
      'movie-900001': expect.objectContaining({ id: 900001, poster_path: '/p' }),
    });
    expect(result.removeFromListDocKeys).toEqual(['900001']);
    expect(result.itemsInPlace).toEqual({});
  });

  it('keeps the canonical copy and just drops a legacy duplicate with nothing to add', () => {
    const list = singlePage({ ...manyItems(2500, { poster_path: '/c' }), '5': movieItem(5) });
    const result = planEnrichmentRelocation(list, { '5': movieItem(5, { poster_path: '/p' }) });

    expect(result.itemsToMove).toEqual({});
    expect(result.itemsInPlace).toEqual({});
    expect(result.removeFromListDocKeys).toEqual(['5']);
  });

  it('moves the canonical copy with fields only the legacy copy had, before the legacy one goes', () => {
    const list = singlePage({
      ...manyItems(2500),
      '5': movieItem(5, { addedAt: 111, title: 'Legacy title' }),
    });
    const result = planEnrichmentRelocation(list, { '5': movieItem(5, { addedAt: 111, poster_path: '/p' }) });

    // Written to a page (with addedAt) by the relocation, which runs before any removal.
    expect(result.itemsToMove['movie-5']).toEqual(
      expect.objectContaining({ addedAt: 111, title: 'Movie 5', poster_path: '/p' })
    );
    expect(result.itemsInPlace).toEqual({});
    expect(result.removeFromListDocKeys).toEqual(['5', 'movie-5']);
  });

  it('updates a canonical copy already on a page in place with the legacy-only fields', () => {
    const list = {
      items: { ...manyItems(2500), '5': movieItem(5, { addedAt: 111 }) },
      layout: { overflowItemPages: { 'movie-5': 1 }, pageCount: 1, pageSizes: [2500, 1] },
    };
    const result = planEnrichmentRelocation(list, { '5': movieItem(5, { addedAt: 111, poster_path: '/p' }) });

    expect(result.itemsInPlace['movie-5']).toEqual(expect.objectContaining({ addedAt: 111 }));
    expect(result.itemsToMove).toEqual({});
    expect(result.removeFromListDocKeys).toEqual(['5']);
  });

  it('removes stale document copies of items already on a page', () => {
    const list = { ...singlePage(manyItems(10)), duplicateDocKeys: ['movie-3'] };
    const result = planEnrichmentRelocation(list, {});

    expect(result.removeFromListDocKeys).toEqual(['movie-3']);
  });
});

describe('enriching season entries', () => {
  const tmdbResponse = (body: unknown, status = 200) => ({
    headers: { get: () => null },
    json: jest.fn().mockResolvedValue(body),
    ok: status < 400,
    status,
  });
  const syncedSeason = (seasonNumber: number) => ({
    addedAt: 1,
    id: 1396,
    media_type: 'season',
    name: `Breaking Bad · Season ${seasonNumber}`,
    season_number: seasonNumber,
    show_name: 'Breaking Bad',
    title: `Breaking Bad · Season ${seasonNumber}`,
  });
  const show = {
    first_air_date: '2008-01-20',
    genres: [{ id: 18 }, { id: 80 }],
    name: 'Breaking Bad',
    poster_path: '/show.jpg',
    vote_average: 8.9,
  };

  it('flags synced seasons, but not seasons the app saved complete', () => {
    expect(needsMediaEnrichment(syncedSeason(2))).toBe(true);
    expect(
      needsMediaEnrichment({ ...syncedSeason(2), poster_path: null, season_name: 'Season 2' })
    ).toBe(false);
    expect(needsMediaEnrichment({ id: 1396, media_type: 'season' })).toBe(false);
  });

  it("fills in a show's seasons from one TMDB call", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      tmdbResponse({
        ...show,
        'season/0': { air_date: null, episodes: [], name: 'Specials', poster_path: null },
        'season/2': {
          air_date: '2009-03-08',
          episodes: [{ runtime: 47 }, { runtime: null }, { runtime: 48 }],
          name: 'Season 2',
          poster_path: '/s2.jpg',
          vote_average: 8.4,
        },
      })
    );

    const enriched = await enrichMediaItems({
      'season-1396-2': syncedSeason(2),
      'season-1396-0': syncedSeason(0),
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain(
      '/tv/1396?append_to_response=season/2,season/0'
    );
    expect(enriched['season-1396-2']).toMatchObject({
      first_air_date: '2009-03-08',
      genre_ids: [18, 80],
      poster_path: '/s2.jpg',
      release_date: '2009-03-08',
      runtimeMinutes: 95,
      season_name: 'Season 2',
      seasonRuntimeMinutes: 95,
      // The synced title stays, so the next sync doesn't see a change.
      title: 'Breaking Bad · Season 2',
      vote_average: 8.4,
    });
    expect(enriched['season-1396-0']).toMatchObject({
      poster_path: '/show.jpg',
      season_name: 'Specials',
      vote_average: 8.9,
    });
    expect(enriched['season-1396-0']).not.toHaveProperty('seasonRuntimeMinutes');
  });

  it("gives a season TMDB doesn't have the show's details, so it isn't looked up again", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(tmdbResponse(show));

    const enriched = await enrichMediaItem(syncedSeason(7));

    expect(enriched).toMatchObject({
      genre_ids: [18, 80],
      poster_path: '/show.jpg',
      season_name: 'Season 7',
      vote_average: 8.9,
    });
    expect(needsMediaEnrichment(enriched)).toBe(false);
  });

  it('falls back to separate calls when the combined call finds nothing', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(tmdbResponse({}, 404))
      .mockResolvedValueOnce(tmdbResponse(show))
      .mockResolvedValueOnce(tmdbResponse({ name: 'Season 3', poster_path: '/s3.jpg' }));

    const enriched = await enrichMediaItem(syncedSeason(3));

    expect((global.fetch as jest.Mock).mock.calls.map(([url]) => url.split('?')[0])).toEqual([
      expect.stringContaining('/tv/1396'),
      expect.stringContaining('/tv/1396'),
      expect.stringContaining('/tv/1396/season/3'),
    ]);
    expect(enriched).toMatchObject({ poster_path: '/s3.jpg', season_name: 'Season 3' });
  });

  it('moves season entries off a full list document like other entries', () => {
    const items = Object.fromEntries(
      Array.from({ length: 2500 }, (_, i) => [
        `movie-${i + 1}`,
        { id: i + 1, media_type: 'movie', title: `Movie ${i + 1}` },
      ])
    );
    const list = {
      items: { ...items, 'season-1396-2': syncedSeason(2) },
      layout: { overflowItemPages: {}, pageCount: 0, pageSizes: [2501] },
    };

    const result = planEnrichmentRelocation(list, {
      'season-1396-2': { ...syncedSeason(2), poster_path: '/s2.jpg', season_name: 'Season 2' },
    });

    expect(Object.keys(result.itemsToMove)).toEqual(['season-1396-2']);
    expect(result.removeFromListDocKeys).toEqual(['season-1396-2']);
  });
});
