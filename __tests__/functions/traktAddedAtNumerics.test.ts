/**
 * List-item `addedAt` must be written as plain numeric millis, never a
 * Firestore Timestamp (mobile stats/sort readers assume numbers).
 */
class MockTimestamp {
  private readonly millis: number;

  constructor(millis: number) {
    this.millis = millis;
  }

  static fromDate(date: Date): MockTimestamp {
    return new MockTimestamp(date.getTime());
  }

  static fromMillis(millis: number): MockTimestamp {
    return new MockTimestamp(millis);
  }

  static now(): MockTimestamp {
    return new MockTimestamp(Date.now());
  }

  toDate(): Date {
    return new Date(this.millis);
  }

  toMillis(): number {
    return this.millis;
  }
}

jest.mock(
  'firebase-admin/firestore',
  () => ({
    FieldValue: {
      delete: jest.fn(() => 'FIELD_DELETE'),
    },
    Timestamp: MockTimestamp,
  }),
  { virtual: true }
);

import {
  mergeManagedValue,
  shouldApplyRemoteManagedValue,
  toMillisOrNow,
  transformFavorite,
  transformListItem,
  transformWatchedMovie,
  transformWatchedShow,
  transformWatchlistItem,
} from '@/functions/src/trakt/transforms';

describe('toMillisOrNow', () => {
  it('returns numeric millis for a valid ISO string', () => {
    const iso = '2026-09-01T12:15:00.000Z';
    const millis = toMillisOrNow(iso);
    expect(typeof millis).toBe('number');
    expect(millis).toBe(new Date(iso).getTime());
  });

  it('returns current millis for undefined, null, and empty string', () => {
    const before = Date.now();
    const results = [toMillisOrNow(undefined), toMillisOrNow(null), toMillisOrNow('')];
    const after = Date.now();
    for (const millis of results) {
      expect(typeof millis).toBe('number');
      expect(millis).toBeGreaterThanOrEqual(before);
      expect(millis).toBeLessThanOrEqual(after);
    }
  });

  it('returns current millis for an invalid date string', () => {
    const before = Date.now();
    const millis = toMillisOrNow('not-a-date');
    const after = Date.now();
    expect(typeof millis).toBe('number');
    expect(millis).toBeGreaterThanOrEqual(before);
    expect(millis).toBeLessThanOrEqual(after);
  });
});

describe('transform addedAt is numeric millis', () => {
  const ISO = '2026-09-01T12:15:00.000Z';
  const MS = new Date(ISO).getTime();

  it('transformWatchedMovie stamps numeric addedAt', () => {
    const item = transformWatchedMovie({
      last_watched_at: ISO,
      movie: { ids: { tmdb: 493922 }, title: 'Movie' },
    } as never);
    expect(item?.addedAt).toBe(MS);
  });

  it('transformWatchedShow stamps numeric addedAt', () => {
    const item = transformWatchedShow({
      last_watched_at: ISO,
      show: { ids: { tmdb: 200875 }, title: 'Show' },
    } as never);
    expect(item?.addedAt).toBe(MS);
  });

  it('transformListItem stamps numeric addedAt for movie and show entries', () => {
    const movie = transformListItem({
      listed_at: ISO,
      movie: { ids: { tmdb: 1 }, title: 'M' },
    } as never);
    const show = transformListItem({
      listed_at: ISO,
      show: { ids: { tmdb: 2 }, title: 'S' },
    } as never);
    expect(movie?.addedAt).toBe(MS);
    expect(show?.addedAt).toBe(MS);
  });

  it('transformWatchlistItem and transformFavorite stamp numeric addedAt', () => {
    const watchlist = transformWatchlistItem({
      listed_at: ISO,
      movie: { ids: { tmdb: 1 }, title: 'M' },
    } as never);
    const favorite = transformFavorite({
      listed_at: ISO,
      show: { ids: { tmdb: 2 }, title: 'S' },
    } as never);
    expect(watchlist?.addedAt).toBe(MS);
    expect(favorite?.addedAt).toBe(MS);
  });

  it('falls back to numeric now when Trakt timestamps are missing', () => {
    const before = Date.now();
    const item = transformWatchedMovie({
      last_watched_at: null,
      movie: { ids: { tmdb: 1 }, title: 'M' },
    } as never);
    const after = Date.now();
    expect(typeof item?.addedAt).toBe('number');
    expect(item?.addedAt as number).toBeGreaterThanOrEqual(before);
    expect(item?.addedAt as number).toBeLessThanOrEqual(after);
  });
});

describe('mergeManagedValue with numeric addedAt', () => {
  it('remote number wins over existing number', () => {
    const merged = mergeManagedValue(
      { addedAt: 1000, title: 'Old' },
      { addedAt: 2000, title: 'New' }
    );
    expect(merged.addedAt).toBe(2000);
    expect(typeof merged.addedAt).toBe('number');
  });

  it('legacy Timestamp existing vs remote number resolves by recency without throwing', () => {
    const legacyMs = new Date('2024-01-02T00:00:00.000Z').getTime();
    const remoteMs = new Date('2024-03-01T00:00:00.000Z').getTime();
    const existing = { addedAt: MockTimestamp.fromMillis(legacyMs), title: 'T' };
    const remote = { addedAt: remoteMs, title: 'T' };

    expect(() =>
      shouldApplyRemoteManagedValue(existing as never, remote as never, 'addedAt')
    ).not.toThrow();
    expect(shouldApplyRemoteManagedValue(existing as never, remote as never, 'addedAt')).toBe(true);

    const merged = mergeManagedValue(existing as never, remote as never);
    expect(merged.addedAt).toBe(remoteMs);

    // Older remote does not win over newer legacy Timestamp.
    expect(
      shouldApplyRemoteManagedValue(
        { addedAt: MockTimestamp.fromMillis(remoteMs) } as never,
        { addedAt: legacyMs } as never,
        'addedAt'
      )
    ).toBe(false);
  });
});
