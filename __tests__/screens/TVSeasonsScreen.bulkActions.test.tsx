import { act, fireEvent, renderWithProviders } from '@/__tests__/utils/test-utils';
import TVSeasonsScreen from '@/src/screens/TVSeasonsScreen';
import React from 'react';
import { Alert } from 'react-native';

const mockMarkEpisodeWatchedMutate = jest.fn();
const mockMarkEpisodeUnwatchedMutate = jest.fn();
const mockMarkAllWatchedMutate = jest.fn();
const mockMarkAllUnwatchedMutate = jest.fn();
const mockMarkShowAllWatchedMutate = jest.fn();
const mockUseQuery = jest.fn();
const mockUseMediaLists = jest.fn();
const mockUseLists = jest.fn();

const mockShow = {
  id: 101,
  name: 'Mock Show',
  original_name: 'Mock Show',
  poster_path: '/show.jpg',
  first_air_date: '2020-01-01',
  status: 'Returning Series',
  vote_average: 8.2,
  genres: [{ id: 18 }, { id: 35 }],
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

const mockUsePreferences = jest.fn();
const mockUseShowEpisodeTracking = jest.fn();

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => () => false,
}));

jest.mock('@/src/hooks/useProgressiveRender', () => ({
  useProgressiveRender: () => ({ isReady: true }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => mockUsePreferences(),
}));

jest.mock('@/src/hooks/useLists', () => ({
  useMediaLists: (...args: any[]) => mockUseMediaLists(...args),
  useLists: (...args: any[]) => mockUseLists(...args),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({ isPremium: false }),
}));

jest.mock('@/src/hooks/useRatings', () => ({
  useRatings: () => ({ data: [] }),
}));

jest.mock('@/src/hooks/useEpisodeTracking', () => ({
  useShowEpisodeTracking: () => mockUseShowEpisodeTracking(),
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
  useMarkShowAllEpisodesWatched: () => ({
    mutate: mockMarkShowAllWatchedMutate,
    isPending: false,
    variables: undefined,
  }),
}));

jest.mock('@/src/components/RatingModal', () => () => null);

jest.mock('@/src/components/ui/LoadingModal', () => {
  return function LoadingModalMock({
    visible,
    message,
    progressText,
    onCancel,
    isCancelling,
  }: {
    visible: boolean;
    message: string;
    progressText?: string;
    onCancel?: () => void;
    isCancelling?: boolean;
  }) {
    const { Text, TouchableOpacity, View } = require('react-native');
    if (!visible) return null;
    return (
      <View testID="bulk-loading-modal-container">
        <Text testID="bulk-loading-modal">{message}</Text>
        {progressText ? <Text testID="bulk-loading-progress">{progressText}</Text> : null}
        {onCancel ? (
          <TouchableOpacity
            testID="bulk-loading-cancel-button"
            onPress={onCancel}
            disabled={isCancelling}
          >
            <Text>{isCancelling ? 'Cancelling...' : 'Cancel'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
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
    mockUsePreferences.mockReturnValue({
      preferences: {
        autoAddToWatching: true,
        markPreviousEpisodesWatched: false,
        allowUnreleasedEpisodeWatches: false,
        showOriginalTitles: false,
      },
    });
    mockUseShowEpisodeTracking.mockReturnValue({ data: null });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUseMediaLists.mockReturnValue({ membership: {} });
    mockUseLists.mockReturnValue({
      data: [{ id: 'currently-watching', items: { 201: { id: 201 }, 202: { id: 202 } } }],
    });

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
    expect(mockMarkAllWatchedMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        tvShowId: 101,
        seasonNumber: 1,
        episodes: mockSeason.episodes,
        showMetadata: {
          tvShowName: 'Mock Show',
          posterPath: '/show.jpg',
        },
        autoAddOptions: {
          showStatus: 'Returning Series',
          shouldAutoAdd: true,
          listMembership: {},
          firstAirDate: '2020-01-01',
          voteAverage: 8.2,
          genreIds: [18, 35],
          isPremium: false,
          currentListCount: 2,
        },
      }),
      expect.any(Object)
    );

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

  describe('Show-wide Mark All header action', () => {
    const multiSeasonData = [
      {
        id: 100,
        season_number: 0,
        name: 'Specials',
        episode_count: 1,
        episodes: [
          {
            id: 1001,
            episode_number: 1,
            name: 'Special 1',
            air_date: '2019-01-01',
            season_number: 0,
          },
        ],
      },
      {
        id: 1,
        season_number: 1,
        name: 'Season 1',
        episode_count: 2,
        episodes: [
          {
            id: 11,
            episode_number: 1,
            name: 'S1 E1',
            air_date: '2020-01-01',
            season_number: 1,
          },
          {
            id: 12,
            episode_number: 2,
            name: 'S1 E2',
            air_date: '2020-01-08',
            season_number: 1,
          },
        ],
      },
      {
        id: 2,
        season_number: 2,
        name: 'Season 2',
        episode_count: 2,
        episodes: [
          {
            id: 21,
            episode_number: 1,
            name: 'S2 E1',
            air_date: '2021-01-01',
            season_number: 2,
          },
          {
            id: 22,
            episode_number: 2,
            name: 'S2 E2',
            air_date: '2099-01-01', // Future / unreleased episode
            season_number: 2,
          },
        ],
      },
    ];

    beforeEach(() => {
      mockUseQuery.mockImplementation(({ queryKey }: any) => {
        if (Array.isArray(queryKey) && queryKey[2] === 'all-seasons') {
          return {
            data: multiSeasonData,
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

    it('renders the header Mark All button enabled when unwatched episodes exist', () => {
      const { getByTestId } = renderWithProviders(<TVSeasonsScreen />);
      const headerButton = getByTestId('header-mark-all-button');

      expect(headerButton).toBeTruthy();
      expect(headerButton.props.accessibilityState?.disabled).toBeFalsy();
    });

    it('disables the header Mark All button when all eligible episodes across regular seasons are watched', () => {
      mockUseShowEpisodeTracking.mockReturnValue({
        data: {
          episodes: {
            '1_1': { episodeId: 11, watchedAt: Date.now() },
            '1_2': { episodeId: 12, watchedAt: Date.now() },
            '2_1': { episodeId: 21, watchedAt: Date.now() },
          },
        },
      });

      const { getByTestId } = renderWithProviders(<TVSeasonsScreen />);
      const headerButton = getByTestId('header-mark-all-button');

      expect(headerButton.props.accessibilityState?.disabled).toBe(true);
    });

    it('shows confirmation alert for aired episodes only when allowUnreleased is false', () => {
      mockUsePreferences.mockReturnValue({
        preferences: {
          autoAddToWatching: true,
          markPreviousEpisodesWatched: false,
          allowUnreleasedEpisodeWatches: false,
          showOriginalTitles: false,
        },
      });

      const { getByTestId } = renderWithProviders(<TVSeasonsScreen />);
      const headerButton = getByTestId('header-mark-all-button');

      act(() => {
        fireEvent.press(headerButton);
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'Mark all as watched?',
        'Mark all 3 aired episodes across all seasons as watched?',
        expect.any(Array)
      );
    });

    it('shows unreleased notice in confirmation alert when allowUnreleased is true', () => {
      mockUsePreferences.mockReturnValue({
        preferences: {
          autoAddToWatching: true,
          markPreviousEpisodesWatched: false,
          allowUnreleasedEpisodeWatches: true,
          showOriginalTitles: false,
        },
      });

      const { getByTestId } = renderWithProviders(<TVSeasonsScreen />);
      const headerButton = getByTestId('header-mark-all-button');

      act(() => {
        fireEvent.press(headerButton);
      });

      expect(Alert.alert).toHaveBeenCalledWith(
        'Mark all as watched?',
        "This will mark all episodes across all seasons as watched, including episodes that haven't aired yet.",
        expect.any(Array)
      );
    });

    it('excludes Season 0 and skips already-watched episodes when triggering mutation', () => {
      mockUseShowEpisodeTracking.mockReturnValue({
        data: {
          episodes: {
            '1_1': { episodeId: 11, watchedAt: Date.now() }, // already watched
          },
        },
      });

      const { getByTestId } = renderWithProviders(<TVSeasonsScreen />);
      const headerButton = getByTestId('header-mark-all-button');

      act(() => {
        fireEvent.press(headerButton);
      });

      // Find the confirm button action from Alert.alert
      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const confirmButton = alertCall[2].find((btn: any) => btn.text === 'Mark all');

      act(() => {
        confirmButton.onPress();
      });

      expect(mockMarkShowAllWatchedMutate).toHaveBeenCalledTimes(1);
      const mutateArgs = mockMarkShowAllWatchedMutate.mock.calls[0][0];

      // Should only include unwatched regular season episodes (S1E2 and S2E1)
      expect(mutateArgs.episodesToMark).toHaveLength(2);
      expect(mutateArgs.episodesToMark).toEqual([
        { seasonNumber: 1, episode: expect.objectContaining({ episode_number: 2 }) },
        { seasonNumber: 2, episode: expect.objectContaining({ episode_number: 1 }) },
      ]);
    });

    it('shows live progress in modal and updates to Cancelling on cancel tap', () => {
      const { getByTestId, queryByTestId } = renderWithProviders(<TVSeasonsScreen />);
      const headerButton = getByTestId('header-mark-all-button');

      act(() => {
        fireEvent.press(headerButton);
      });

      const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
      const confirmButton = alertCall[2].find((btn: any) => btn.text === 'Mark all');

      act(() => {
        confirmButton.onPress();
      });

      expect(getByTestId('bulk-loading-modal').props.children).toBe('Mark all...');
      expect(getByTestId('bulk-loading-progress').props.children).toBe('0/3 marked');

      // Simulate progress update from service
      const mutateArgs = mockMarkShowAllWatchedMutate.mock.calls[0][0];
      act(() => {
        mutateArgs.options.onProgress(2, 3);
      });

      expect(getByTestId('bulk-loading-progress').props.children).toBe('2/3 marked');

      // Tap Cancel in loading modal
      act(() => {
        fireEvent.press(getByTestId('bulk-loading-cancel-button'));
      });

      expect(getByTestId('bulk-loading-modal').props.children).toBe('Cancelling');
      expect(mutateArgs.options.isCancelled()).toBe(true);

      // Settle mutation
      const mutateOptions = mockMarkShowAllWatchedMutate.mock.calls[0][1];
      act(() => {
        mutateOptions?.onSettled?.();
      });

      expect(queryByTestId('bulk-loading-modal')).toBeNull();
    });
  });
});

