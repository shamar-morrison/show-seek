import AsyncStorage from '@react-native-async-storage/async-storage';

const mockGetUpcomingTVShows = jest.fn();

jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getUpcomingTVShows: (...args: unknown[]) => mockGetUpcomingTVShows(...args),
  },
}));

jest.mock('@/src/firebase/config', () => ({
  db: {},
}));

jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: () => 'mock-error',
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  getDoc: jest.fn(),
}));

const mockGetUserList = jest.fn();

jest.mock('@/src/services/ListService', () => ({
  listService: {
    getUserList: (...args: unknown[]) => mockGetUserList(...args),
  },
}));

jest.mock('@/src/services/sharedPreferencesService', () => ({
  writeToSharedPreferences: jest.fn().mockResolvedValue(undefined),
}));

import { getUpcomingTVShows, getUserWatchlist } from '@/src/services/widgetDataService';

const talkShow = {
  id: 9001,
  name: 'The Tonight Show Starring Jimmy Fallon',
  poster_path: '/fallon.jpg',
  first_air_date: '2026-02-01',
  genre_ids: [10767],
};

const scriptedShow = {
  id: 9002,
  name: 'Breaking Bad',
  poster_path: '/breaking.jpg',
  first_air_date: '2026-02-01',
  genre_ids: [18],
};

describe('widgetDataService getUpcomingTVShows', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockGetUpcomingTVShows.mockResolvedValue({ results: [talkShow, scriptedShow] });
  });

  it('excludes talk shows when the preference is on', async () => {
    const items = await getUpcomingTVShows(5, true);

    expect(items.map((item) => item.id)).toEqual([9002]);
  });

  it('includes talk shows when the preference is off', async () => {
    const items = await getUpcomingTVShows(5, false);

    expect(items.map((item) => item.id)).toEqual([9001, 9002]);
  });

  it('partitions the cache by preference so toggling refetches instead of reusing stale results', async () => {
    await getUpcomingTVShows(5, true);
    expect(mockGetUpcomingTVShows).toHaveBeenCalledTimes(1);

    // Toggling the preference must not reuse the filtered cache entry:
    // without key partitioning this returns the cached filtered list
    // without calling the API again.
    const unfiltered = await getUpcomingTVShows(5, false);
    expect(mockGetUpcomingTVShows).toHaveBeenCalledTimes(2);
    expect(unfiltered.map((item) => item.id)).toEqual([9001, 9002]);

    // Same flag twice reuses the cache (no extra fetch).
    await getUpcomingTVShows(5, false);
    expect(mockGetUpcomingTVShows).toHaveBeenCalledTimes(2);
  });
});

describe('widgetDataService getUserWatchlist', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('shows each show once, with its seasons and episodes counted as the show', async () => {
    const entry = (key: string, addedAt: number, fields: Record<string, unknown>) => [
      key,
      { poster_path: `/${key}.jpg`, vote_average: 0, release_date: '', addedAt, ...fields },
    ];
    mockGetUserList.mockResolvedValue({
      id: 'watchlist',
      name: 'Should Watch',
      items: Object.fromEntries([
        entry('episode-1396-2-12', 5, {
          id: 1396,
          media_type: 'episode',
          season_number: 2,
          episode_number: 12,
          show_name: 'Breaking Bad',
          title: 'Breaking Bad · S2E12 · Phoenix',
        }),
        entry('movie-1', 4, { id: 1, media_type: 'movie', title: 'Alien' }),
        entry('season-1396-3', 3, {
          id: 1396,
          media_type: 'season',
          season_number: 3,
          show_name: 'Breaking Bad',
          title: 'Breaking Bad · Season 3',
        }),
        entry('episode-60059-1-1', 2, {
          id: 60059,
          media_type: 'episode',
          season_number: 1,
          episode_number: 1,
          show_name: 'Better Call Saul',
          title: 'Better Call Saul · S1E1 · Uno',
        }),
      ]),
    });

    const result = await getUserWatchlist('test-user', 'watchlist');

    expect(result.items).toEqual([
      expect.objectContaining({ id: 1396, title: 'Breaking Bad', mediaType: 'tv' }),
      expect.objectContaining({ id: 1, title: 'Alien', mediaType: 'movie' }),
      expect.objectContaining({ id: 60059, title: 'Better Call Saul', mediaType: 'tv' }),
    ]);
  });
});
