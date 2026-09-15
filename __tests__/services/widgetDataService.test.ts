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

jest.mock('@/src/services/ListService', () => ({}));

jest.mock('@/src/services/sharedPreferencesService', () => ({
  writeToSharedPreferences: jest.fn().mockResolvedValue(undefined),
}));

import { getUpcomingTVShows } from '@/src/services/widgetDataService';

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
