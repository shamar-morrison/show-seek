import { act, fireEvent, renderWithProviders } from '@/__tests__/utils/test-utils';
import TVSeasonsScreen from '@/src/screens/TVSeasonsScreen';
import React from 'react';

const mockMarkEpisodeWatchedMutate = jest.fn();
const mockMarkEpisodeUnwatchedMutate = jest.fn();
const mockMarkAllWatchedMutate = jest.fn();
const mockMarkAllUnwatchedMutate = jest.fn();
const mockUseQuery = jest.fn();

const mockShow = {
  id: 101,
  name: 'Mock Show',
  original_name: 'Mock Show',
  poster_path: '/show.jpg',
  first_air_date: '2020-01-01',
  status: 'Returning Series',
  vote_average: 8.2,
};

const mockSeason = {
  id: 1,
  season_number: 1,
  name: 'Season 1',
  overview: 'Overview',
  air_date: '2020-01-01',
  poster_path: '/season1.jpg',
  episode_count: 1,
  episodes: [
    {
      id: 11,
      episode_number: 1,
      name: 'Episode 1',
      overview: 'Episode Overview',
      air_date: '2020-01-01',
      still_path: '/ep1.jpg',
      vote_average: 7.5,
      runtime: 42,
      season_number: 1,
    },
  ],
};

jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query');

  return {
    ...actual,
    useQuery: (...args: any[]) => mockUseQuery(...args),
  };
});

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
  }),
  useLocalSearchParams: () => ({ id: '101' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  const FlashList = React.forwardRef(({ data, renderItem }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: jest.fn().mockResolvedValue(undefined),
    }));

    return (
      <View>
        {(data || []).map((item: any, index: number) => (
          <View key={item.key ?? `${index}`}>{renderItem({ item, index, target: 'Cell' })}</View>
        ))}
      </View>
    );
  });

  return { FlashList };
});

jest.mock('@/src/hooks/useNavigation', () => ({
  useCurrentTab: () => 'home',
}));

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => () => false,
}));

jest.mock('@/src/hooks/useProgressiveRender', () => ({
  useProgressiveRender: () => ({ isReady: true }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: {
      autoAddToWatching: true,
      markPreviousEpisodesWatched: false,
      showOriginalTitles: false,
    },
  }),
}));

jest.mock('@/src/hooks/useLists', () => ({
  useMediaLists: () => ({ membership: {} }),
  useLists: () => ({ data: [] }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({ isPremium: false }),
}));

jest.mock('@/src/hooks/useRatings', () => ({
  useRatings: () => ({ data: [] }),
}));

jest.mock('@/src/hooks/useEpisodeTracking', () => ({
  useShowEpisodeTracking: () => ({ data: null }),
  useMarkEpisodeWatched: () => ({
    mutate: mockMarkEpisodeWatchedMutate,
    isPending: false,
    variables: undefined,
  }),
  useMarkEpisodeUnwatched: () => ({
    mutate: mockMarkEpisodeUnwatchedMutate,
    isPending: false,
    variables: undefined,
  }),
  useMarkAllEpisodesWatched: () => ({
    mutate: mockMarkAllWatchedMutate,
    isPending: false,
    variables: undefined,
  }),
  useMarkAllEpisodesUnwatched: () => ({
    mutate: mockMarkAllUnwatchedMutate,
    isPending: false,
    variables: undefined,
  }),
}));

jest.mock('@/src/components/ui/LoadingModal', () => {
  return function LoadingModalMock({
    visible,
    message,
  }: {
    visible: boolean;
    message: string;
  }) {
    const { Text } = require('react-native');
    return visible ? <Text testID="bulk-loading-modal">{message}</Text> : null;
  };
});

jest.mock('@/src/components/tv/EpisodeItem', () => ({
  EpisodeItem: () => null,
}));

jest.mock('@/src/components/tv/SeasonItem', () => ({
  SeasonItem: (props: any) => {
    const { Text, TouchableOpacity, View } = require('react-native');

    return (
      <View>
        <Text testID="bulk-action-state">
          {`${props.bulkActionState?.action ?? 'none'}:${props.bulkActionState?.seasonNumber ?? 'null'}:${props.bulkActionState?.isPending ? 'pending' : 'idle'}`}
        </Text>
        <TouchableOpacity
          testID={`trigger-mark-${props.season.season_number}`}
          onPress={() =>
            props.onMarkAllWatched({
              tvShowId: props.tvId,
              seasonNumber: props.season.season_number,
              episodes: props.season.episodes,
              showMetadata: {
                tvShowName: props.showName,
                posterPath: props.showPosterPath,
              },
            })
          }
        >
          <Text>Trigger Mark</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID={`trigger-unmark-${props.season.season_number}`}
          onPress={() =>
            props.onMarkAllUnwatched({
              tvShowId: props.tvId,
              seasonNumber: props.season.season_number,
              episodes: props.season.episodes,
            })
          }
        >
          <Text>Trigger Unmark</Text>
        </TouchableOpacity>
      </View>
    );
  },
}));

describe('TVSeasonsScreen bulk-action deferral', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    mockUseQuery.mockImplementation(({ queryKey }: any) => {
      if (Array.isArray(queryKey) && queryKey[2] === 'all-seasons') {
        return {
          data: [mockSeason],
          isLoading: false,
          isError: false,
        } as any;
      }

      return {
        data: mockShow,
        isLoading: false,
        isError: false,
      } as any;
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('shows Mark all modal instantly and starts mutation on next tick', () => {
    const { getByTestId, queryByTestId } = renderWithProviders(<TVSeasonsScreen />);

    expect(queryByTestId('bulk-loading-modal')).toBeNull();

    act(() => {
      fireEvent.press(getByTestId('trigger-mark-1'));
    });

    expect(mockMarkAllWatchedMutate).not.toHaveBeenCalled();
    expect(getByTestId('bulk-loading-modal').props.children).toBe('Mark all...');
    expect(getByTestId('bulk-action-state').props.children).toBe('mark:1:pending');

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(mockMarkAllWatchedMutate).toHaveBeenCalledTimes(1);

    const mutateOptions = mockMarkAllWatchedMutate.mock.calls[0][1];
    act(() => {
      mutateOptions?.onSettled?.();
    });

    expect(queryByTestId('bulk-loading-modal')).toBeNull();
  });

  it('shows Unmark all modal instantly and starts mutation on next tick', () => {
    const { getByTestId, queryByTestId } = renderWithProviders(<TVSeasonsScreen />);

    expect(queryByTestId('bulk-loading-modal')).toBeNull();

    act(() => {
      fireEvent.press(getByTestId('trigger-unmark-1'));
    });

    expect(mockMarkAllUnwatchedMutate).not.toHaveBeenCalled();
    expect(getByTestId('bulk-loading-modal').props.children).toBe('Unmark all...');
    expect(getByTestId('bulk-action-state').props.children).toBe('unmark:1:pending');

    act(() => {
      jest.runOnlyPendingTimers();
    });

    expect(mockMarkAllUnwatchedMutate).toHaveBeenCalledTimes(1);

    const mutateOptions = mockMarkAllUnwatchedMutate.mock.calls[0][1];
    act(() => {
      mutateOptions?.onSettled?.();
    });

    expect(queryByTestId('bulk-loading-modal')).toBeNull();
  });

  it('ignores stale onSettled callbacks from previous bulk actions', () => {
    const { getByTestId, queryByTestId } = renderWithProviders(<TVSeasonsScreen />);

    act(() => {
      fireEvent.press(getByTestId('trigger-mark-1'));
      jest.runOnlyPendingTimers();
    });

    const markOptions = mockMarkAllWatchedMutate.mock.calls[0][1];

    act(() => {
      fireEvent.press(getByTestId('trigger-unmark-1'));
      jest.runOnlyPendingTimers();
    });

    const unmarkOptions = mockMarkAllUnwatchedMutate.mock.calls[0][1];

    act(() => {
      markOptions?.onSettled?.();
    });

    expect(getByTestId('bulk-loading-modal').props.children).toBe('Unmark all...');

    act(() => {
      unmarkOptions?.onSettled?.();
    });

    expect(queryByTestId('bulk-loading-modal')).toBeNull();
  });
});
