/**
 * Trakt season entries: list and watchlist entries for one season are kept as season entries
 * (keyed `season-{tvId}-{n}`) instead of being folded into their show.
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

import { buildCustomListItemsMap } from '@/functions/src/trakt/builders';
import {
  findFoldedSeasonShowKeys,
  getTraktSeasonNumber,
  transformListItem,
  transformWatchlistItem,
} from '@/functions/src/trakt/transforms';
import type { TraktListItem, TraktWatchlistItem } from '@/functions/src/trakt/types';
import {
  aggregateCustomLists,
  aggregateWatchlist,
  type RawWatchlistItem,
} from '@/functions/src/trakt/zipAggregator';

const show = {
  ids: { slug: 'breaking-bad', tmdb: 1396, trakt: 1 },
  title: 'Breaking Bad',
  year: 2008,
};

// The shape Trakt's list items and watchlist endpoints return for a season.
const seasonEntry = (number: number | undefined, listedAt = '2026-01-02T03:04:05.000Z') =>
  ({
    id: 100 + (number ?? 0),
    listed_at: listedAt,
    rank: 1,
    season: { ids: { tmdb: 3570 + (number ?? 0), tvdb: 30270 }, number },
    show,
    type: 'season',
  }) as TraktListItem;

describe('getTraktSeasonNumber', () => {
  it('reads the number of a season entry, including specials', () => {
    expect(getTraktSeasonNumber(seasonEntry(3))).toBe(3);
    expect(getTraktSeasonNumber(seasonEntry(0))).toBe(0);
  });

  it('treats entries without a usable season as not seasons', () => {
    expect(getTraktSeasonNumber(seasonEntry(undefined))).toBeUndefined();
    expect(getTraktSeasonNumber({ season: { number: -1 }, type: 'season' })).toBeUndefined();
    expect(getTraktSeasonNumber({ type: 'show' })).toBeUndefined();
    // Episode entries carry their season number too, but aren't seasons.
    expect(
      getTraktSeasonNumber({ episode: { number: 1 }, season: { number: 2 }, type: 'episode' })
    ).toBeUndefined();
  });
});

describe('transformListItem with seasons', () => {
  it('turns a season entry into a season of its show', () => {
    expect(transformListItem(seasonEntry(3))).toEqual({
      addedAt: new Date('2026-01-02T03:04:05.000Z').getTime(),
      mediaType: 'season',
      seasonNumber: 3,
      showName: 'Breaking Bad',
      title: 'Breaking Bad · Season 3',
      tmdbId: 1396,
    });
    expect(transformListItem(seasonEntry(0))?.title).toBe('Breaking Bad · Specials');
  });

  it('keeps a season entry without a number as its show', () => {
    expect(transformListItem(seasonEntry(undefined))).toMatchObject({
      mediaType: 'tv',
      tmdbId: 1396,
    });
  });

  it('skips a season whose show has no TMDB ID', () => {
    expect(
      transformListItem({ ...seasonEntry(2), show: { ...show, ids: { slug: 'x', trakt: 9 } } })
    ).toBeNull();
  });
});

describe('transformWatchlistItem with seasons', () => {
  it('turns a watchlist season into a season entry', () => {
    expect(transformWatchlistItem(seasonEntry(2) as TraktWatchlistItem)).toEqual({
      addedAt: new Date('2026-01-02T03:04:05.000Z').getTime(),
      id: 1396,
      media_type: 'season',
      name: 'Breaking Bad · Season 2',
      season_number: 2,
      show_name: 'Breaking Bad',
      title: 'Breaking Bad · Season 2',
    });
  });
});

describe('buildCustomListItemsMap with seasons', () => {
  it('keys the show, each season and an episode apart', () => {
    const items = buildCustomListItemsMap([
      { id: 1, listed_at: '2026-01-01T00:00:00.000Z', rank: 1, show, type: 'show' },
      seasonEntry(1),
      seasonEntry(0),
      {
        episode: { ids: { slug: 'e', trakt: 5 }, number: 1, season: 1, title: 'Pilot' },
        id: 7,
        listed_at: '2026-01-03T00:00:00.000Z',
        rank: 4,
        show,
        type: 'episode',
      },
    ]);

    expect(Object.keys(items).sort()).toEqual([
      'episode-1396-1-1',
      'season-1396-0',
      'season-1396-1',
      'tv-1396',
    ]);
    expect(items['episode-1396-1-1']).toEqual({
      addedAt: new Date('2026-01-03T00:00:00.000Z').getTime(),
      episode_number: 1,
      id: 1396,
      media_type: 'episode',
      name: 'Breaking Bad · S1E1 · Pilot',
      season_number: 1,
      show_name: 'Breaking Bad',
      title: 'Breaking Bad · S1E1 · Pilot',
    });
    expect(items['season-1396-1']).toEqual(
      expect.objectContaining({
        id: 1396,
        media_type: 'season',
        name: 'Breaking Bad · Season 1',
        season_number: 1,
        show_name: 'Breaking Bad',
      })
    );
    expect(items['season-1396-1']).not.toHaveProperty('traktId');
  });
});

describe('ZIP import aggregation with seasons', () => {
  const rawShow = {
    ids: { slug: 'breaking-bad', tmdb: 1396, trakt: 1 },
    title: 'Breaking Bad',
    year: 2008,
  };
  const rawEntries: RawWatchlistItem[] = [
    { listed_at: '2026-01-01T00:00:00.000Z', show: rawShow, type: 'show' },
    {
      listed_at: '2026-01-02T00:00:00.000Z',
      season: { ids: { tmdb: 3572 }, number: 1 },
      show: rawShow,
      type: 'season',
    },
    {
      listed_at: '2026-01-03T00:00:00.000Z',
      season: { ids: { tmdb: 3573 }, number: 2 },
      show: rawShow,
      type: 'season',
    },
    {
      listed_at: '2026-01-04T00:00:00.000Z',
      season: { ids: { tmdb: 3571 }, number: 0 },
      show: rawShow,
      type: 'season',
    },
    {
      episode: { number: 1, season: 1, title: 'Pilot' },
      listed_at: '2026-01-05T00:00:00.000Z',
      show: { ...rawShow, ids: { ...rawShow.ids, tmdb: 1399 }, title: 'Other Show' },
      type: 'episode',
    },
  ];

  const keysOf = (items: (TraktListItem | TraktWatchlistItem)[]) =>
    Object.keys(buildCustomListItemsMap(items as TraktListItem[])).sort();

  it('keeps each season and episode of a watchlist apart from its show', () => {
    const watchlist = aggregateWatchlist(rawEntries);

    expect(keysOf(watchlist)).toEqual([
      'episode-1399-1-1',
      'season-1396-0',
      'season-1396-1',
      'season-1396-2',
      'tv-1396',
    ]);
    expect(watchlist.find((item) => item.type === 'episode')).toMatchObject({
      episode: { number: 1, season: 1, title: 'Pilot' },
      show: { ids: { tmdb: 1399 }, title: 'Other Show' },
    });
    expect(watchlist.find((item) => item.season?.number === 2)).toMatchObject({
      season: { ids: { tmdb: 3573 }, number: 2 },
      show: { ids: { tmdb: 1396 }, title: 'Breaking Bad' },
      type: 'season',
    });
  });

  it('keeps seasons and episodes in custom lists', () => {
    const [{ items }] = aggregateCustomLists([
      { ids: { slug: 'faves', trakt: 77 }, items: rawEntries, name: 'Faves' },
    ]);

    expect(keysOf(items)).toEqual([
      'episode-1399-1-1',
      'season-1396-0',
      'season-1396-1',
      'season-1396-2',
      'tv-1396',
    ]);
  });

  it('counts an episode without usable numbers as its show', () => {
    const watchlist = aggregateWatchlist([
      {
        episode: { number: undefined, season: 1, title: 'Unknown' },
        listed_at: '2026-01-05T00:00:00.000Z',
        show: rawShow,
        type: 'episode',
      },
    ]);

    expect(keysOf(watchlist)).toEqual(['tv-1396']);
  });

  it('keeps one entry per season when a season is listed twice', () => {
    const watchlist = aggregateWatchlist([
      rawEntries[1],
      { ...rawEntries[1], listed_at: '2026-02-01T00:00:00.000Z' },
    ]);

    expect(watchlist).toHaveLength(1);
    expect(watchlist[0].listed_at).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('findFoldedSeasonShowKeys', () => {
  const T1 = new Date('2025-01-26T07:45:16.000Z').getTime();
  const T2 = new Date('2025-02-01T10:00:00.000Z').getTime();
  const season = (tvId: number, n: number, addedAt: number) => ({
    addedAt,
    id: tvId,
    media_type: 'season',
    season_number: n,
  });
  const tv = (tvId: number, addedAt: unknown) => ({
    addedAt,
    id: tvId,
    media_type: 'tv',
    title: 'Show',
  });

  it('finds a show entry that an earlier sync folded from a season', () => {
    expect(
      findFoldedSeasonShowKeys(
        { 'season-1396-2': season(1396, 2, T1), 'season-1396-3': season(1396, 3, T2) },
        { 'tv-1396': tv(1396, T2) }
      )
    ).toEqual(['tv-1396']);
  });

  it('matches the time however it was stored', () => {
    expect(
      findFoldedSeasonShowKeys(
        { 'season-1396-2': season(1396, 2, T1) },
        { 'tv-1396': tv(1396, new Date(T1).toISOString()) }
      )
    ).toEqual(['tv-1396']);
  });

  it('keeps a show added in ShowSeek, at its own time', () => {
    expect(
      findFoldedSeasonShowKeys(
        { 'season-1396-2': season(1396, 2, T1) },
        { 'tv-1396': tv(1396, T1 + 1) }
      )
    ).toEqual([]);
  });

  it('finds a show entry that an earlier sync folded from an episode', () => {
    expect(
      findFoldedSeasonShowKeys(
        {
          'episode-1396-2-12': {
            addedAt: T1,
            episode_number: 12,
            id: 1396,
            media_type: 'episode',
            season_number: 2,
          },
        },
        { 'tv-1396': tv(1396, T1) }
      )
    ).toEqual(['tv-1396']);
  });

  it('keeps a show Trakt still lists itself', () => {
    expect(
      findFoldedSeasonShowKeys(
        { 'season-1396-2': season(1396, 2, T1), 'tv-1396': tv(1396, T1) },
        { 'tv-1396': tv(1396, T1) }
      )
    ).toEqual([]);
  });

  it('leaves shows alone when Trakt lists none of their seasons', () => {
    expect(
      findFoldedSeasonShowKeys(
        { 'season-1399-1': season(1399, 1, T1) },
        { 'tv-1396': tv(1396, T1) }
      )
    ).toEqual([]);
  });
});
