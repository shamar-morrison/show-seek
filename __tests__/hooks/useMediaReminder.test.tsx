import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import {
  canUseNonCriticalRead,
  registerSessionReadCount,
  resetReadBudgetForSession,
} from '@/src/services/ReadBudgetGuard';
import { useMediaReminder } from '@/src/hooks/useReminders';
import type { Reminder } from '@/src/types/reminder';

const mockGetActiveReminders = jest.fn();
let mockCurrentUser: { uid: string; isAnonymous?: boolean } | null = {
  uid: 'user-1',
  isAnonymous: false,
};

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
  db: {},
}));

jest.mock('@/src/services/ReminderService', () => ({
  reminderService: {
    getActiveReminders: (...args: unknown[]) => mockGetActiveReminders(...args),
  },
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {},
}));

const cachedReminder = {
  id: 'tv-609',
  userId: 'user-1',
  mediaType: 'tv',
  mediaId: 609,
  title: 'Cached Show',
  posterPath: null,
  releaseDate: '2030-01-01',
  reminderTiming: 'on_release_day',
  // Far-future so the auto-rollover hook skips it (it only acts on past-due).
  notificationScheduledFor: Date.now() + 86_400_000,
  localNotificationId: 'local-1',
  status: 'active',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  tvFrequency: 'season_premiere',
} as unknown as Reminder;

const createWrapper = (client: QueryClient) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe('useMediaReminder with exhausted read budget', () => {
  beforeEach(() => {
    resetReadBudgetForSession();
    mockCurrentUser = { uid: 'user-1', isAnonymous: false };
    mockGetActiveReminders.mockResolvedValue([cachedReminder]);
  });

  afterEach(() => {
    resetReadBudgetForSession();
  });

  it('still reflects a cached reminder when the budget is exhausted', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(['reminders', 'user-1'], [cachedReminder]);

    registerSessionReadCount(1000);
    // Precondition: the scenario under test (budget exhausted, lite mode on).
    expect(canUseNonCriticalRead(1)).toBe(false);

    const { result } = renderHook(() => useMediaReminder(609, 'tv'), {
      wrapper: createWrapper(client),
    });

    expect(result.current.hasReminder).toBe(true);
    expect(result.current.reminder?.id).toBe('tv-609');
    // The budget gate must stop new fetches without touching cached data.
    expect(mockGetActiveReminders).not.toHaveBeenCalled();
  });

  it('reflects a cached reminder when the budget is available', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(['reminders', 'user-1'], [cachedReminder]);

    expect(canUseNonCriticalRead(1)).toBe(true);

    const { result } = renderHook(() => useMediaReminder(609, 'tv'), {
      wrapper: createWrapper(client),
    });

    expect(result.current.hasReminder).toBe(true);
    expect(result.current.reminder?.id).toBe('tv-609');
  });

  it('returns empty (not loading forever) when nothing is cached and fetches are gated off', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    registerSessionReadCount(1000);
    expect(canUseNonCriticalRead(1)).toBe(false);

    const { result } = renderHook(() => useMediaReminder(609, 'tv'), {
      wrapper: createWrapper(client),
    });

    expect(result.current.hasReminder).toBe(false);
    expect(result.current.reminder).toBeNull();
    expect(mockGetActiveReminders).not.toHaveBeenCalled();
  });
});
