import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockGetActiveReminders = jest.fn();
const mockCreateReminder = jest.fn();
const mockCancelReminder = jest.fn();
const mockUpdateReminder = jest.fn();
const mockUpdateReminderDetails = jest.fn();
const mockCanUseNonCriticalRead = jest.fn();

const mockAuthState = {
  currentUser: { uid: 'test-user-id' } as { uid: string } | null,
};

const mockPremiumState = {
  isPremium: false,
  isLoading: false,
};

jest.mock('@/src/hooks/useFirestoreAccess', () => ({
  useFirestoreAccess: () => {
    const currentUser = mockAuthState.currentUser as
      | { uid: string; isAnonymous?: boolean }
      | null;
    const isAnonymous = currentUser?.isAnonymous === true;

    return {
      user: currentUser,
      isAnonymous,
      signedInUserId: currentUser && !isAnonymous ? currentUser.uid : undefined,
      firestoreUserId: currentUser && !isAnonymous ? currentUser.uid : undefined,
      canUseFirestoreClient: Boolean(currentUser && !isAnonymous),
      canUseNonCriticalReads: Boolean(currentUser && !isAnonymous),
      canUsePremiumRealtime: Boolean(currentUser && !isAnonymous),
    };
  },
}));

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
    getTVShowDetails: jest.fn(),
  },
}));

import { useCanCreateReminder, useCreateReminder, useMediaReminder } from '@/src/hooks/useReminders';

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

const createReminder = (overrides: Record<string, unknown>) => ({
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
});

beforeAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => act(fn));
});

afterAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => fn());
});

describe('useReminders hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    it('does not fetch reminders for anonymous users', () => {
      mockAuthState.currentUser = { uid: 'anon-1', isAnonymous: true } as any;

      const client = createQueryClient();
      const { result } = renderHook(() => useMediaReminder(100, 'tv'), {
        wrapper: createWrapper(client),
      });

      expect(mockGetActiveReminders).not.toHaveBeenCalled();
      expect(result.current.hasReminder).toBe(false);
      expect(result.current.isLoading).toBe(false);
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
});
