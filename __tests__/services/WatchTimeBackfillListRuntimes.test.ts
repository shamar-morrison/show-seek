import {
  BACKFILL_BATCH_SIZE,
  MAX_FILTER_RUNTIME_LOOKUPS,
  resolveListItemRuntimes,
  type RuntimeStamps,
  type UnstampedListItem,
} from '@/src/services/WatchTimeBackfill';

const item = (overrides: Partial<UnstampedListItem> & { mediaId: number }): UnstampedListItem => ({
  listId: 'my-list',
  itemKey: `${overrides.mediaType ?? 'movie'}-${overrides.mediaId}`,
  mediaType: 'movie',
  addedAt: 1000,
  ...overrides,
});

describe('resolveListItemRuntimes', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('looks up each title once and uses episode length for shows', async () => {
    const getMovieRuntime = jest.fn(async () => 120);
    const getShowRuntime = jest.fn(async () => 45);
    const stamps: RuntimeStamps[] = [];

    const result = await resolveListItemRuntimes(
      [
        item({ mediaId: 1 }),
        item({ mediaId: 1, listId: 'other', itemKey: 'movie-1' }),
        item({ mediaId: 2, mediaType: 'tv' }),
      ],
      { getMovieRuntime, getShowRuntime, stampRuntimes: (s) => stamps.push(s) }
    );

    expect(getMovieRuntime).toHaveBeenCalledTimes(1);
    expect(getShowRuntime).toHaveBeenCalledWith(2);
    expect(result).toEqual(
      new Map([
        ['movie:1', 120],
        ['tv:2', 45],
      ])
    );
    expect(stamps).toHaveLength(1);
    expect(stamps[0].itemsByList.get('my-list')?.get('movie-1')).toBe(120);
    expect(stamps[0].itemsByList.get('my-list')?.get('tv-2')).toBe(45);
    expect(stamps[0].itemsByList.get('other')?.get('movie-1')).toBe(120);
  });

  it('saves each item in the document that holds it and skips titles with no runtime', async () => {
    const stamps: RuntimeStamps[] = [];

    await resolveListItemRuntimes([item({ mediaId: 1, page: 2 }), item({ mediaId: 2 })], {
      getMovieRuntime: async (id) => (id === 1 ? 95 : null),
      stampRuntimes: (s) => stamps.push(s),
    });

    expect(stamps[0].itemsByList.get('my-list')).toEqual(new Map([['movie-1', 95]]));
    expect(stamps[0].itemPages?.get('my-list/movie-1')).toBe(2);
  });

  it('does not save anything when no runtime is found', async () => {
    const stampRuntimes = jest.fn();

    const result = await resolveListItemRuntimes([item({ mediaId: 1 })], {
      getMovieRuntime: async () => null,
      stampRuntimes,
    });

    expect(result.size).toBe(0);
    expect(stampRuntimes).not.toHaveBeenCalled();
  });

  it('stops on rate limits but still saves what it found', async () => {
    jest.useFakeTimers();
    const stamps: RuntimeStamps[] = [];
    const items = Array.from({ length: BACKFILL_BATCH_SIZE * 3 }, (_, i) =>
      item({ mediaId: i + 1, addedAt: 10_000 - i })
    );
    const getMovieRuntime = jest.fn(async (id: number) => {
      if (id === BACKFILL_BATCH_SIZE + 1) {
        throw Object.assign(new Error('Too many requests'), { status: 429 });
      }
      return 100;
    });

    const promise = resolveListItemRuntimes(items, {
      getMovieRuntime,
      stampRuntimes: (s) => stamps.push(s),
    });
    await jest.runAllTimersAsync();
    const result = await promise;

    // The second batch hit the rate limit, so the third batch never ran.
    expect(getMovieRuntime).toHaveBeenCalledTimes(BACKFILL_BATCH_SIZE * 2);
    expect(result.get('movie:1')).toBe(100);
    expect(stamps).toHaveLength(1);
  });

  it('reports progress per batch and stops when cancelled', async () => {
    jest.useFakeTimers();
    let cancelled = false;
    const progress: number[] = [];
    const items = Array.from({ length: BACKFILL_BATCH_SIZE * 3 }, (_, i) =>
      item({ mediaId: i + 1 })
    );
    const getMovieRuntime = jest.fn(async () => 100);

    const promise = resolveListItemRuntimes(items, {
      getMovieRuntime,
      stampRuntimes: jest.fn(),
      isCancelled: () => cancelled,
      onProgress: ({ done, total }) => {
        progress.push(done);
        expect(total).toBe(BACKFILL_BATCH_SIZE * 3);
        cancelled = true;
      },
    });
    await jest.runAllTimersAsync();
    await promise;

    expect(progress).toEqual([BACKFILL_BATCH_SIZE]);
    expect(getMovieRuntime).toHaveBeenCalledTimes(BACKFILL_BATCH_SIZE);
  });

  it('caps the number of titles looked up in one run, newest first', async () => {
    jest.useFakeTimers();
    const items = Array.from({ length: MAX_FILTER_RUNTIME_LOOKUPS + 5 }, (_, i) =>
      item({ mediaId: i + 1, addedAt: i })
    );
    const getMovieRuntime = jest.fn(async () => 100);

    const promise = resolveListItemRuntimes(items, { getMovieRuntime, stampRuntimes: jest.fn() });
    await jest.runAllTimersAsync();
    await promise;

    expect(getMovieRuntime).toHaveBeenCalledTimes(MAX_FILTER_RUNTIME_LOOKUPS);
    // The oldest additions are the ones left out.
    expect(getMovieRuntime).not.toHaveBeenCalledWith(1);
    expect(getMovieRuntime).toHaveBeenCalledWith(MAX_FILTER_RUNTIME_LOOKUPS + 5);
  });
});
