import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

const mockPush = jest.fn();
const mockRefetch = jest.fn();
const mockSetOptions = jest.fn();
let capturedFlashListProps: any = null;

const mockListsState = {
  data: [
    {
      id: 'favorites',
      name: 'Favorites',
      items: {},
      createdAt: 10,
      updatedAt: 500,
    },
    {
      id: 'dropped',
      name: 'Dropped',
      items: {},
      createdAt: 20,
      updatedAt: 400,
    },
    {
      id: 'already-watched',
      name: 'Already Watched',
      items: {},
      createdAt: 30,
      updatedAt: 300,
    },
    {
      id: 'watchlist',
      name: 'Should Watch',
      items: {},
      createdAt: 40,
      updatedAt: 200,
    },
    {
      id: 'currently-watching',
      name: 'Currently Watching',
      items: {},
      createdAt: 50,
      updatedAt: 100,
    },
  ],
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetch: mockRefetch,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
  }),
  useNavigation: () => ({
    setOptions: (...args: unknown[]) => mockSetOptions(...args),
  }),
}));

jest.mock('@/src/hooks/useLists', () => ({
  useLists: () => mockListsState,
}));

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));

jest.mock('@/src/components/library/QueryErrorState', () => ({
  QueryErrorState: () => null,
}));

jest.mock('@/src/components/library/EmptyState', () => ({
  EmptyState: () => null,
}));

jest.mock('@/src/components/library/StackedPosterPreview', () => ({
  StackedPosterPreview: () => null,
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    FlashList: ({ data, renderItem, keyExtractor, ...rest }: any) => {
      capturedFlashListProps = { data, renderItem, keyExtractor, ...rest };

      return React.createElement(
        View,
        { testID: 'flash-list' },
        data.map((item: any, index: number) =>
          React.createElement(
            View,
            { key: keyExtractor ? keyExtractor(item, index) : index },
            renderItem({ item, index })
          )
        )
      );
    },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

import WatchStatusScreen from '@/app/(tabs)/library/watch-status';

describe('WatchStatusScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFlashListProps = null;
    mockRefetch.mockReset().mockResolvedValue(undefined);
    mockListsState.data = [
      {
        id: 'favorites',
        name: 'Favorites',
        items: {},
        createdAt: 10,
        updatedAt: 500,
      },
      {
        id: 'dropped',
        name: 'Dropped',
        items: {},
        createdAt: 20,
        updatedAt: 400,
      },
      {
        id: 'already-watched',
        name: 'Already Watched',
        items: {},
        createdAt: 30,
        updatedAt: 300,
      },
      {
        id: 'watchlist',
        name: 'Should Watch',
        items: {},
        createdAt: 40,
        updatedAt: 200,
      },
      {
        id: 'currently-watching',
        name: 'Currently Watching',
        items: {},
        createdAt: 50,
        updatedAt: 100,
      },
    ];
    mockListsState.isLoading = false;
    mockListsState.isError = false;
    mockListsState.error = null;
  });

  it('renders watch status lists in canonical order regardless of fetched order', async () => {
    const { UNSAFE_getAllByType } = render(<WatchStatusScreen />);

    await waitFor(() => {
      const renderedLabels = UNSAFE_getAllByType(Text)
        .map((node) => node.props.children)
        .filter((value): value is string =>
          [
            'Should Watch',
            'Currently Watching',
            'Already Watched',
            'Favorites',
            'Dropped',
          ].includes(value)
        );

      expect(renderedLabels).toEqual([
        'Should Watch',
        'Currently Watching',
        'Already Watched',
        'Favorites',
        'Dropped',
      ]);
    });
  });

  it('does not configure header sort controls on the top-level screen', () => {
    render(<WatchStatusScreen />);

    expect(mockSetOptions).not.toHaveBeenCalled();
  });

  it('wires FlashList pull to refresh to the lists refetch', async () => {
    render(<WatchStatusScreen />);

    expect(capturedFlashListProps).toBeTruthy();
    expect(capturedFlashListProps.refreshing).toBe(false);

    await act(async () => {
      await capturedFlashListProps.onRefresh();
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
