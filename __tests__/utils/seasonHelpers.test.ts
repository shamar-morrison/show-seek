import type { Season } from '@/src/api/tmdb';
import { getNextUpcomingSeason } from '@/src/utils/seasonHelpers';

// Helper to create mock seasons
const createSeason = (
  seasonNumber: number,
  airDate: string | null,
  name = `Season ${seasonNumber}`
): Season =>
  ({
    id: seasonNumber * 100,
    season_number: seasonNumber,
    air_date: airDate,
    name,
    episode_count: 10,
    overview: '',
    poster_path: null,
  }) as Season;

describe('seasonHelpers', () => {
  describe('getNextUpcomingSeason', () => {
    // Use a fixed "today" for testing
    const originalDate = Date;

    beforeAll(() => {
      // Mock Date to return a fixed date: 2024-06-15
      const mockDate = new Date('2024-06-15T12:00:00Z');
      global.Date = class extends originalDate {
        constructor(...args: unknown[]) {
          if (args.length === 0) {
            super();
            return mockDate;
          }
          // @ts-expect-error - spread for Date constructor
          super(...args);
        }
      } as DateConstructor;
    });

    afterAll(() => {
      global.Date = originalDate;
    });

    it('should return nulls for undefined seasons', () => {
      const result = getNextUpcomingSeason(undefined);
      expect(result.nextSeasonAirDate).toBeNull();
      expect(result.nextSeasonNumber).toBeNull();
    });

    it('should return nulls for empty seasons array', () => {
      const result = getNextUpcomingSeason([]);
      expect(result.nextSeasonAirDate).toBeNull();
      expect(result.nextSeasonNumber).toBeNull();
    });

    it('should filter out season 0 (specials)', () => {
      const seasons = [
        createSeason(0, '2024-12-25'), // Future, but specials
        createSeason(1, '2024-01-01'), // Past
      ];
      const result = getNextUpcomingSeason(seasons);
      expect(result.nextSeasonAirDate).toBeNull();
      expect(result.nextSeasonNumber).toBeNull();
    });

    it('should return the next upcoming season', () => {
      const seasons = [
        createSeason(1, '2024-01-01'), // Past
        createSeason(2, '2024-07-01'), // Future
        createSeason(3, '2024-12-01'), // Future but later
      ];
      const result = getNextUpcomingSeason(seasons);
      expect(result.nextSeasonAirDate).toBe('2024-07-01');
      expect(result.nextSeasonNumber).toBe(2);
    });

    it('should return the earliest future season when multiple exist', () => {
      const seasons = [
        createSeason(3, '2025-01-01'),
        createSeason(1, '2024-08-01'), // Earliest future
        createSeason(2, '2024-10-01'),
      ];
      const result = getNextUpcomingSeason(seasons);
      expect(result.nextSeasonAirDate).toBe('2024-08-01');
      expect(result.nextSeasonNumber).toBe(1);
    });

    it('should handle seasons without air dates', () => {
      const seasons = [createSeason(1, null), createSeason(2, '2024-09-01')];
      const result = getNextUpcomingSeason(seasons);
      expect(result.nextSeasonAirDate).toBe('2024-09-01');
      expect(result.nextSeasonNumber).toBe(2);
    });

    it('should return nulls when all seasons are in the past', () => {
      const seasons = [
        createSeason(1, '2023-01-01'),
        createSeason(2, '2023-06-01'),
        createSeason(3, '2024-01-01'),
      ];
      const result = getNextUpcomingSeason(seasons);
      expect(result.nextSeasonAirDate).toBeNull();
      expect(result.nextSeasonNumber).toBeNull();
    });
  });
});
