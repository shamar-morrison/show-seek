import {
  BACKFILL_BATCH_GAP_MS,
  BACKFILL_BATCH_SIZE,
  EPISODE_RUNTIME_FALLBACK_MINUTES,
  MAX_BACKFILL_LOOKUPS_PER_LOAD,
  backfillRuntimes,
  resetBackfillSessionForTests,
  resolveMissingRuntimes,
  type RuntimeStamps,
  type UnstampedEpisode,
  type UnstampedListItem,
} from '@/src/services/WatchTimeBackfill';

const ep = (tvShowId: number, episodeKey = '1_1', watchedAt = 1000): UnstampedEpisode => ({
  tvShowId,
  episodeKey,
  watchedAt,
});

const listItem = (
  overrides: Partial<UnstampedListItem> & { mediaId: number }
): UnstampedListItem => ({
  listId: 'already-watched',
  itemKey: `movie-${overrides.mediaId}`,
  mediaType: 'movie',
  addedAt: 1000,
  ...overrides,
});

describe('WatchTimeBackfill', () => {
  it('dedupes TMDB lookups so the same show is queried once per pass', async () => {
    const getShowRuntime = jest.fn(async () => 42);
    const stamps: RuntimeStamps[] = [];

    const result = await resolveMissingRuntimes(
      [ep(500, '1_1'), ep(500, '1_2'), ep(500, '1_3'), ep(600, '1_1')],
      [],
      { getShowRuntime, stampRuntimes: (s) => stamps.push(s) }
    );

    expect(getShowRuntime).toHaveBeenCalledTimes(2);
    expect(getShowRuntime).toHaveBeenCalledWith(500);
    expect(getShowRuntime).toHaveBeenCalledWith(600);
    expect(result.episodeMinutes.get('500/1_1')).toBe(42);
    expect(result.episodeMinutes.get('500/1_2')).toBe(42);
    expect(result.episodeMinutes.get('600/1_1')).toBe(42);
    // Measured values are stamped per show, coalesced into one entry per show.
    expect(stamps).toHaveLength(1);
    expect(stamps[0].episodesByShow.get(500)?.get('1_1')).toBe(42);
    expect(stamps[0].episodesByShow.get(500)?.get('1_3')).toBe(42);
    expect(stamps[0].episodesByShow.get(600)?.get('1_1')).toBe(42);
  });

  it('caps lookups per load, most-recent-first, leaving the rest for later loads', async () => {
    const getShowRuntime = jest.fn(async () => 30);
    const stamps: RuntimeStamps[] = [];
    const episodes = Array.from({ length: MAX_BACKFILL_LOOKUPS_PER_LOAD + 2 }, (_, i) =>
      ep(1000 + i, '1_1', 1000 + i)
    );

    const result = await resolveMissingRuntimes(episodes, [], {
      getShowRuntime,
      stampRuntimes: (s) => stamps.push(s),
    });

    expect(getShowRuntime).toHaveBeenCalledTimes(MAX_BACKFILL_LOOKUPS_PER_LOAD);
    // The two oldest shows (1000, 1001) are skipped; newest (1011) is included.
    expect(getShowRuntime).not.toHaveBeenCalledWith(1000);
    expect(getShowRuntime).not.toHaveBeenCalledWith(1001);
    expect(getShowRuntime).toHaveBeenCalledWith(1011);
    // Skipped shows fall back to the in-memory episode estimate...
    expect(result.episodeMinutes.get('1000/1_1')).toBe(EPISODE_RUNTIME_FALLBACK_MINUTES);
    // ...and estimates are never stamped.
    expect(stamps).toHaveLength(1);
    expect(stamps[0].episodesByShow.has(1000)).toBe(false);
    expect(stamps[0].episodesByShow.has(1001)).toBe(false);
    expect(stamps[0].episodesByShow.get(1011)?.get('1_1')).toBe(30);
  });

  it('uses the documented throttle pacing (batches of 5, 250ms gap)', () => {
    expect(BACKFILL_BATCH_SIZE).toBe(5);
    expect(BACKFILL_BATCH_GAP_MS).toBe(250);
    expect(MAX_BACKFILL_LOOKUPS_PER_LOAD).toBe(10);
  });

  it('counts null movie runtimes as 0 in-memory and never stamps them', async () => {
    const getMovieRuntime = jest.fn(async () => null);
    const stampRuntimes = jest.fn();

    const result = await resolveMissingRuntimes(
      [],
      [listItem({ mediaId: 101 }), listItem({ mediaId: 102, itemKey: 'movie-102' })],
      { getMovieRuntime, stampRuntimes }
    );

    expect(getMovieRuntime).toHaveBeenCalledTimes(2);
    expect(result.listItemMinutes.get('already-watched/movie-101')).toBe(0);
    expect(result.listItemMinutes.get('already-watched/movie-102')).toBe(0);
    expect(stampRuntimes).not.toHaveBeenCalled();
  });

  it('never persists the 45-minute episode estimate: fallbacks stay in-memory only', async () => {
    const getShowRuntime = jest.fn(async () => null);
    const stamps: RuntimeStamps[] = [];

    const result = await resolveMissingRuntimes([ep(700, '2_4', 2000)], [], {
      getShowRuntime,
      stampRuntimes: (s) => stamps.push(s),
    });

    // Display total uses the fallback...
    expect(result.episodeMinutes.get('700/2_4')).toBe(EPISODE_RUNTIME_FALLBACK_MINUTES);
    expect(result.episodeMinutes.get('700/2_4')).toBe(45);
    // ...but nothing is written to Firestore.
    expect(stamps).toHaveLength(0);
  });

  it('silently aborts remaining batches on 429/rate-limit errors', async () => {
    const rateLimited = jest.fn(async () => {
      throw { status: 429, message: 'rate limited' };
    });
    const episodes = Array.from({ length: 12 }, (_, i) => ep(2000 + i, '1_1', 5000 + i));

    const result = await resolveMissingRuntimes(episodes, [], {
      getShowRuntime: rateLimited,
    });

    // Only the first batch of 5 is attempted; the rest are skipped.
    expect(rateLimited).toHaveBeenCalledTimes(BACKFILL_BATCH_SIZE);
    episodes.forEach((e) => {
      expect(result.episodeMinutes.get(`${e.tvShowId}/${e.episodeKey}`)).toBe(
        EPISODE_RUNTIME_FALLBACK_MINUTES
      );
    });
  });

  it('stamps measured movie runtimes to their list items', async () => {
    const getMovieRuntime = jest.fn(async () => 120);
    const stamps: RuntimeStamps[] = [];

    const result = await resolveMissingRuntimes(
      [],
      [listItem({ mediaId: 101 })],
      { getMovieRuntime, stampRuntimes: (s) => stamps.push(s) }
    );

    expect(result.listItemMinutes.get('already-watched/movie-101')).toBe(120);
    expect(stamps).toHaveLength(1);
    expect(stamps[0].itemsByList.get('already-watched')?.get('movie-101')).toBe(120);
    expect(stamps[0].episodesByShow.size).toBe(0);
  });
});

describe('backfillRuntimes', () => {
  beforeEach(() => {
    resetBackfillSessionForTests();
  });

  const runBackfill = (
    episodes: UnstampedEpisode[],
    items: UnstampedListItem[],
    extraDeps: Record<string, unknown> = {}
  ): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      backfillRuntimes(episodes, items, { ...extraDeps, onStampsSettled: resolve });
    });

  it('resolves fresh titles in the background and settles true when stamped', async () => {
    const getShowRuntime = jest.fn(async () => 42);
    const stamps: RuntimeStamps[] = [];

    const didStamp = await runBackfill([ep(500, '1_1'), ep(500, '1_2')], [], {
      getShowRuntime,
      stampRuntimes: (s: RuntimeStamps) => stamps.push(s),
    });

    expect(didStamp).toBe(true);
    expect(getShowRuntime).toHaveBeenCalledTimes(1);
    expect(stamps).toHaveLength(1);
    expect(stamps[0].episodesByShow.get(500)?.get('1_2')).toBe(42);
  });

  it('never re-resolves titles attempted earlier in the session', async () => {
    const getShowRuntime = jest.fn(async () => 42);
    const stampRuntimes = jest.fn();

    expect(await runBackfill([ep(500, '1_1')], [], { getShowRuntime, stampRuntimes })).toBe(
      true
    );
    expect(getShowRuntime).toHaveBeenCalledTimes(1);

    // Settle-triggered refetches find nothing new: no TMDB, no stamps, false.
    // This is what guarantees refresh-on-settle always terminates.
    expect(await runBackfill([ep(500, '1_1')], [], { getShowRuntime, stampRuntimes })).toBe(
      false
    );
    expect(getShowRuntime).toHaveBeenCalledTimes(1);
    expect(stampRuntimes).toHaveBeenCalledTimes(1);
  });

  it('settles false without stamping when nothing measured resolves', async () => {
    const getShowRuntime = jest.fn(async () => null);
    const stampRuntimes = jest.fn();

    expect(await runBackfill([ep(700, '1_1')], [], { getShowRuntime, stampRuntimes })).toBe(
      false
    );
    expect(stampRuntimes).not.toHaveBeenCalled();
  });

  it('settles false immediately when there is nothing to resolve', async () => {
    const getShowRuntime = jest.fn();

    expect(await runBackfill([], [], { getShowRuntime })).toBe(false);
    expect(getShowRuntime).not.toHaveBeenCalled();
  });

  it('shares the lookup budget across calls in a session', async () => {
    const getShowRuntime = jest.fn(async () => 42);
    const stampRuntimes = jest.fn();

    // 12 fresh shows but only 10 lookups of session budget: overview spends it.
    const firstBatch = Array.from({ length: 12 }, (_, i) => ep(3000 + i, '1_1', 9000 + i));
    expect(await runBackfill(firstBatch, [], { getShowRuntime, stampRuntimes })).toBe(true);
    expect(getShowRuntime).toHaveBeenCalledTimes(10);

    // Month detail loading after overview in the same session: budget spent,
    // so nothing is issued and it settles false (estimates stay this session).
    const secondBatch = [ep(4000, '1_1', 9500), ep(4001, '1_1', 9600)];
    expect(await runBackfill(secondBatch, [], { getShowRuntime, stampRuntimes })).toBe(
      false
    );
    expect(getShowRuntime).toHaveBeenCalledTimes(10);
  });

  it('respects a maxLookups override while clamping to the per-call ceiling', async () => {
    const getShowRuntime = jest.fn(async () => 42);
    const episodes = Array.from({ length: 6 }, (_, i) => ep(5000 + i, '1_1', 1000 + i));

    const result = await resolveMissingRuntimes(episodes, [], {
      getShowRuntime,
      maxLookups: 3,
      stampRuntimes: jest.fn(),
    });

    expect(getShowRuntime).toHaveBeenCalledTimes(3);
    // Most-recent-first: newest three resolve, oldest three fall back.
    expect(result.episodeMinutes.get('5005/1_1')).toBe(42);
    expect(result.episodeMinutes.get('5000/1_1')).toBe(EPISODE_RUNTIME_FALLBACK_MINUTES);

    getShowRuntime.mockClear();
    const many = Array.from({ length: 12 }, (_, i) => ep(5100 + i, '1_1', 2000 + i));
    await resolveMissingRuntimes(many, [], {
      getShowRuntime,
      maxLookups: 99,
      stampRuntimes: jest.fn(),
    });
    expect(getShowRuntime).toHaveBeenCalledTimes(MAX_BACKFILL_LOOKUPS_PER_LOAD);
  });

  it('carries remaining budget across calls', async () => {
    const getShowRuntime = jest.fn(async () => 42);
    const stampRuntimes = jest.fn();

    await runBackfill(
      [ep(6000, '1_1', 100), ep(6001, '1_1', 200), ep(6002, '1_1', 300)],
      [],
      { getShowRuntime, stampRuntimes }
    );
    expect(getShowRuntime).toHaveBeenCalledTimes(3);

    // 7 of budget left: the next call resolves exactly 7 of 9 fresh shows.
    const more = Array.from({ length: 9 }, (_, i) => ep(6100 + i, '1_1', 1000 + i));
    await runBackfill(more, [], { getShowRuntime, stampRuntimes });
    expect(getShowRuntime).toHaveBeenCalledTimes(10);
  });
});
