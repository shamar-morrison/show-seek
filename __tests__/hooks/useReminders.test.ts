import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import type { Reminder } from '@/src/types/reminder';

const mockGetActiveReminders = jest.fn();
const mockCreateReminder = jest.fn();
const mockCancelReminder = jest.fn();
const mockUpdateReminder = jest.fn();
const mockUpdateReminderDetails = jest.fn();
const mockCanUseNonCriticalRead = jest.fn();
const mockGetTVShowDetails = jest.fn();
const mockGetSubsequentEpisode = jest.fn();

const mockAuthState = {
  currentUser: { uid: 'test-user-id' } as { uid: string } | null,
};

const mockPremiumState = {
  isPremium: false,
  isLoading: false,
};

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockAuthState.currentUser;
    },
  },
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
}));

jest.mock('@/src/services/ReminderService', () => ({
  reminderService: {
    getActiveReminders: (...args: unknown[]) => mockGetActiveReminders(...args),
    createReminder: (...args: unknown[]) => mockCreateReminder(...args),
    cancelReminder: (...args: unknown[]) => mockCancelReminder(...args),
    updateReminder: (...args: unknown[]) => mockUpdateReminder(...args),
    updateReminderDetails: (...args: unknown[]) => mockUpdateReminderDetails(...args),
  },
}));

jest.mock('@/src/services/ReadBudgetGuard', () => ({
  canUseNonCriticalRead: (...args: unknown[]) => mockCanUseNonCriticalRead(...args),
}));

jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getTVShowDetails: (...args: unknown[]) => mockGetTVShowDetails(...args),
  },
}));

jest.mock('@/src/utils/subsequentEpisodeHelpers', () => ({
  getSubsequentEpisode: (...args: unknown[]) => mockGetSubsequentEpisode(...args),
}));

import {
  useCanCreateReminder,
  useCreateReminder,
  useMediaReminder,
  useReminders,
} from '@/src/hooks/useReminders';

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

const createReminder = (overrides: Partial<Reminder> = {}): Reminder =>
  ({
  id: 'movie-1',
  userId: 'test-user-id',
  mediaType: 'movie',
  mediaId: 1,
  title: 'Reminder Title',
  posterPath: null,
  releaseDate: '2026-05-01',
  reminderTiming: 'on_release_day',
  notificationScheduledFor: Date.now() + 86400000,
  localNotificationId: null,
  status: 'active',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
}) as Reminder;

beforeAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => act(fn));
});

afterAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => fn());
});

describe('useReminders hooks', () => {
  beforeEach(() => {
    mockGetActiveReminders.mockReset();
    mockCreateReminder.mockReset();
    mockCancelReminder.mockReset();
    mockUpdateReminder.mockReset();
    mockUpdateReminderDetails.mockReset();
    mockCanUseNonCriticalRead.mockReset();
    mockGetTVShowDetails.mockReset();
    mockGetSubsequentEpisode.mockReset();
    mockAuthState.currentUser = { uid: 'test-user-id' };
    mockPremiumState.isPremium = false;
    mockPremiumState.isLoading = false;
    mockCanUseNonCriticalRead.mockReturnValue(true);
    mockGetActiveReminders.mockResolvedValue([
      createReminder({
        id: 'tv-100',
        mediaType: 'tv',
        mediaId: 100,
        title: 'Breaking Bad',
      }),
      createReminder({
        id: 'movie-200',
        mediaType: 'movie',
        mediaId: 200,
        title: 'Dune',
      }),
    ]);
    mockCreateReminder.mockResolvedValue(undefined);
    mockCancelReminder.mockResolvedValue(undefined);
    mockUpdateReminder.mockResolvedValue(undefined);
    mockUpdateReminderDetails.mockResolvedValue(undefined);
    mockGetTVShowDetails.mockResolvedValue({
      next_episode_to_air: null,
    });
    mockGetSubsequentEpisode.mockResolvedValue(null);
  });

  describe('useMediaReminder', () => {
    it('returns reminder for TV show with active reminder', async () => {
      const client = createQueryClient();
      const { result } = renderHook(() => useMediaReminder(100, 'tv'), {
        wrapper: createWrapper(client),
      });

      await waitFor(() => {
        expect(result.current.hasReminder).toBe(true);
        expect(result.current.reminder?.title).toBe('Breaking Bad');
      });
    });

    it('returns reminder for movie with active reminder', async () => {
      const client = createQueryClient();
      const { result } = renderHook(() => useMediaReminder(200, 'movie'), {
        wrapper: createWrapper(client),
      });

      await waitFor(() => {
        expect(result.current.hasReminder).toBe(true);
        expect(result.current.reminder?.title).toBe('Dune');
      });
    });

    it('returns null for media without a reminder', async () => {
      const client = createQueryClient();
      const { result } = renderHook(() => useMediaReminder(999, 'movie'), {
        wrapper: createWrapper(client),
      });

      await waitFor(() => {
        expect(result.current.hasReminder).toBe(false);
        expect(result.current.reminder).toBeNull();
      });
    });

    it('does not match reminder when media type differs', async () => {
      const client = createQueryClient();
      const { result } = renderHook(() => useMediaReminder(100, 'movie'), {
        wrapper: createWrapper(client),
      });

      await waitFor(() => {
        expect(result.current.hasReminder).toBe(false);
        expect(result.current.reminder).toBeNull();
      });
    });
  });

  describe('useCreateReminder', () => {
    it('blocks creating a new reminder when a free user already has 3 reminders', async () => {
      const client = createQueryClient();
      mockGetActiveReminders.mockResolvedValueOnce([
        createReminder({ id: 'movie-1', mediaId: 1, title: 'One' }),
        createReminder({ id: 'movie-2', mediaId: 2, title: 'Two' }),
        createReminder({ id: 'tv-3', mediaType: 'tv', mediaId: 3, title: 'Three' }),
      ]);

      const { result } = renderHook(() => useCreateReminder(), {
        wrapper: createWrapper(client),
      });

      await act(async () => {
        await expect(
          result.current.mutateAsync({
            mediaType: 'movie',
            mediaId: 999,
            title: 'Blocked Reminder',
            posterPath: null,
            releaseDate: '2026-06-01',
            reminderTiming: 'on_release_day',
          })
        ).rejects.toMatchObject({
          code: 'FREEMIUM_LIMIT',
          feature: 'reminders',
          maxFreeCount: 3,
        });
      });

      expect(mockCreateReminder).not.toHaveBeenCalled();
    });

    it('allows recreating an existing reminder when a free user is already at the limit', async () => {
      const client = createQueryClient();
      mockGetActiveReminders.mockResolvedValueOnce([
        createReminder({ id: 'movie-1', mediaId: 1, title: 'One' }),
        createReminder({ id: 'movie-200', mediaId: 200, title: 'Existing Reminder' }),
        createReminder({ id: 'tv-3', mediaType: 'tv', mediaId: 3, title: 'Three' }),
      ]);

      const { result } = renderHook(() => useCreateReminder(), {
        wrapper: createWrapper(client),
      });

      await act(async () => {
        await expect(
          result.current.mutateAsync({
            mediaType: 'movie',
            mediaId: 200,
            title: 'Existing Reminder',
            posterPath: null,
            releaseDate: '2026-06-01',
            reminderTiming: '1_day_before',
          })
        ).resolves.toBeUndefined();
      });

      expect(mockCreateReminder).toHaveBeenCalledTimes(1);
    });

    it('does not apply the reminder limit to premium users', async () => {
      const client = createQueryClient();
      mockPremiumState.isPremium = true;
      mockGetActiveReminders.mockResolvedValueOnce([
        createReminder({ id: 'movie-1', mediaId: 1, title: 'One' }),
        createReminder({ id: 'movie-2', mediaId: 2, title: 'Two' }),
        createReminder({ id: 'tv-3', mediaType: 'tv', mediaId: 3, title: 'Three' }),
      ]);

      const { result } = renderHook(() => useCreateReminder(), {
        wrapper: createWrapper(client),
      });

      await act(async () => {
        await expect(
          result.current.mutateAsync({
            mediaType: 'movie',
            mediaId: 999,
            title: 'Premium Reminder',
            posterPath: null,
            releaseDate: '2026-06-01',
            reminderTiming: 'on_release_day',
          })
        ).resolves.toBeUndefined();
      });

      expect(mockCreateReminder).toHaveBeenCalledTimes(1);
    });

    it('refetches stale cached reminders through fetchQuery before enforcing limits', async () => {
      const client = createQueryClient();
      const fetchQuerySpy = jest.spyOn(client, 'fetchQuery');

      client.setQueryData(['reminders', 'test-user-id'], [
        createReminder({ id: 'movie-1', mediaId: 1, title: 'Cached Reminder' }),
      ]);
      await client.invalidateQueries({ queryKey: ['reminders', 'test-user-id'] });

      mockGetActiveReminders.mockResolvedValueOnce([
        createReminder({ id: 'movie-1', mediaId: 1, title: 'One' }),
        createReminder({ id: 'movie-2', mediaId: 2, title: 'Two' }),
        createReminder({ id: 'tv-3', mediaType: 'tv', mediaId: 3, title: 'Three' }),
      ]);

      const { result } = renderHook(() => useCreateReminder(), {
        wrapper: createWrapper(client),
      });

      await act(async () => {
        await expect(
          result.current.mutateAsync({
            mediaType: 'movie',
            mediaId: 999,
            title: 'Blocked Reminder',
            posterPath: null,
            releaseDate: '2026-06-01',
            reminderTiming: 'on_release_day',
          })
        ).rejects.toMatchObject({
          code: 'FREEMIUM_LIMIT',
          feature: 'reminders',
          maxFreeCount: 3,
        });
      });

      expect(fetchQuerySpy).toHaveBeenCalledTimes(1);
      expect(mockGetActiveReminders).toHaveBeenCalledTimes(1);
      expect(mockCreateReminder).not.toHaveBeenCalled();
    });

    it('blocks creating a new reminder while premium status is still loading', async () => {
      const client = createQueryClient();
      mockPremiumState.isLoading = true;
      mockGetActiveReminders.mockResolvedValueOnce([]);

      const { result } = renderHook(() => useCreateReminder(), {
        wrapper: createWrapper(client),
      });

      await act(async () => {
        await expect(
          result.current.mutateAsync({
            mediaType: 'movie',
            mediaId: 999,
            title: 'Blocked Reminder',
            posterPath: null,
            releaseDate: '2026-06-01',
            reminderTiming: 'on_release_day',
          })
        ).rejects.toMatchObject({
          code: 'PREMIUM_STATUS_PENDING',
        });
      });

      expect(mockCreateReminder).not.toHaveBeenCalled();
    });

    it('allows opening an existing reminder while premium status is still loading', async () => {
      const client = createQueryClient();
      mockPremiumState.isLoading = true;
      client.setQueryData(['reminders', 'test-user-id'], [
        createReminder({ id: 'movie-1', mediaId: 1, title: 'One' }),
        createReminder({ id: 'movie-200', mediaId: 200, title: 'Existing Reminder' }),
        createReminder({ id: 'tv-3', mediaType: 'tv', mediaId: 3, title: 'Three' }),
      ]);

      const { result } = renderHook(() => useCanCreateReminder(), {
        wrapper: createWrapper(client),
      });

      await act(async () => {
        await expect(result.current({ mediaType: 'movie', mediaId: 200 })).resolves.toBe(true);
      });

      expect(mockGetActiveReminders).not.toHaveBeenCalled();
      expect(mockCreateReminder).not.toHaveBeenCalled();
    });

    it('allows recreating a reminder during premium loading when caller provides the prior id', async () => {
      const client = createQueryClient();
      mockPremiumState.isLoading = true;
      mockGetActiveReminders.mockResolvedValueOnce([
        createReminder({ id: 'movie-1', mediaId: 1, title: 'One' }),
        createReminder({ id: 'movie-2', mediaId: 2, title: 'Two' }),
      ]);

      const { result } = renderHook(() => useCreateReminder(), {
        wrapper: createWrapper(client),
      });

      await act(async () => {
        await expect(
          result.current.mutateAsync({
            mediaType: 'tv',
            mediaId: 200,
            title: 'Existing TV Reminder',
            posterPath: null,
            releaseDate: '2026-06-01',
            reminderTiming: '1_day_before',
            tvFrequency: 'season_premiere',
            existingReminderId: 'tv-200',
          })
        ).resolves.toBeUndefined();
      });

      expect(mockCreateReminder).toHaveBeenCalledTimes(1);
    });
  });

  describe('useReminders auto-update', () => {
    const staleEpisodeReminder = (overrides: Partial<Reminder> = {}): Reminder =>
      createReminder({
        id: 'tv-100',
        mediaType: 'tv',
        mediaId: 100,
        title: 'Breaking Bad',
        releaseDate: '2026-06-16',
        reminderTiming: 'on_release_day',
        notificationScheduledFor: Date.now() - 60_000,
        tvFrequency: 'every_episode',
        nextEpisode: {
          seasonNumber: 1,
          episodeNumber: 1,
          episodeName: 'Pilot',
          airDate: '2026-06-16',
        },
        ...overrides,
      });

    it('advances a stale every-episode reminder and updates caches immediately', async () => {
      const client = createQueryClient();
      const reminder = staleEpisodeReminder();
      const nextEpisode = {
        seasonNumber: 1,
        episodeNumber: 2,
        episodeName: 'Second',
        airDate: '2026-06-23',
      };
      const nextNotificationScheduledFor = Date.now() + 86_400_000;

      mockGetActiveReminders.mockResolvedValueOnce([reminder]);
      mockGetTVShowDetails.mockResolvedValueOnce({
        next_episode_to_air: {
          season_number: 1,
          episode_number: 2,
          name: 'Second',
          air_date: '2026-06-23',
        },
      });
      mockUpdateReminderDetails.mockResolvedValueOnce({
        releaseDate: '2026-06-23',
        nextEpisode,
        notificationScheduledFor: nextNotificationScheduledFor,
        localNotificationId: 'updated-notification-id',
        updatedAt: 555,
        noNextEpisodeFound: false,
      });

      const { result } = renderHook(() => useReminders(), {
        wrapper: createWrapper(client),
      });

      await waitFor(() => {
        expect(result.current.data[0]).toEqual(
          expect.objectContaining({
            id: 'tv-100',
            releaseDate: '2026-06-23',
            nextEpisode,
            notificationScheduledFor: nextNotificationScheduledFor,
            localNotificationId: 'updated-notification-id',
          })
        );
      });

      expect(client.getQueryData(['reminder', 'test-user-id', 'tv', 100])).toEqual(
        expect.objectContaining({
          id: 'tv-100',
          releaseDate: '2026-06-23',
          nextEpisode,
          notificationScheduledFor: nextNotificationScheduledFor,
        })
      );
    });

    it('falls back to the subsequent episode when TMDB still points at the released episode', async () => {
      const client = createQueryClient();
      const reminder = staleEpisodeReminder();
      const nextEpisode = {
        seasonNumber: 1,
        episodeNumber: 2,
        episodeName: 'Second',
        airDate: '2026-06-23',
      };
      const nextNotificationScheduledFor = Date.now() + 86_400_000;

      mockGetActiveReminders.mockResolvedValueOnce([reminder]);
      mockGetTVShowDetails.mockResolvedValueOnce({
        next_episode_to_air: {
          season_number: 1,
          episode_number: 1,
          name: 'Pilot',
          air_date: '2026-06-16',
        },
      });
      mockGetSubsequentEpisode.mockResolvedValueOnce(nextEpisode);
      mockUpdateReminderDetails.mockResolvedValueOnce({
        releaseDate: '2026-06-23',
        nextEpisode,
        notificationScheduledFor: nextNotificationScheduledFor,
        localNotificationId: 'updated-notification-id',
        updatedAt: 777,
        noNextEpisodeFound: false,
      });

      const { result } = renderHook(() => useReminders(), {
        wrapper: createWrapper(client),
      });

      await waitFor(() => {
        expect(result.current.data[0]).toEqual(
          expect.objectContaining({
            id: 'tv-100',
            releaseDate: '2026-06-23',
            nextEpisode,
            notificationScheduledFor: nextNotificationScheduledFor,
          })
        );
      });
    });

    it('keeps a stale reminder retryable when no later episode is available yet', async () => {
      const client = createQueryClient();
      const reminder = staleEpisodeReminder();
      const nextEpisode = {
        seasonNumber: 1,
        episodeNumber: 2,
        episodeName: 'Second',
        airDate: '2026-06-23',
      };
      const nextNotificationScheduledFor = Date.now() + 86_400_000;

      mockGetActiveReminders.mockResolvedValueOnce([reminder]);
      mockGetTVShowDetails.mockResolvedValueOnce({
        next_episode_to_air: {
          season_number: 1,
          episode_number: 1,
          name: 'Pilot',
          air_date: '2026-06-16',
        },
      });
      mockGetSubsequentEpisode.mockResolvedValueOnce(null).mockResolvedValueOnce(nextEpisode);
      mockUpdateReminderDetails.mockResolvedValueOnce({
        releaseDate: '2026-06-23',
        nextEpisode,
        notificationScheduledFor: nextNotificationScheduledFor,
        localNotificationId: 'updated-notification-id',
        updatedAt: 999,
        noNextEpisodeFound: false,
      });

      const { result } = renderHook(() => useReminders(), {
        wrapper: createWrapper(client),
      });

      await waitFor(() => {
        expect(client.getQueryData(['tv', 100])).toEqual(
          expect.objectContaining({
            next_episode_to_air: expect.objectContaining({
              episode_number: 1,
            }),
          })
        );
      });

      expect(result.current.data[0]).toEqual(expect.objectContaining({ releaseDate: '2026-06-16' }));

      await act(async () => {
        client.setQueryData(['reminders', 'test-user-id'], [
          {
            ...reminder,
            updatedAt: reminder.updatedAt + 1,
          },
        ]);
      });

      await waitFor(() => {
        expect(client.getQueryData(['reminders', 'test-user-id'])).toEqual([
          expect.objectContaining({
            releaseDate: '2026-06-23',
            nextEpisode,
            notificationScheduledFor: nextNotificationScheduledFor,
          }),
        ]);
        expect(client.getQueryData(['reminder', 'test-user-id', 'tv', 100])).toEqual(
          expect.objectContaining({
            releaseDate: '2026-06-23',
            nextEpisode,
            notificationScheduledFor: nextNotificationScheduledFor,
          })
        );
      });
    });

    it('rolls the same reminder document forward again after a later episode also becomes stale', async () => {
      const client = createQueryClient();
      const firstReminder = staleEpisodeReminder();
      const secondReminder = staleEpisodeReminder({
        releaseDate: '2026-06-23',
        notificationScheduledFor: Date.now() - 30_000,
        nextEpisode: {
          seasonNumber: 1,
          episodeNumber: 2,
          episodeName: 'Second',
          airDate: '2026-06-23',
        },
      });
      const secondEpisode = {
        seasonNumber: 1,
        episodeNumber: 2,
        episodeName: 'Second',
        airDate: '2026-06-23',
      };
      const thirdEpisode = {
        seasonNumber: 1,
        episodeNumber: 3,
        episodeName: 'Third',
        airDate: '2026-06-30',
      };
      const secondNotificationScheduledFor = Date.now() + 86_400_000;
      const thirdNotificationScheduledFor = Date.now() + 172_800_000;

      mockGetActiveReminders.mockResolvedValueOnce([firstReminder]);
      mockGetTVShowDetails.mockResolvedValueOnce({
        next_episode_to_air: {
          season_number: 1,
          episode_number: 2,
          name: 'Second',
          air_date: '2026-06-23',
        },
      });
      mockUpdateReminderDetails
        .mockResolvedValueOnce({
          releaseDate: '2026-06-23',
          nextEpisode: secondEpisode,
          notificationScheduledFor: secondNotificationScheduledFor,
          localNotificationId: 'updated-notification-id-2',
          updatedAt: 1001,
          noNextEpisodeFound: false,
        })
        .mockResolvedValueOnce({
          releaseDate: '2026-06-30',
          nextEpisode: thirdEpisode,
          notificationScheduledFor: thirdNotificationScheduledFor,
          localNotificationId: 'updated-notification-id-3',
          updatedAt: 1002,
          noNextEpisodeFound: false,
        });

      const { result } = renderHook(() => useReminders(), {
        wrapper: createWrapper(client),
      });

      await waitFor(() => {
        expect(result.current.data[0]).toEqual(
          expect.objectContaining({
            id: 'tv-100',
            releaseDate: '2026-06-23',
            nextEpisode: secondEpisode,
            notificationScheduledFor: secondNotificationScheduledFor,
            localNotificationId: 'updated-notification-id-2',
          })
        );
      });

      await act(async () => {
        client.setQueryData(['tv', 100], {
          next_episode_to_air: {
            season_number: 1,
            episode_number: 3,
            name: 'Third',
            air_date: '2026-06-30',
          },
        });
        client.setQueryData(['reminders', 'test-user-id'], [secondReminder]);
      });

      await waitFor(() => {
        expect(result.current.data[0]).toEqual(
          expect.objectContaining({
            id: 'tv-100',
            releaseDate: '2026-06-30',
            nextEpisode: thirdEpisode,
            notificationScheduledFor: thirdNotificationScheduledFor,
            localNotificationId: 'updated-notification-id-3',
          })
        );
      });
    });
  });
});
