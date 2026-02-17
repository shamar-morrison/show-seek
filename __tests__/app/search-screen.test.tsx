import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

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

describe('SearchScreen routing and auth guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockAuthState.user = { uid: 'user-1', isAnonymous: false };
    mockAuthState.isGuest = false;
    mockQueryLoading = false;
    mockQueryResults = [];
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
});
