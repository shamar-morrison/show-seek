import {
  toPersonFavoriteTarget,
  usePersonFavoriteSheet,
} from '@/src/hooks/usePersonFavoriteSheet';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockAddFavoritePerson = jest.fn();
const mockRemoveFavoritePerson = jest.fn();
const mockRequireAccount = jest.fn(() => false);

const mockAuthState: { user: { uid: string } | null } = {
  user: { uid: 'test-user-id' },
};

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/services/FavoritePersonsService', () => ({
  favoritePersonsService: {
    getFavoritePersons: jest.fn().mockResolvedValue([]),
    addFavoritePerson: (...args: unknown[]) => mockAddFavoritePerson(...args),
    removeFavoritePerson: (...args: unknown[]) => mockRemoveFavoritePerson(...args),
  },
}));

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockRequireAccount,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const getFavoritePersonsKey = (userId = 'test-user-id') => ['favoritePersons', userId] as const;

beforeAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => act(fn));
});

afterAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => fn());
});

describe('usePersonFavoriteSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { uid: 'test-user-id' };
    mockRequireAccount.mockReturnValue(false);
    mockAddFavoritePerson.mockResolvedValue(undefined);
    mockRemoveFavoritePerson.mockResolvedValue(undefined);
  });

  it('builds an add action for a person who is not favorited', async () => {
    const client = createQueryClient();
    client.setQueryData(getFavoritePersonsKey(), []);

    const { result, unmount } = renderHook(() => usePersonFavoriteSheet(), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.handlePersonLongPress({
        id: 10,
        name: 'Actor Ten',
        profile_path: '/ten.jpg',
        known_for_department: 'Acting',
      });
    });

    await waitFor(() => {
      expect(result.current.selectedPerson?.id).toBe(10);
    });
    expect(result.current.actions).toHaveLength(1);
    expect(result.current.actions[0]?.id).toBe('toggle-favorite-person');
    expect(result.current.actions[0]?.label).toBe('Add to Favorite People');

    await act(async () => {
      await result.current.actions[0]?.onPress();
    });

    expect(mockAddFavoritePerson).toHaveBeenCalledWith({
      id: 10,
      name: 'Actor Ten',
      profile_path: '/ten.jpg',
      known_for_department: 'Acting',
    });
    unmount();
  });

  it('builds a remove action for an already-favorited person', async () => {
    const client = createQueryClient();
    client.setQueryData(getFavoritePersonsKey(), [
      {
        id: 11,
        name: 'Actor Eleven',
        profile_path: null,
        known_for_department: 'Acting',
        addedAt: Date.now(),
      },
    ]);

    const { result, unmount } = renderHook(() => usePersonFavoriteSheet(), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.handlePersonLongPress({
        id: 11,
        name: 'Actor Eleven',
        profile_path: null,
        known_for_department: 'Acting',
      });
    });

    await waitFor(() => {
      expect(result.current.selectedPerson?.id).toBe(11);
    });
    expect(result.current.actions).toHaveLength(1);
    expect(result.current.actions[0]?.id).toBe('toggle-favorite-person');
    expect(result.current.actions[0]?.label).toBe('Remove from Favorite People');

    await act(async () => {
      await result.current.actions[0]?.onPress();
    });

    expect(mockRemoveFavoritePerson).toHaveBeenCalledWith(11);
    unmount();
  });

  it('does nothing for guests when account is required', () => {
    mockRequireAccount.mockReturnValue(true);
    const client = createQueryClient();

    const { result, unmount } = renderHook(() => usePersonFavoriteSheet(), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.handlePersonLongPress({
        id: 12,
        name: 'Actor Twelve',
        profile_path: null,
        known_for_department: 'Acting',
      });
    });

    expect(result.current.selectedPerson).toBeNull();
    expect(result.current.actions).toHaveLength(0);
    unmount();
  });
});

describe('toPersonFavoriteTarget', () => {
  it('normalizes missing profile and department fields', () => {
    expect(toPersonFavoriteTarget({ id: 1, name: 'Name' })).toEqual({
      id: 1,
      name: 'Name',
      profile_path: null,
      known_for_department: '',
    });
  });
});
