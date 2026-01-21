import { NextEpisodeInfo, ReminderTiming } from '@/src/types/reminder';
import {
  calculateNotificationTime,
  hasEpisodeChanged,
  isNotificationTimeInPast,
} from '@/src/utils/reminderHelpers';

describe('reminderHelpers', () => {
  describe('hasEpisodeChanged', () => {
    it('should return false when both are null/undefined', () => {
      expect(hasEpisodeChanged(null, null)).toBe(false);
      expect(hasEpisodeChanged(undefined, null)).toBe(false);
    });

    it('should return true when one is null and other exists', () => {
      const episode: NextEpisodeInfo = {
        seasonNumber: 1,
        episodeNumber: 1,
        episodeName: 'Pilot',
        airDate: '2024-06-15',
      };
      expect(hasEpisodeChanged(null, episode)).toBe(true);
      expect(hasEpisodeChanged(episode, null)).toBe(true);
    });

    it('should return false when episodes are identical', () => {
      const episode: NextEpisodeInfo = {
        seasonNumber: 2,
        episodeNumber: 5,
        episodeName: 'Episode 5',
        airDate: '2024-07-20',
      };
      expect(hasEpisodeChanged(episode, { ...episode })).toBe(false);
    });

    it('should return true when season number changes', () => {
      const current: NextEpisodeInfo = {
        seasonNumber: 1,
        episodeNumber: 10,
        episodeName: 'Finale',
        airDate: '2024-06-15',
      };
      const latest: NextEpisodeInfo = {
        seasonNumber: 2,
        episodeNumber: 1,
        episodeName: 'Premiere',
        airDate: '2024-09-15',
      };
      expect(hasEpisodeChanged(current, latest)).toBe(true);
    });

    it('should return true when episode number changes', () => {
      const current: NextEpisodeInfo = {
        seasonNumber: 1,
        episodeNumber: 5,
        episodeName: 'Episode 5',
        airDate: '2024-06-15',
      };
      const latest: NextEpisodeInfo = {
        seasonNumber: 1,
        episodeNumber: 6,
        episodeName: 'Episode 6',
        airDate: '2024-06-22',
      };
      expect(hasEpisodeChanged(current, latest)).toBe(true);
    });

    it('should return true when air date changes', () => {
      const current: NextEpisodeInfo = {
        seasonNumber: 1,
        episodeNumber: 5,
        episodeName: 'Episode 5',
        airDate: '2024-06-15',
      };
      const latest: NextEpisodeInfo = {
        seasonNumber: 1,
        episodeNumber: 5,
        episodeName: 'Episode 5',
        airDate: '2024-06-22', // Date changed
      };
      expect(hasEpisodeChanged(current, latest)).toBe(true);
    });
  });

  describe('calculateNotificationTime', () => {
    it('should calculate notification for release day at 9 AM EST (14:00 UTC)', () => {
      const releaseDate = '2024-06-15';
      const timing: ReminderTiming = 'on_release_day';
      const result = calculateNotificationTime(releaseDate, timing);

      const resultDate = new Date(result);
      expect(resultDate.getUTCHours()).toBe(14);
      expect(resultDate.getUTCMinutes()).toBe(0);
    });

    it('should calculate notification 1 day before release', () => {
      const releaseDate = '2024-06-15';
      const timing: ReminderTiming = '1_day_before';
      const result = calculateNotificationTime(releaseDate, timing);

      const resultDate = new Date(result);
      // Should be June 14, 2024
      expect(resultDate.getUTCDate()).toBe(14);
      expect(resultDate.getUTCMonth()).toBe(5); // June = 5
    });

    it('should calculate notification 1 week before release', () => {
      const releaseDate = '2024-06-15';
      const timing: ReminderTiming = '1_week_before';
      const result = calculateNotificationTime(releaseDate, timing);

      const resultDate = new Date(result);
      // Should be June 8, 2024
      expect(resultDate.getUTCDate()).toBe(8);
      expect(resultDate.getUTCMonth()).toBe(5); // June = 5
    });
  });

  describe('isNotificationTimeInPast', () => {
    // Note: __DEV__ is set to false in jest.setup.js, so we test production behavior

    it('should return true for past dates', () => {
      const pastDate = '2020-01-01';
      expect(isNotificationTimeInPast(pastDate, 'on_release_day')).toBe(true);
      expect(isNotificationTimeInPast(pastDate, '1_day_before')).toBe(true);
      expect(isNotificationTimeInPast(pastDate, '1_week_before')).toBe(true);
    });

    it('should return false for far future dates', () => {
      const futureDate = '2030-12-31';
      expect(isNotificationTimeInPast(futureDate, 'on_release_day')).toBe(false);
      expect(isNotificationTimeInPast(futureDate, '1_day_before')).toBe(false);
      expect(isNotificationTimeInPast(futureDate, '1_week_before')).toBe(false);
    });
  });
});
