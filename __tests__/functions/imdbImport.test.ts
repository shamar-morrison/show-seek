let secretValue = 'tmdb-key';
const mockDefineSecret = jest.fn(() => ({
  value: () => secretValue,
}));
const firestoreFn: any = jest.fn();

jest.mock(
  'firebase-functions/params',
  () => ({
    defineSecret: mockDefineSecret,
  }),
  { virtual: true }
);

jest.mock(
  'firebase-admin',
  () => ({
    firestore: firestoreFn,
  }),
  { virtual: true }
);

jest.mock(
  'firebase-admin/firestore',
  () => ({
    FieldValue: {
      delete: jest.fn(() => '__deleteField__'),
    },
  }),
  { virtual: true }
);

import { importImdbChunk } from '@/functions/src/imdbImport';
import { IMDB_IMPORT_MAX_ACTIONS_PER_CHUNK } from '@/functions/src/shared/imdbImport';

type Store = Map<string, Record<string, unknown>>;

let store: Store;

class MockDocSnapshot {
  constructor(
    readonly ref: MockDocRef,
    private readonly value: Record<string, unknown> | undefined
  ) {}

  get exists() {
    return this.value !== undefined;
  }

  get id() {
    return this.ref.id;
  }

  data() {
    return clone(this.value);
  }
}

class MockDocRef {
  constructor(
    readonly path: string,
    private readonly backingStore: Store
  ) {}

  get id() {
    return this.path.split('/').at(-1) ?? '';
  }

  collection(name: string) {
    return new MockCollectionRef(`${this.path}/${name}`, this.backingStore);
  }

  async get() {
    return new MockDocSnapshot(this, this.backingStore.get(this.path));
  }

  async create(value: Record<string, unknown>) {
    if (this.backingStore.has(this.path)) {
      throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
    }
    this.backingStore.set(this.path, clone(value));
  }

  async set(value: Record<string, unknown>, options?: { merge?: boolean }) {
    const nextValue = options?.merge
      ? deepMerge(this.backingStore.get(this.path) ?? {}, value)
      : clone(value);
    this.backingStore.set(this.path, nextValue);
  }
}

class MockCollectionRef {
  constructor(
    readonly path: string,
    private readonly backingStore: Store
  ) {}

  doc(id: string) {
    return new MockDocRef(`${this.path}/${id}`, this.backingStore);
  }

  async get() {
    const docs = [...this.backingStore.entries()]
      .filter(([path]) => isDirectChildDocPath(this.path, path))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, value]) => new MockDocSnapshot(new MockDocRef(path, this.backingStore), value));

    return {
      docs,
      empty: docs.length === 0,
      forEach: (callback: (snapshot: MockDocSnapshot) => void) => docs.forEach(callback),
      size: docs.length,
    };
  }
}

class MockFirestore {
  constructor(private readonly backingStore: Store) {}

  collection(name: string) {
    return new MockCollectionRef(name, this.backingStore);
  }

  async runTransaction<T>(callback: (transaction: unknown) => Promise<T>): Promise<T> {
    const pendingWrites: (() => Promise<void>)[] = [];
    const result = await callback({
      get: (ref: MockDocRef) => ref.get(),
      set: (ref: MockDocRef, value: Record<string, unknown>, options?: { merge?: boolean }) => {
        pendingWrites.push(() => ref.set(value, options));
      },
    });
    for (const write of pendingWrites) {
      await write();
    }
    return result;
  }
}

const mockFetch = jest.fn();

beforeAll(() => {
  Object.defineProperty(global, 'fetch', {
    configurable: true,
    value: mockFetch,
    writable: true,
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  store = new Map();
  secretValue = 'tmdb-key';

  firestoreFn.mockImplementation(() => new MockFirestore(store));
  firestoreFn.Timestamp = {
    fromMillis: jest.fn((ms: number) => ({
      _ms: ms,
      toMillis: () => ms,
    })),
  };

  mockFetch.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env.EPISODE_LIST_ENTRIES_UIDS;
});

describe('importImdbChunk', () => {
  it('rejects unauthenticated or anonymous callers', async () => {
    await expect(
      callImportImdbChunk({
        auth: undefined,
        data: { entities: [] },
      } as any)
    ).rejects.toMatchObject({
      code: 'unauthenticated',
    });

    await expect(
      callImportImdbChunk({
        auth: {
          token: {
            firebase: {
              sign_in_provider: 'anonymous',
            },
          },
          uid: 'user-1',
        },
        data: { entities: [] },
      } as any)
    ).rejects.toMatchObject({
      code: 'unauthenticated',
    });
  });

  it.each([
    {
      message: 'entities[0].actions must be an array.',
      name: 'missing actions arrays',
      payload: {
        entities: [
          createImportEntity({
            actions: undefined,
          }),
        ],
      },
    },
    {
      message: 'entities[0].imdbId must be a non-empty string.',
      name: 'blank imdb ids',
      payload: {
        entities: [
          createImportEntity({
            imdbId: '   ',
          }),
        ],
      },
    },
    {
      message: 'entities[0].actions[0].kind must be one of rating, list, checkin.',
      name: 'unknown action kinds',
      payload: {
        entities: [
          createImportEntity({
            actions: [
              {
                kind: 'note',
                sourceFileName: 'notes.csv',
              },
            ],
          }),
        ],
      },
    },
    {
      message: 'entities[0].actions[0].rating must be an integer between 1 and 10.',
      name: 'ratings outside the accepted range',
      payload: {
        entities: [
          createImportEntity({
            actions: [
              createRatingAction({
                rating: 11,
              }),
            ],
          }),
        ],
      },
    },
    {
      message: 'entities[0].actions[0].watchedAt must be a finite number.',
      name: 'non-numeric watched timestamps',
      payload: {
        entities: [
          createImportEntity({
            actions: [
              createCheckinAction({
                watchedAt: 'nope',
              }),
            ],
          }),
        ],
      },
    },
  ])('rejects $name before contacting Firestore or TMDB', async ({ message, payload }) => {
    await expect(
      callImportImdbChunk(createAuthenticatedRequest(payload) as any)
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message,
    });

    expect(firestoreFn).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it('rejects chunks that exceed the supported total action count', async () => {
    await expect(
      callImportImdbChunk(
        createAuthenticatedRequest({
          entities: [
            createImportEntity({
              actions: Array.from({ length: IMDB_IMPORT_MAX_ACTIONS_PER_CHUNK + 1 }, () =>
                createRatingAction()
              ),
            }),
          ],
        }) as any
      )
    ).rejects.toMatchObject({
      code: 'invalid-argument',
      message: `entities[0].actions causes the chunk to exceed the supported maximum of ${IMDB_IMPORT_MAX_ACTIONS_PER_CHUNK} actions.`,
    });

    expect(firestoreFn).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });

  it('rejects non-premium users before contacting TMDB', async () => {
    seedDoc('users/user-1', {
      premium: {
        isPremium: false,
      },
    });

    await expect(
      callImportImdbChunk({
        auth: {
          token: {
            firebase: {
              sign_in_provider: 'password',
            },
          },
          uid: 'user-1',
        },
        data: {
          entities: [
            {
              actions: [],
              imdbId: 'tt0111161',
              rawTitleType: 'movie',
              title: 'The Movie',
            },
          ],
        },
      } as any)
    ).rejects.toMatchObject({
      code: 'permission-denied',
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not create custom lists with reserved default ids', async () => {
    seedPremiumUser('user-1');
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/find/tt0111161')) {
        return createFetchResponse({
          movie_results: [
            {
              genre_ids: [878],
              id: 101,
              poster_path: '/movie.jpg',
              release_date: '1999-01-01',
              title: 'The Movie',
              vote_average: 8.5,
            },
          ],
          person_results: [],
          tv_episode_results: [],
          tv_results: [],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const result = await callImportImdbChunk({
      auth: {
        token: {
          firebase: {
            sign_in_provider: 'password',
          },
        },
        uid: 'user-1',
      },
      data: {
        entities: [
          {
            actions: [
              {
                addedAt: 1_704_067_200_000,
                isWatchlist: false,
                kind: 'list',
                listName: 'Favorites',
                sourceFileName: 'favorites.csv',
              },
            ],
            imdbId: 'tt0111161',
            rawTitleType: 'movie',
            title: 'The Movie',
          },
        ],
      },
    } as any);

    expect(result.imported.customListsCreated).toBe(1);
    expect(result.imported.listItems).toBe(1);
    expect(getDirectDocPaths('users/user-1/lists')).toEqual(['users/user-1/lists/favorites-1']);
    expect(getDoc('users/user-1/lists/favorites')).toBeUndefined();
    expect(getDoc('users/user-1/lists/favorites-1')).toMatchObject({
      name: 'Favorites',
    });
  });

  it('times out hung TMDB requests with an unavailable error', async () => {
    jest.useFakeTimers();
    seedPremiumUser('user-1');
    mockFetch.mockImplementation(
      (_url: string, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const abortError = new Error('aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        })
    );

    const pending = callImportImdbChunk({
      auth: {
        token: {
          firebase: {
            sign_in_provider: 'password',
          },
        },
        uid: 'user-1',
      },
      data: {
        entities: [
          {
            actions: [],
            imdbId: 'tt0111161',
            rawTitleType: 'movie',
            title: 'The Movie',
          },
        ],
      },
    } as any);
    const expectation = expect(pending).rejects.toMatchObject({
      code: 'unavailable',
      message: 'TMDB request timed out',
    });

    await jest.advanceTimersByTimeAsync(15_000);

    await expectation;
  });

  it('creates deterministic movie watches and preserves watched timestamps in already-watched', async () => {
    seedPremiumUser('user-1');
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/find/tt0111161')) {
        return createFetchResponse({
          movie_results: [
            {
              genre_ids: [18],
              id: 101,
              poster_path: '/movie.jpg',
              release_date: '1999-01-01',
              title: 'The Movie',
              vote_average: 8.5,
            },
          ],
          person_results: [],
          tv_episode_results: [],
          tv_results: [],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const request = {
      auth: {
        token: {
          firebase: {
            sign_in_provider: 'password',
          },
        },
        uid: 'user-1',
      },
      data: {
        entities: [
          {
            actions: [
              {
                kind: 'checkin',
                sourceFileName: 'checkins.csv',
                watchedAt: 1_704_067_200_000,
              },
            ],
            imdbId: 'tt0111161',
            rawTitleType: 'movie',
            title: 'The Movie',
          },
        ],
      },
    };

    const firstRun = await callImportImdbChunk(request as any);
    const secondRun = await callImportImdbChunk(request as any);

    expect(firstRun.imported.watchedMovies).toBe(1);
    expect(secondRun.imported.watchedMovies).toBe(0);

    expect(getDoc('users/user-1/watched_movies/101/watches/imdb-101-1704067200000')).toMatchObject({
      movieId: 101,
      watchedAt: {
        _ms: 1_704_067_200_000,
      },
    });

    expect(getDoc('users/user-1/lists/already-watched')).toMatchObject({
      items: {
        'movie-101': expect.objectContaining({
          addedAt: 1_704_067_200_000,
          id: 101,
          media_type: 'movie',
          title: 'The Movie',
        }),
      },
      name: 'Already Watched',
    });
  });

  it('replaces an existing movie rating only with a newer one', async () => {
    seedPremiumUser('user-1');
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/find/tt0111161')) {
        return createFetchResponse({
          movie_results: [{ genre_ids: [18], id: 101, title: 'The Movie' }],
          person_results: [],
          tv_episode_results: [],
          tv_results: [],
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    const rate = (rating: number, ratedAt: number) =>
      callImportImdbChunk({
        auth: { token: { firebase: { sign_in_provider: 'password' } }, uid: 'user-1' },
        data: {
          entities: [
            {
              actions: [{ kind: 'rating', ratedAt, rating, sourceFileName: 'ratings.csv' }],
              imdbId: 'tt0111161',
              rawTitleType: 'movie',
              title: 'The Movie',
            },
          ],
        },
      } as any);

    expect((await rate(7, 2_000)).imported.ratings).toBe(1);
    expect((await rate(9, 1_000)).imported.ratings).toBe(0);
    expect(getDoc('users/user-1/ratings/movie-101')).toMatchObject({ ratedAt: 2_000, rating: 7 });
    expect((await rate(9, 3_000)).imported.ratings).toBe(1);
    expect(getDoc('users/user-1/ratings/movie-101')).toMatchObject({ ratedAt: 3_000, rating: 9 });
  });

  it('reuses an existing custom list by case-insensitive name match', async () => {
    seedPremiumUser('user-1');
    seedDoc('users/user-1/lists/sci-fi-picks', {
      createdAt: 100,
      items: {},
      name: 'Sci Fi Picks',
    });

    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/find/tt0111161')) {
        return createFetchResponse({
          movie_results: [
            {
              genre_ids: [878],
              id: 101,
              poster_path: '/movie.jpg',
              release_date: '1999-01-01',
              title: 'The Movie',
              vote_average: 8.5,
            },
          ],
          person_results: [],
          tv_episode_results: [],
          tv_results: [],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const result = await callImportImdbChunk({
      auth: {
        token: {
          firebase: {
            sign_in_provider: 'password',
          },
        },
        uid: 'user-1',
      },
      data: {
        entities: [
          {
            actions: [
              {
                addedAt: 1_704_067_200_000,
                isWatchlist: false,
                kind: 'list',
                listName: 'sci fi picks',
                sourceFileName: 'sci-fi-picks.csv',
              },
            ],
            imdbId: 'tt0111161',
            rawTitleType: 'movie',
            title: 'The Movie',
          },
        ],
      },
    } as any);

    expect(result.imported.customListsCreated).toBe(0);
    expect(result.imported.listItems).toBe(1);
    expect(getDirectDocPaths('users/user-1/lists')).toEqual(['users/user-1/lists/sci-fi-picks']);
    expect(getDoc('users/user-1/lists/sci-fi-picks')).toMatchObject({
      items: {
        'movie-101': expect.objectContaining({
          addedAt: 1_704_067_200_000,
          id: 101,
        }),
      },
      name: 'Sci Fi Picks',
    });
  });

  describe('list episodes rollout', () => {
    afterEach(() => {
      delete process.env.EPISODE_LIST_ENTRIES_UIDS;
    });

    it('keeps skipping list episodes for accounts episodes are not rolled out to', async () => {
      process.env.EPISODE_LIST_ENTRIES_UIDS = 'someone-else';
      seedPremiumUser('user-1');
      mockFetch.mockImplementation(async (url: string) =>
        url.includes('/find/')
          ? createFetchResponse({
              tv_episode_results: [
                { episode_number: 12, id: 62103, name: 'Phoenix', season_number: 2, show_id: 1396 },
              ],
            })
          : createFetchResponse({ id: 1396, name: 'Breaking Bad', poster_path: null })
      );

      const result = await callImportImdbChunk({
        auth: { token: { firebase: { sign_in_provider: 'password' } }, uid: 'user-1' },
        data: {
          entities: [
            {
              actions: [
                {
                  addedAt: 1_704_067_200_000,
                  isWatchlist: true,
                  kind: 'list',
                  listName: 'WATCHLIST',
                  sourceFileName: 'watchlist.csv',
                },
              ],
              imdbId: 'tt1232247',
              rawTitleType: 'TV Episode',
              title: 'Phoenix',
            },
          ],
        },
      } as any);

      expect(result.imported.listItems).toBe(0);
      expect(result.skipped.unsupported_list_episode).toBe(1);
      expect(getDoc('users/user-1/lists/watchlist')).toBeUndefined();
    });
  });

  it('imports watchlist and list episodes as episode entries in Should Watch and the custom list', async () => {
    process.env.EPISODE_LIST_ENTRIES_UIDS = 'user-1';
    seedPremiumUser('user-1');
    seedDoc('users/user-1/lists/watchlist', {
      createdAt: 1,
      items: { 'tv-1396': { id: 1396, media_type: 'tv', title: 'Breaking Bad' } },
      name: 'Should Watch',
    });
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/find/tt1232247')) {
        return createFetchResponse({
          movie_results: [],
          person_results: [],
          tv_episode_results: [
            {
              air_date: '2009-05-24',
              episode_number: 12,
              id: 62103,
              name: 'Phoenix',
              runtime: 47,
              season_number: 2,
              show_id: 1396,
              still_path: '/phoenix.jpg',
              vote_average: 9.1,
            },
          ],
          tv_results: [],
        });
      }

      if (url.includes('/tv/1396')) {
        return createFetchResponse({
          genres: [{ id: 18 }, { id: 80 }],
          id: 1396,
          name: 'Breaking Bad',
          poster_path: '/show.jpg',
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const result = await callImportImdbChunk({
      auth: { token: { firebase: { sign_in_provider: 'password' } }, uid: 'user-1' },
      data: {
        entities: [
          {
            actions: [
              {
                addedAt: 1_704_067_200_000,
                isWatchlist: true,
                kind: 'list',
                listName: 'WATCHLIST',
                sourceFileName: 'watchlist.csv',
              },
              {
                addedAt: 1_704_153_600_000,
                isWatchlist: false,
                kind: 'list',
                listName: 'Favourite Episodes',
                sourceFileName: 'favourite-episodes.csv',
              },
            ],
            imdbId: 'tt1232247',
            rawTitleType: 'TV Episode',
            title: 'Phoenix',
          },
        ],
      },
    } as any);

    const entry = {
      episode_name: 'Phoenix',
      episode_number: 12,
      episodeRuntimeMinutes: 47,
      first_air_date: '2009-05-24',
      genre_ids: [18, 80],
      id: 1396,
      media_type: 'episode',
      name: 'Breaking Bad · S2E12 · Phoenix',
      poster_path: '/show.jpg',
      release_date: '2009-05-24',
      runtimeMinutes: 47,
      season_number: 2,
      show_name: 'Breaking Bad',
      still_path: '/phoenix.jpg',
      title: 'Breaking Bad · S2E12 · Phoenix',
      vote_average: 9.1,
    };
    expect(result.imported.listItems).toBe(2);
    expect(result.skipped.unsupported_list_episode ?? 0).toBe(0);
    // The show's own entry, under its legacy-free key, is untouched.
    expect(getDoc('users/user-1/lists/watchlist')?.items).toEqual({
      'tv-1396': { id: 1396, media_type: 'tv', title: 'Breaking Bad' },
      'episode-1396-2-12': { ...entry, addedAt: 1_704_067_200_000 },
    });
    expect(getDoc('users/user-1/lists/favourite-episodes')).toMatchObject({
      items: { 'episode-1396-2-12': { ...entry, addedAt: 1_704_153_600_000 } },
      name: 'Favourite Episodes',
    });
    // The show is looked up once for both lists.
    expect(mockFetch.mock.calls.filter(([url]) => url.includes('/tv/1396'))).toHaveLength(1);
  });

  it('never re-adds an episode already in the list', async () => {
    process.env.EPISODE_LIST_ENTRIES_UIDS = 'user-1';
    seedPremiumUser('user-1');
    const existing = {
      addedAt: 5,
      id: 1396,
      media_type: 'episode',
      season_number: 2,
      episode_number: 12,
    };
    seedDoc('users/user-1/lists/watchlist', {
      createdAt: 1,
      items: { 'episode-1396-2-12': existing },
      name: 'Should Watch',
    });
    mockFetch.mockImplementation(async (url: string) =>
      url.includes('/find/')
        ? createFetchResponse({
            tv_episode_results: [
              { episode_number: 12, id: 62103, name: 'Phoenix', season_number: 2, show_id: 1396 },
            ],
          })
        : createFetchResponse({ id: 1396, name: 'Breaking Bad', poster_path: null })
    );

    const result = await callImportImdbChunk({
      auth: { token: { firebase: { sign_in_provider: 'password' } }, uid: 'user-1' },
      data: {
        entities: [
          {
            actions: [
              {
                addedAt: 1_704_067_200_000,
                isWatchlist: true,
                kind: 'list',
                listName: 'WATCHLIST',
                sourceFileName: 'watchlist.csv',
              },
            ],
            imdbId: 'tt1232247',
            rawTitleType: 'TV Episode',
            title: 'Phoenix',
          },
        ],
      },
    } as any);

    expect(result.imported.listItems).toBe(0);
    expect(getDoc('users/user-1/lists/watchlist')?.items).toEqual({
      'episode-1396-2-12': existing,
    });
  });

  it('maps episode ratings and check-ins using TMDB episode results and show details once', async () => {
    seedPremiumUser('user-1');
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('/find/tt7654321')) {
        return createFetchResponse({
          movie_results: [],
          person_results: [],
          tv_episode_results: [
            {
              air_date: '2020-01-15',
              episode_number: 2,
              id: 9002,
              name: 'Pilot Part 2',
              season_number: 1,
              show_id: 42,
            },
          ],
          tv_results: [],
        });
      }

      if (url.includes('/tv/42')) {
        return createFetchResponse({
          first_air_date: '2020-01-01',
          genre_ids: [18, 35],
          id: 42,
          name: 'Great Show',
          poster_path: '/show.jpg',
          vote_average: 7.4,
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const result = await callImportImdbChunk({
      auth: {
        token: {
          firebase: {
            sign_in_provider: 'password',
          },
        },
        uid: 'user-1',
      },
      data: {
        entities: [
          {
            actions: [
              {
                kind: 'rating',
                ratedAt: 1_704_067_200_000,
                rating: 8,
                sourceFileName: 'ratings.csv',
              },
              {
                kind: 'checkin',
                sourceFileName: 'checkins.csv',
                watchedAt: 1_704_153_600_000,
              },
            ],
            imdbId: 'tt7654321',
            rawTitleType: 'tvEpisode',
            title: 'Pilot Part 2',
          },
        ],
      },
    } as any);

    expect(result.imported.ratings).toBe(1);
    expect(result.imported.watchedEpisodes).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(getDoc('users/user-1/ratings/episode-42-1-2')).toMatchObject({
      episodeName: 'Pilot Part 2',
      episodeNumber: 2,
      id: 'episode-42-1-2',
      mediaType: 'episode',
      posterPath: '/show.jpg',
      rating: 8,
      seasonNumber: 1,
      tvShowId: 42,
      tvShowName: 'Great Show',
    });
    expect(getDoc('users/user-1/episode_tracking/42')).toMatchObject({
      episodes: {
        '1_2': expect.objectContaining({
          episodeId: 9002,
          episodeName: 'Pilot Part 2',
          watchedAt: 1_704_153_600_000,
        }),
      },
      metadata: expect.objectContaining({
        posterPath: '/show.jpg',
        tvShowName: 'Great Show',
      }),
    });
  });
});

function clone<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function createFetchResponse(payload: unknown, status = 200, headers?: Record<string, string>) {
  return Promise.resolve({
    headers: {
      get: (name: string) => headers?.[name.toLowerCase()] ?? null,
    },
    json: async () => clone(payload),
    ok: status >= 200 && status < 300,
    status,
  });
}

function deepMerge(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = clone(base);

  Object.entries(incoming).forEach(([key, value]) => {
    if (value === '__deleteField__') {
      delete result[key];
      return;
    }

    const existingValue = result[key];
    if (isPlainObject(existingValue) && isPlainObject(value)) {
      result[key] = deepMerge(existingValue, value);
      return;
    }

    result[key] = clone(value);
  });

  return result;
}

function getDirectDocPaths(collectionPath: string): string[] {
  return [...store.keys()].filter((path) => isDirectChildDocPath(collectionPath, path)).sort();
}

function getDoc(path: string): Record<string, unknown> | undefined {
  return clone(store.get(path));
}

function isDirectChildDocPath(collectionPath: string, docPath: string): boolean {
  if (!docPath.startsWith(`${collectionPath}/`)) {
    return false;
  }

  const suffix = docPath.slice(collectionPath.length + 1);
  return suffix.length > 0 && !suffix.includes('/');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function seedDoc(path: string, data: Record<string, unknown>) {
  store.set(path, clone(data));
}

function seedPremiumUser(userId: string) {
  seedDoc(`users/${userId}`, {
    premium: {
      isPremium: true,
    },
  });
}

function createAuthenticatedRequest(data: unknown) {
  return {
    auth: {
      token: {
        firebase: {
          sign_in_provider: 'password',
        },
      },
      uid: 'user-1',
    },
    data,
  };
}

function createImportEntity(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actions: [],
    imdbId: 'tt0111161',
    rawTitleType: 'movie',
    title: 'The Movie',
    ...overrides,
  };
}

function createRatingAction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'rating',
    ratedAt: 1_704_067_200_000,
    rating: 8,
    sourceFileName: 'ratings.csv',
    ...overrides,
  };
}

function createCheckinAction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'checkin',
    sourceFileName: 'checkins.csv',
    watchedAt: 1_704_067_200_000,
    ...overrides,
  };
}

function callImportImdbChunk(request: unknown): Promise<any> {
  return (importImdbChunk as any)(request);
}
