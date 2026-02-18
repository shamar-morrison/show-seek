import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Pressable } from 'react-native';

const mockPush = jest.fn();
const mockPresent = jest.fn();
const mockRequireAccount = jest.fn();

const mockAuthState = {
  user: { uid: 'user-1', isAnonymous: false } as null | { uid: string; isAnonymous?: boolean },
  isGuest: false,
};

let mockQueryResults: any[] = [];
let mockQueryLoading = false;

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
  },
  useSegments: () => ['(tabs)', 'search'],
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { results: mockQueryResults },
    isLoading: mockQueryLoading,
  }),
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  return {
    FlashList: ({ data, renderItem }: any) =>
      React.createElement(
        React.Fragment,
        null,
        data.map((item: any, index: number) =>
          React.createElement(
            'View',
            { key: `${item.media_type || 'item'}-${item.id}-${index}` },
            renderItem({ item, index })
          )
        )
      ),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/context/GuestAccessContext', () => ({
  useGuestAccess: () => ({
    requireAccount: mockRequireAccount,
  }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { showOriginalTitles: false } }),
}));

jest.mock('@/src/hooks/useGenres', () => ({
  useAllGenres: () => ({ data: {} }),
}));

jest.mock('@/src/hooks/useListMembership', () => ({
  useListMembership: () => ({
    getListsForMedia: () => [],
    showIndicators: false,
  }),
}));

jest.mock('@/src/hooks/useFavoritePersons', () => ({
  useFavoritePersons: () => ({ data: [] }),
}));

jest.mock('@/src/hooks/useContentFilter', () => ({
  useContentFilter: (items: any[]) => items,
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));

jest.mock('@/src/components/ui/ListMembershipBadge', () => ({
  InlineListIndicators: () => null,
  ListMembershipBadge: () => null,
}));

jest.mock('@/src/components/ui/FavoritePersonBadge', () => ({
  FavoritePersonBadge: () => null,
}));

jest.mock('@/src/components/ui/Toast', () => {
  const React = require('react');
  const Toast = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ show: jest.fn() }));
    return null;
  });
  Toast.displayName = 'Toast';
  return { __esModule: true, default: Toast };
});

jest.mock('@/src/components/AddToListModal', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const AddToListModal = React.forwardRef(({ mediaItem }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ present: mockPresent }));
    return React.createElement(Text, { testID: 'add-to-list-modal' }, mediaItem?.media_type || '');
  });
  AddToListModal.displayName = 'AddToListModal';
  return { __esModule: true, default: AddToListModal };
});

import SearchScreen from '@/app/(tabs)/search/index';

function enterQueryAndFlush(getByPlaceholderText: (text: string) => any) {
  const input = getByPlaceholderText('Search movies, TV shows, people...');
  fireEvent.changeText(input, 'query');
  act(() => {
    jest.advanceTimersByTime(500);
  });
}

function toggleViewMode(UNSAFE_getAllByType: (type: any) => any[]) {
  const [headerToggleButton] = UNSAFE_getAllByType(Pressable);
  fireEvent.press(headerToggleButton);
}

describe('SearchScreen routing and auth guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockAuthState.user = { uid: 'user-1', isAnonymous: false };
    mockAuthState.isGuest = false;
    mockQueryLoading = false;
    mockQueryResults = [];
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('routes TV items to TV detail even when title exists', async () => {
    mockQueryResults = [
      {
        id: 77,
        media_type: 'tv',
        title: 'TV Item',
        name: 'TV Item',
        first_air_date: '2024-01-01',
        vote_average: 8,
        overview: 'overview',
        poster_path: null,
        genre_ids: [],
      },
    ];

    const { getByPlaceholderText, getByText } = render(<SearchScreen />);

    enterQueryAndFlush(getByPlaceholderText);

    await waitFor(() => {
      expect(getByText('TV Item')).toBeTruthy();
    });

    fireEvent.press(getByText('TV Item'));

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/search/tv/77');
  });

  it('blocks unauthenticated long press from opening AddToListModal', async () => {
    mockAuthState.user = null;
    mockQueryResults = [
      {
        id: 42,
        media_type: 'movie',
        title: 'Movie Item',
        release_date: '2024-01-01',
        vote_average: 7,
        overview: 'overview',
        poster_path: null,
        genre_ids: [],
      },
    ];

    const { getByPlaceholderText, getByText, queryByTestId } = render(<SearchScreen />);

    enterQueryAndFlush(getByPlaceholderText);

    await waitFor(() => {
      expect(getByText('Movie Item')).toBeTruthy();
    });

    fireEvent(getByText('Movie Item'), 'longPress');

    expect(mockRequireAccount).toHaveBeenCalledTimes(1);
    expect(queryByTestId('add-to-list-modal')).toBeNull();
  });

  it('blocks anonymous guest long press from opening AddToListModal', async () => {
    mockAuthState.user = { uid: 'guest-user', isAnonymous: true };
    mockAuthState.isGuest = true;
    mockQueryResults = [
      {
        id: 43,
        media_type: 'movie',
        title: 'Guest Movie Item',
        release_date: '2024-01-01',
        vote_average: 7,
        overview: 'overview',
        poster_path: null,
        genre_ids: [],
      },
    ];

    const { getByPlaceholderText, getByText, queryByTestId } = render(<SearchScreen />);

    enterQueryAndFlush(getByPlaceholderText);

    await waitFor(() => {
      expect(getByText('Guest Movie Item')).toBeTruthy();
    });

    fireEvent(getByText('Guest Movie Item'), 'longPress');

    expect(mockRequireAccount).toHaveBeenCalledTimes(1);
    expect(queryByTestId('add-to-list-modal')).toBeNull();
  });

  it('does not trigger account guard for guest long press on person results', async () => {
    mockAuthState.user = { uid: 'guest-user', isAnonymous: true };
    mockAuthState.isGuest = true;
    mockQueryResults = [
      {
        id: 88,
        media_type: 'person',
        name: 'Guest Person',
        profile_path: null,
      },
    ];

    const { getByPlaceholderText, getByText, queryByTestId } = render(<SearchScreen />);

    enterQueryAndFlush(getByPlaceholderText);

    await waitFor(() => {
      expect(getByText('Guest Person')).toBeTruthy();
    });

    fireEvent(getByText('Guest Person'), 'longPress');

    expect(mockRequireAccount).not.toHaveBeenCalled();
    expect(mockPresent).not.toHaveBeenCalled();
    expect(queryByTestId('add-to-list-modal')).toBeNull();
  });

  it('opens AddToListModal on authenticated long press', async () => {
    mockAuthState.user = { uid: 'user-1', isAnonymous: false };
    mockQueryResults = [
      {
        id: 9,
        media_type: 'movie',
        title: 'Open Modal',
        release_date: '2024-01-01',
        vote_average: 6,
        overview: 'overview',
        poster_path: null,
        genre_ids: [],
      },
    ];

    const { getByPlaceholderText, getByText, getByTestId } = render(<SearchScreen />);

    enterQueryAndFlush(getByPlaceholderText);

    await waitFor(() => {
      expect(getByText('Open Modal')).toBeTruthy();
    });

    fireEvent(getByText('Open Modal'), 'longPress');

    await waitFor(() => {
      expect(getByTestId('add-to-list-modal')).toBeTruthy();
    });

    expect(mockPresent).toHaveBeenCalled();
  });

  it('toggles to grid mode and persists preference', async () => {
    mockQueryResults = [
      {
        id: 123,
        media_type: 'person',
        name: 'Grid Person',
        known_for_department: 'Acting',
        known_for: [{ title: 'Known Work' }],
        profile_path: null,
      },
    ];

    const { getByPlaceholderText, getByText, queryByText, UNSAFE_getAllByType } = render(
      <SearchScreen />
    );

    enterQueryAndFlush(getByPlaceholderText);

    await waitFor(() => {
      expect(getByText('Grid Person')).toBeTruthy();
      expect(getByText(/Known for:\s*Known Work/)).toBeTruthy();
    });

    toggleViewMode(UNSAFE_getAllByType);

    await waitFor(() => {
      expect(queryByText(/Known for:\s*Known Work/)).toBeNull();
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('searchViewMode', 'grid');
    });
  });

  it('routes TV items to TV detail in grid mode', async () => {
    mockQueryResults = [
      {
        id: 177,
        media_type: 'tv',
        title: 'Grid TV Item',
        name: 'Grid TV Item',
        first_air_date: '2024-01-01',
        vote_average: 8,
        overview: 'overview',
        poster_path: null,
        genre_ids: [],
      },
    ];

    const { getByPlaceholderText, getByText, UNSAFE_getAllByType } = render(<SearchScreen />);

    enterQueryAndFlush(getByPlaceholderText);

    await waitFor(() => {
      expect(getByText('Grid TV Item')).toBeTruthy();
    });

    toggleViewMode(UNSAFE_getAllByType);
    fireEvent.press(getByText('Grid TV Item'));

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/search/tv/177');
  });

  it('blocks unauthenticated long press in grid mode', async () => {
    mockAuthState.user = null;
    mockQueryResults = [
      {
        id: 333,
        media_type: 'movie',
        title: 'Grid Guard Movie',
        release_date: '2024-01-01',
        vote_average: 7,
        overview: 'overview',
        poster_path: null,
        genre_ids: [],
      },
    ];

    const { getByPlaceholderText, getByText, queryByTestId, UNSAFE_getAllByType } = render(
      <SearchScreen />
    );

    enterQueryAndFlush(getByPlaceholderText);

    await waitFor(() => {
      expect(getByText('Grid Guard Movie')).toBeTruthy();
    });

    toggleViewMode(UNSAFE_getAllByType);
    fireEvent(getByText('Grid Guard Movie'), 'longPress');

    expect(mockRequireAccount).toHaveBeenCalledTimes(1);
    expect(queryByTestId('add-to-list-modal')).toBeNull();
  });

  it('does not trigger account guard for person long press in grid mode', async () => {
    mockAuthState.user = { uid: 'guest-user', isAnonymous: true };
    mockAuthState.isGuest = true;
    mockQueryResults = [
      {
        id: 444,
        media_type: 'person',
        name: 'Grid Person Guard',
        profile_path: null,
      },
    ];

    const { getByPlaceholderText, getByText, queryByTestId, UNSAFE_getAllByType } = render(
      <SearchScreen />
    );

    enterQueryAndFlush(getByPlaceholderText);

    await waitFor(() => {
      expect(getByText('Grid Person Guard')).toBeTruthy();
    });

    toggleViewMode(UNSAFE_getAllByType);
    fireEvent(getByText('Grid Person Guard'), 'longPress');

    expect(mockRequireAccount).not.toHaveBeenCalled();
    expect(mockPresent).not.toHaveBeenCalled();
    expect(queryByTestId('add-to-list-modal')).toBeNull();
  });
});
