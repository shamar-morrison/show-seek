import type { ListMediaItem } from '@/src/services/ListService';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  filterMediaItems,
  getListItemMediaKey,
  getStoredListItemRuntime,
} from '@/src/utils/listFilters';
import { collapseSeasonsToShows } from '@/src/utils/listItemShows';
import { compareListItemTitles, getItemRuntime, getItemUserRating } from '@/src/utils/listSort';

const item = (overrides: Partial<ListMediaItem>): ListMediaItem =>
  ({
    title: '',
    poster_path: null,
    vote_average: 0,
    release_date: '',
    addedAt: 0,
    ...overrides,
  }) as ListMediaItem;

const movie = item({ id: 1, media_type: 'movie', title: 'Alien', runtimeMinutes: 117 });
const show = item({ id: 1396, media_type: 'tv', title: 'Breaking Bad', genre_ids: [18] });
const season = (n: number, overrides: Partial<ListMediaItem> = {}) =>
  item({
    id: 1396,
    media_type: 'season',
    season_number: n,
    show_name: 'Breaking Bad',
    title: `Breaking Bad · Season ${n}`,
    genre_ids: [18],
    ...overrides,
  });

describe('season list entries in filters and sort', () => {
  it('keys each season apart from its show', () => {
    expect(getListItemMediaKey(season(3))).toBe('season:1396:3');
    expect(getListItemMediaKey(season(0))).toBe('season:1396:0');
    expect(getListItemMediaKey(show)).toBe('tv:1396');
  });

  it("only trusts a season's own runtime field", () => {
    // `runtimeMinutes` alone may be a wrong value written by an older app version.
    expect(getStoredListItemRuntime(season(1, { runtimeMinutes: 117 }))).toBeUndefined();
    expect(
      getStoredListItemRuntime(season(1, { runtimeMinutes: 300, seasonRuntimeMinutes: 300 }))
    ).toBe(300);
    expect(getItemRuntime(season(2), new Map([['season:1396:2', 420]]))).toBe(420);
    expect(getStoredListItemRuntime(movie)).toBe(117);
  });

  it('uses the season rating for rating sort and filters', () => {
    const ratings = new Map([
      ['season:1396:3', 9],
      ['tv:1396', 6],
    ]);
    expect(getItemUserRating(season(3), ratings)).toBe(9);
    expect(getItemUserRating(show, ratings)).toBe(6);

    const rated = filterMediaItems(
      [show, season(3), season(4)],
      {
        ...DEFAULT_WATCH_STATUS_FILTERS,
        userRating: 8,
      },
      { userRatings: ratings }
    );
    expect(rated).toEqual([season(3)]);
  });

  it('filters by the Seasons type, and genre filters keep seasons', () => {
    const items = [movie, show, season(1), season(0)];
    expect(
      filterMediaItems(items, { ...DEFAULT_WATCH_STATUS_FILTERS, mediaType: 'season' })
    ).toEqual([season(1), season(0)]);
    expect(filterMediaItems(items, { ...DEFAULT_WATCH_STATUS_FILTERS, genres: [18] })).toEqual([
      show,
      season(1),
      season(0),
    ]);
  });

  it('sorts seasons by show name, then season number', () => {
    const sorted = [season(10), movie, season(2), show, season(0)].sort((a, b) =>
      compareListItemTitles(a, b, 1)
    );
    expect(sorted.map((entry) => entry.title)).toEqual([
      'Alien',
      'Breaking Bad',
      'Breaking Bad · Season 0',
      'Breaking Bad · Season 2',
      'Breaking Bad · Season 10',
    ]);
  });
});

describe('collapseSeasonsToShows', () => {
  it('counts seasons as their show, once', () => {
    const collapsed = collapseSeasonsToShows([movie, season(1), season(2)]);

    expect(collapsed).toHaveLength(2);
    expect(collapsed[1]).toMatchObject({ id: 1396, media_type: 'tv', title: 'Breaking Bad' });
    expect(collapsed[1].season_number).toBeUndefined();
  });

  it('keeps the listed show and drops its seasons', () => {
    expect(collapseSeasonsToShows([season(1), show, season(2)])).toEqual([show]);
  });
});
