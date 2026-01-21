import { ListMediaItem } from '@/src/services/ListService';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  filterMediaItems,
  filterRatingItems,
  hasActiveFilters,
  WatchStatusFilterState,
} from '@/src/utils/listFilters';

// Mock ListMediaItem data
const mockItems: ListMediaItem[] = [
  {
    id: 1,
    media_type: 'movie',
    title: 'Action Movie',
    genre_ids: [28, 12], // Action, Adventure
    vote_average: 8.5,
    release_date: '2024-06-15',
    addedAt: 1718400000000, // 2024-06-15T00:00:00Z
  } as ListMediaItem,
  {
    id: 2,
    media_type: 'tv',
    name: 'Drama Series',
    genre_ids: [18], // Drama
    vote_average: 7.2,
    first_air_date: '2023-03-20',
    addedAt: 1679270400000, // 2023-03-20T00:00:00Z
  } as ListMediaItem,
  {
    id: 3,
    media_type: 'movie',
    title: 'Low Rated Movie',
    genre_ids: [35], // Comedy
    vote_average: 4.5,
    release_date: '2022-01-10',
    addedAt: 1641772800000, // 2022-01-10T00:00:00Z
  } as ListMediaItem,
  {
    id: 4,
    media_type: 'movie',
    title: 'No Genre Movie',
    vote_average: 6.0,
    release_date: '2024-01-01',
    addedAt: 1704067200000, // 2024-01-01T00:00:00Z
  } as ListMediaItem,
];

describe('listFilters', () => {
  describe('filterMediaItems', () => {
    it('should return all items when no filters are active', () => {
      const result = filterMediaItems(mockItems, DEFAULT_WATCH_STATUS_FILTERS);
      expect(result).toHaveLength(4);
    });

    it('should filter by media type (movie)', () => {
      const filters: WatchStatusFilterState = {
        ...DEFAULT_WATCH_STATUS_FILTERS,
        mediaType: 'movie',
      };
      const result = filterMediaItems(mockItems, filters);
      expect(result).toHaveLength(3);
      expect(result.every((item) => item.media_type === 'movie')).toBe(true);
    });

    it('should filter by media type (tv)', () => {
      const filters: WatchStatusFilterState = {
        ...DEFAULT_WATCH_STATUS_FILTERS,
        mediaType: 'tv',
      };
      const result = filterMediaItems(mockItems, filters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
    });

    it('should filter by genre', () => {
      const filters: WatchStatusFilterState = {
        ...DEFAULT_WATCH_STATUS_FILTERS,
        genre: 28, // Action
      };
      const result = filterMediaItems(mockItems, filters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should exclude items without genre_ids when filtering by genre', () => {
      const filters: WatchStatusFilterState = {
        ...DEFAULT_WATCH_STATUS_FILTERS,
        genre: 28,
      };
      const result = filterMediaItems(mockItems, filters);
      // Item 4 has no genre_ids, should be excluded
      expect(result.find((item) => item.id === 4)).toBeUndefined();
    });

    it('should filter by minimum rating', () => {
      const filters: WatchStatusFilterState = {
        ...DEFAULT_WATCH_STATUS_FILTERS,
        rating: 7,
      };
      const result = filterMediaItems(mockItems, filters);
      expect(result).toHaveLength(2);
      expect(result.map((item) => item.id).sort()).toEqual([1, 2]);
    });

    it('should filter by year', () => {
      const filters: WatchStatusFilterState = {
        ...DEFAULT_WATCH_STATUS_FILTERS,
        year: 2024,
      };
      const result = filterMediaItems(mockItems, filters);
      expect(result).toHaveLength(2);
      expect(result.map((item) => item.id).sort()).toEqual([1, 4]);
    });

    it('should apply multiple filters together', () => {
      const filters: WatchStatusFilterState = {
        genre: null,
        year: 2024,
        rating: 7,
        mediaType: 'movie',
      };
      const result = filterMediaItems(mockItems, filters);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });
  });

  describe('filterRatingItems', () => {
    interface MockRatingItem {
      id: string;
      rating: number;
      media: {
        genre_ids?: number[];
        genres?: { id: number; name?: string }[];
        vote_average?: number;
        release_date?: string;
        first_air_date?: string;
      } | null;
    }

    const mockRatingItems: MockRatingItem[] = [
      {
        id: '1',
        rating: 8,
        media: {
          genre_ids: [28],
          vote_average: 8.5,
          release_date: '2024-06-15',
        },
      },
      {
        id: '2',
        rating: 6,
        media: {
          genres: [{ id: 18, name: 'Drama' }],
          vote_average: 7.0,
          first_air_date: '2023-03-20',
        },
      },
      {
        id: '3',
        rating: 5,
        media: null,
      },
    ];

    it('should filter items using getter function', () => {
      const filters: WatchStatusFilterState = {
        ...DEFAULT_WATCH_STATUS_FILTERS,
        genre: 28,
      };
      const result = filterRatingItems(mockRatingItems, filters, (item) => item.media);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should exclude items where media is null', () => {
      const result = filterRatingItems(
        mockRatingItems,
        DEFAULT_WATCH_STATUS_FILTERS,
        (item) => item.media
      );
      expect(result).toHaveLength(2);
      expect(result.find((item) => item.id === '3')).toBeUndefined();
    });

    it('should support genres array (from detail response) in addition to genre_ids', () => {
      const filters: WatchStatusFilterState = {
        ...DEFAULT_WATCH_STATUS_FILTERS,
        genre: 18, // Drama
      };
      const result = filterRatingItems(mockRatingItems, filters, (item) => item.media);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });
  });

  describe('hasActiveFilters', () => {
    it('should return false for default filters', () => {
      expect(hasActiveFilters(DEFAULT_WATCH_STATUS_FILTERS)).toBe(false);
    });

    it('should return true when genre is set', () => {
      expect(hasActiveFilters({ ...DEFAULT_WATCH_STATUS_FILTERS, genre: 28 })).toBe(true);
    });

    it('should return true when year is set', () => {
      expect(hasActiveFilters({ ...DEFAULT_WATCH_STATUS_FILTERS, year: 2024 })).toBe(true);
    });

    it('should return true when rating is non-zero', () => {
      expect(hasActiveFilters({ ...DEFAULT_WATCH_STATUS_FILTERS, rating: 5 })).toBe(true);
    });

    it('should return true when mediaType is not "all"', () => {
      expect(hasActiveFilters({ ...DEFAULT_WATCH_STATUS_FILTERS, mediaType: 'movie' })).toBe(true);
      expect(hasActiveFilters({ ...DEFAULT_WATCH_STATUS_FILTERS, mediaType: 'tv' })).toBe(true);
    });
  });
});
