import { fireEvent, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

const mockPush = jest.fn();
const mockRequireAccount = jest.fn();
const mockFetchNextPage = jest.fn();
const mockDiscoverRefetch = jest.fn();
const mockAuthState = {
  user: { uid: 'user-1', isAnonymous: false } as null | { uid: string; isAnonymous?: boolean },
  isGuest: false,
};

let mockDiscoverPages: any[] = [];
let mockDiscoverLoading = false;
let mockDiscoverError = false;
let capturedFlashListProps: any = null;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
  },
  useSegments: () => ['(tabs)', 'discover'],
}));

jest.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: () => ({
    data: { pages: mockDiscoverPages },
    isLoading: mockDiscoverLoading,
    isError: mockDiscoverError,
    error: mockDiscoverError ? new Error('discover failed') : null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: mockFetchNextPage,
    refetch: mockDiscoverRefetch,
  }),
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    FlashList: (props: any) => {
      capturedFlashListProps = props;
      const data = props.data || [];

      return React.createElement(
        React.Fragment,
        null,
        data.map((item: any, index: number) =>
          React.createElement(
            View,
            { key: `${item.id}-${index}` },
            props.renderItem({ item, index })
          )
        )
      );
    },
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
  usePreferences: () => ({
    preferences: {
      showOriginalTitles: false,
      hideUnreleasedContent: false,
    },
  }),
}));

jest.mock('@/src/hooks/useGenres', () => ({
  useGenres: () => ({ data: {} }),
}));

jest.mock('@/src/hooks/useListMembership', () => ({
  useListMembership: () => ({
    getListsForMedia: () => [],
    showIndicators: false,
  }),
}));

jest.mock('@/src/hooks/useContentFilter', () => ({
  useContentFilter: (items: any[]) => items,
}));

jest.mock('@/src/components/DiscoverFilters', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/src/components/ui/HeaderIconButton', () => {
  const React = require('react');
  return {
    HeaderIconButton: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));

jest.mock('@/src/components/ui/ListMembershipBadge', () => ({
  InlineListIndicators: () => null,
  ListMembershipBadge: () => null,
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
  const AddToListModal = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ present: jest.fn() }));
    return null;
  });
  AddToListModal.displayName = 'AddToListModal';
  return { __esModule: true, default: AddToListModal };
});

jest.mock('@/src/components/ui/AppErrorState', () => {
  const React = require('react');
  const { Text, TouchableOpacity, View } = require('react-native');

  return {
    __esModule: true,
    default: ({ message, onRetry }: { message: string; onRetry?: () => void }) =>
      React.createElement(
        View,
        null,
        React.createElement(Text, null, message),
        onRetry
          ? React.createElement(
              TouchableOpacity,
              { onPress: onRetry, testID: 'discover-error-retry' },
              React.createElement(Text, null, 'retry-action')
            )
          : null
      ),
  };
});

import DiscoverScreen from '@/app/(tabs)/discover/index';

const baseMovie = {
  title: 'Movie Title',
  original_title: 'Movie Title',
  overview: 'overview',
  poster_path: null,
  backdrop_path: null,
  release_date: '2024-01-01',
  vote_average: 7.1,
  vote_count: 100,
  popularity: 10,
  genre_ids: [],
  video: false,
  adult: false,
  original_language: 'en',
};

describe('DiscoverScreen stability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFlashListProps = null;
    mockDiscoverLoading = false;
    mockDiscoverError = false;
    mockDiscoverPages = [];
    mockAuthState.user = { uid: 'user-1', isAnonymous: false };
    mockAuthState.isGuest = false;
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('deduplicates repeated discover results by id', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockDiscoverPages = [
      {
        page: 1,
        total_pages: 1,
        total_results: 3,
        results: [
          { ...baseMovie, id: 101, title: 'Duplicate Movie' },
          { ...baseMovie, id: 101, title: 'Duplicate Movie' },
          { ...baseMovie, id: 202, title: 'Another Movie' },
        ],
      },
    ];

    const { getAllByText } = render(<DiscoverScreen />);

    expect(getAllByText('Duplicate Movie')).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[discover] Removed 1 duplicate results')
    );

    warnSpy.mockRestore();
  });

  it('sets flashlist stabilization props for discover feed', () => {
    mockDiscoverPages = [
      {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [{ ...baseMovie, id: 999, title: 'Single Movie' }],
      },
    ];

    render(<DiscoverScreen />);

    expect(capturedFlashListProps).toBeTruthy();
    expect(capturedFlashListProps.maintainVisibleContentPosition).toEqual({ disabled: true });
    expect(capturedFlashListProps.drawDistance).toBe(600);
    expect(Array.isArray(capturedFlashListProps.contentContainerStyle)).toBe(false);
    expect(capturedFlashListProps.contentContainerStyle).toEqual(
      expect.objectContaining({ paddingBottom: 100 })
    );
  });

  it('renders explicit error state and retries discover query', () => {
    mockDiscoverError = true;

    const { getByText, getByTestId } = render(<DiscoverScreen />);

    expect(getByText('errors.loadingFailed')).toBeTruthy();

    fireEvent.press(getByTestId('discover-error-retry'));
    expect(mockDiscoverRefetch).toHaveBeenCalledTimes(1);
  });
});
