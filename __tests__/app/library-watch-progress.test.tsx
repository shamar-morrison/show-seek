import { render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockSetOptions = jest.fn();
const mockUseCurrentlyWatching = jest.fn();
const mockUseHeaderSearch = jest.fn();

const mockShows = [
  {
    tvShowId: 101,
    tvShowName: 'Mock Show',
    posterPath: null,
    backdropPath: null,
    lastUpdated: 100,
    percentage: 45,
    timeRemaining: 220,
    lastWatchedEpisode: { season: 1, episode: 3, title: 'Episode 3' },
    nextEpisode: { season: 1, episode: 4, title: 'Episode 4', airDate: null },
  },
];

jest.mock('expo-router', () => ({
  useNavigation: () => ({ setOptions: mockSetOptions }),
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
  LibrarySortModal: () => null,
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

jest.mock('@/src/styles/iconBadgeStyles', () => ({
  useIconBadgeStyles: () => ({ wrapper: {}, badge: {} }),
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: ({ data, renderItem, ListEmptyComponent }: any) => {
    const React = require('react');
    const { View } = require('react-native');

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
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

import WatchProgressScreen from '@/app/(tabs)/library/watch-progress';

describe('WatchProgressScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCurrentlyWatching.mockReturnValue({
      data: mockShows,
      isLoading: false,
      isFetching: false,
      error: null,
      refresh: jest.fn(),
    });
    mockUseHeaderSearch.mockReturnValue({
      searchQuery: '',
      isSearchActive: false,
      filteredItems: mockShows,
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: false },
    });
  });

  it('shows inline updating indicator while background refetching', async () => {
    mockUseCurrentlyWatching.mockReturnValue({
      data: mockShows,
      isLoading: false,
      isFetching: true,
      error: null,
      refresh: jest.fn(),
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
});
