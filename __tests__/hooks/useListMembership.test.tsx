import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { collection, getDocs } from 'firebase/firestore';
import React from 'react';

const mockPreferences = {
  showListIndicators: true,
};

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user-id' },
  }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: mockPreferences,
  }),
}));

import { useListMembership } from '@/src/hooks/useListMembership';
import {
  clearFirestoreReadAuditEvents,
  getFirestoreReadAuditReport,
} from '@/src/services/firestoreReadAudit';

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useListMembership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearFirestoreReadAuditEvents();
    mockPreferences.showListIndicators = true;
  });

  it('shares a single membership-index fetch across consumers and exposes membership map', async () => {
    const mockCollectionRef = { path: 'users/test-user-id/lists' };
    (collection as jest.Mock).mockReturnValue(mockCollectionRef);
    (getDocs as jest.Mock).mockResolvedValue({
      size: 6,
      docs: [
        {
          id: 'watchlist',
          data: () => ({
            items: {
              101: { id: 101, media_type: 'movie' },
              202: { id: 202, media_type: 'tv' },
            },
          }),
        },
        {
          id: 'favorites',
          data: () => ({
            items: {
              101: { id: 101, media_type: 'movie' },
            },
          }),
        },
        { id: 'custom-1', data: () => ({ items: { 303: { id: 303, media_type: 'movie' } } }) },
        { id: 'currently-watching', data: () => ({ items: {} }) },
        { id: 'already-watched', data: () => ({ items: {} }) },
        { id: 'dropped', data: () => ({ items: {} }) },
      ],
    });

    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const { result } = renderHook(
      () => {
        const membershipA = useListMembership();
        const membershipB = useListMembership();
        return { membershipA, membershipB };
      },
      { wrapper: createWrapper(client) }
    );

    await waitFor(() => {
      expect(result.current.membershipA.getListsForMedia(101, 'movie')).toEqual([
        'watchlist',
        'favorites',
      ]);
      expect(result.current.membershipB.getListsForMedia(202, 'tv')).toEqual(['watchlist']);
    });

    expect(getDocs).toHaveBeenCalledTimes(1);

    const audit = getFirestoreReadAuditReport();
    expect(audit.totalReads).toBe(6);
    expect(audit.byCallsite.find((entry) => entry.name === 'ListService.getListMembershipIndex')?.reads)
      .toBe(6);
  });

  it('does not fetch membership index when user preference is off', () => {
    mockPreferences.showListIndicators = false;

    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    const { result } = renderHook(() => useListMembership(), {
      wrapper: createWrapper(client),
    });

    expect(result.current.showIndicators).toBe(false);
    expect(result.current.getListsForMedia(101, 'movie')).toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();

    const audit = getFirestoreReadAuditReport();
    expect(audit.totalReads).toBe(0);
  });
});
