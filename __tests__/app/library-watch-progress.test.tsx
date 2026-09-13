import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockSetOptions = jest.fn();
const mockUseCurrentlyWatching = jest.fn();
const mockUseHeaderSearch = jest.fn();
const mockRefresh = jest.fn();
const mockScrollToOffset = jest.fn();
let latestSortModalProps: any = null;

const mockShows = [
  {
    tvShowId: 101,
    tvShowName: 'Mock Show',
    posterPath: null,
    backdropPath: null,
    lastUpdated: 100,
    percentage: 45,
    timeRemaining: 220,
    isHidden: false,
    lastWatchedEpisode: { season: 1, episode: 3, title: 'Episode 3' },
    nextEpisode: { season: 1, episode: 4, title: 'Episode 4', airDate: null },
  },
];

const mockHiddenShow = {
  tvShowId: 202,
  tvShowName: 'Hidden Show',
  posterPath: null,
  backdropPath: null,
  lastUpdated: 50,
  percentage: 30,
  timeRemaining: 100,
  isHidden: true,
  lastWatchedEpisode: { season: 1, episode: 2, title: 'Episode 2' },
  nextEpisode: { season: 1, episode: 3, title: 'Episode 3', airDate: null },
};

const mockRouterPush = jest.fn();
const mockBulkMutateAsync = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ setOptions: mockSetOptions }),
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@/src/context/TabContext', () => ({
  useCurrentTab: () => 'library',
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#FF0000' }),
}));

jest.mock('@/src/hooks/useEpisodeTracking', () => ({
  useBulkSetHiddenFromProgress: () => ({
    mutateAsync: mockBulkMutateAsync,
    isPending: false,
  }),
}));

jest.mock('@/src/components/ui/SegmentedControl', () => ({
  SegmentedControl: ({ options, activeKey: _activeKey, onChange, testID }: any) => {
    const { Text, TouchableOpacity, View } = require('react-native');
    return (
      <View testID={testID}>
        {options.map((option: any) => (
          <TouchableOpacity
            key={option.key}
            testID={`${testID}-tab-${option.key}`}
            onPress={() => onChange(option.key)}
          >
            <Text>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  },
}));

jest.mock('@/src/components/ui/Toast', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

jest.mock('@/src/hooks/useCurrentlyWatching', () => ({
  useCurrentlyWatching: () => mockUseCurrentlyWatching(),
}));

jest.mock('@/src/hooks/useHeaderSearch', () => ({
  useHeaderSearch: (...args: unknown[]) => mockUseHeaderSearch(...args),
}));

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));

jest.mock('@/src/components/library/LibrarySortModal', () => ({
  LibrarySortModal: (props: any) => {
    latestSortModalProps = props;
    return null;
  },
}));

jest.mock('@/src/components/ui/HeaderIconButton', () => ({
  HeaderIconButton: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/components/watching/WatchingShowCard', () => ({
  WatchingShowCard: ({ show }: { show: { tvShowName: string } }) => {
    const { Text } = require('react-native');
    return <Text>{show.tvShowName}</Text>;
  },
}));

jest.mock('@/src/components/library/SearchEmptyState', () => ({
  SearchEmptyState: () => null,
}));

jest.mock('@/src/components/library/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => {
    const { Text } = require('react-native');
    return <Text>{title}</Text>;
  },
}));

jest.mock('@/src/components/ui/AppErrorState', () => ({
  __esModule: true,
  default: ({ message, onRetry }: { message: string; onRetry?: () => void }) => {
    const { Text, TouchableOpacity, View } = require('react-native');
    return (
      <View>
        <Text>{message}</Text>
        {onRetry ? (
          <TouchableOpacity testID="watch-progress-error-retry" onPress={onRetry}>
            <Text>Retry</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  },
}));

jest.mock('@/src/styles/iconBadgeStyles', () => ({
  useIconBadgeStyles: () => ({ wrapper: {}, badge: {} }),
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  const FlashList = React.forwardRef(({ data, renderItem, ListEmptyComponent }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      scrollToOffset: mockScrollToOffset,
    }));

    if (!data || data.length === 0) {
      return React.createElement(View, { testID: 'flash-list-empty' }, ListEmptyComponent);
    }

    return React.createElement(
      View,
      { testID: 'flash-list' },
      data.map((item: any, index: number) =>
        React.createElement(View, { key: `${item.tvShowId}-${index}` }, renderItem({ item, index }))
      )
    );
  });
  FlashList.displayName = 'FlashList';

  return { FlashList };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

import WatchProgressScreen from '@/app/(tabs)/library/watch-progress';

describe('WatchProgressScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefresh.mockReset();
    mockScrollToOffset.mockReset();
    latestSortModalProps = null;
    mockUseCurrentlyWatching.mockReturnValue({
      data: mockShows,
      isLoading: false,
      isFetching: false,
      error: null,
      refresh: mockRefresh,
    });
    mockUseHeaderSearch.mockImplementation((args: any) => ({
      searchQuery: '',
      isSearchActive: false,
      filteredItems: args.items,
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: false },
    }));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows inline updating indicator while background refetching', async () => {
    mockUseCurrentlyWatching.mockReturnValue({
      data: mockShows,
      isLoading: false,
      isFetching: true,
      error: null,
      refresh: mockRefresh,
    });

    const { getByTestId, getByText } = render(<WatchProgressScreen />);

    await waitFor(() => {
      expect(getByTestId('watch-progress-updating-indicator')).toBeTruthy();
      expect(getByText('Updating watch progress...')).toBeTruthy();
    });
  });

  it('does not show inline updating indicator when not refetching', async () => {
    const { queryByTestId, getByText } = render(<WatchProgressScreen />);

    await waitFor(() => {
      expect(getByText('Mock Show')).toBeTruthy();
    });

    expect(queryByTestId('watch-progress-updating-indicator')).toBeNull();
  });

  it('keeps list rendering and search hook plumbing in non-loading state', async () => {
    const { getByText } = render(<WatchProgressScreen />);

    await waitFor(() => {
      expect(getByText('Mock Show')).toBeTruthy();
    });

    expect(mockUseHeaderSearch).toHaveBeenCalled();
    const lastCallIndex = mockUseHeaderSearch.mock.calls.length - 1;
    const hookArgs = mockUseHeaderSearch.mock.calls[lastCallIndex][0];
    expect(hookArgs.items).toEqual(mockShows);
    expect(hookArgs.getSearchableText(mockShows[0])).toBe('Mock Show');
  });

  it('renders enhanced error state and retries loading', async () => {
    mockUseCurrentlyWatching.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      error: new Error('Network error'),
      refresh: mockRefresh,
    });

    const { getByText, getByTestId } = render(<WatchProgressScreen />);

    await waitFor(() => {
      expect(getByText('Failed to load watch progress')).toBeTruthy();
    });

    fireEvent.press(getByTestId('watch-progress-error-retry'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not scroll to the top on initial render', async () => {
    jest.useFakeTimers();

    render(<WatchProgressScreen />);

    await waitFor(() => {
      expect(latestSortModalProps).not.toBeNull();
    });

    act(() => {
      jest.advanceTimersByTime(150);
    });

    expect(mockScrollToOffset).not.toHaveBeenCalled();
  });

  it('scrolls to the top after applying a new sort', async () => {
    jest.useFakeTimers();

    render(<WatchProgressScreen />);

    await waitFor(() => {
      expect(latestSortModalProps).not.toBeNull();
    });

    await act(async () => {
      await latestSortModalProps.onApplySort({
        option: 'alphabetical',
        direction: 'asc',
      });
    });

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(mockScrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
  });

  it('shows Watching and Hidden tabs with counts', async () => {
    mockUseCurrentlyWatching.mockReturnValue({
      data: [...mockShows, mockHiddenShow],
      isLoading: false,
      isFetching: false,
      error: null,
      refresh: mockRefresh,
    });

    const { getByTestId, getByText } = render(<WatchProgressScreen />);

    await waitFor(() => {
      expect(getByTestId('watch-progress-tabs')).toBeTruthy();
    });

    expect(getByText('Watching (1)')).toBeTruthy();
    expect(getByText('Hidden (1)')).toBeTruthy();
  });

  it('keeps hidden shows out of the Watching tab and shows them in the Hidden tab', async () => {
    mockUseCurrentlyWatching.mockReturnValue({
      data: [...mockShows, mockHiddenShow],
      isLoading: false,
      isFetching: false,
      error: null,
      refresh: mockRefresh,
    });

    const { getByTestId, getByText, queryByText } = render(<WatchProgressScreen />);

    await waitFor(() => {
      expect(getByText('Mock Show')).toBeTruthy();
    });
    expect(queryByText('Hidden Show')).toBeNull();

    fireEvent.press(getByTestId('watch-progress-tabs-tab-hidden'));

    await waitFor(() => {
      expect(getByText('Hidden Show')).toBeTruthy();
    });
    expect(queryByText('Mock Show')).toBeNull();
  });

  it('does not show the bulk action bar without a selection', async () => {
    const { getByText, queryByTestId } = render(<WatchProgressScreen />);

    await waitFor(() => {
      expect(getByText('Mock Show')).toBeTruthy();
    });

    expect(queryByTestId('watch-progress-bulk-bar')).toBeNull();
  });
});
