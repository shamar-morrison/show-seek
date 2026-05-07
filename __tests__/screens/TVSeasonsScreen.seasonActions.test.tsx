import { act, fireEvent, renderWithProviders, waitFor } from '@/__tests__/utils/test-utils';
import TVSeasonsScreen from '@/src/screens/TVSeasonsScreen';
import React from 'react';
import { Alert } from 'react-native';

const mockUseQuery = jest.fn();
let mockRatingsData: Array<{ id: string; mediaType: 'season'; rating: number }> = [];

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
  useLocalSearchParams: () => ({ id: '101', season: '1' }),
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
  useCurrentTab: () => 'library',
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
      autoAddToWatching: false,
      markPreviousEpisodesWatched: false,
      allowUnreleasedEpisodeWatches: false,
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
  useRatings: () => ({ data: mockRatingsData }),
}));

jest.mock('@/src/hooks/useEpisodeTracking', () => ({
  useShowEpisodeTracking: () => ({ data: null }),
  useMarkEpisodeWatched: () => ({
    mutate: jest.fn(),
    isPending: false,
    variables: undefined,
  }),
  useMarkEpisodeUnwatched: () => ({
    mutate: jest.fn(),
    isPending: false,
    variables: undefined,
  }),
  useMarkAllEpisodesWatched: () => ({
    mutate: jest.fn(),
    isPending: false,
    variables: undefined,
  }),
  useMarkAllEpisodesUnwatched: () => ({
    mutate: jest.fn(),
    isPending: false,
    variables: undefined,
  }),
}));

jest.mock('@/src/components/RatingModal', () => {
  return function RatingModalMock({
    visible,
    seasonData,
  }: {
    visible: boolean;
    seasonData?: { seasonName: string };
  }) {
    const { Text } = require('react-native');
    return visible ? <Text testID="season-rating-modal">{seasonData?.seasonName}</Text> : null;
  };
});

jest.mock('@/src/components/ui/LoadingModal', () => () => null);

jest.mock('@/src/components/tv/EpisodeItem', () => ({
  EpisodeItem: () => null,
}));

jest.mock('@/src/components/tv/SeasonItem', () => ({
  SeasonItem: ({ season }: { season: { name: string } }) => {
    const { Text, View } = require('react-native');
    return (
      <View>
        <Text>{season.name}</Text>
      </View>
    );
  },
}));

const baseShow = {
  id: 101,
  name: 'Mock Show',
  original_name: 'Mock Show',
  poster_path: '/show.jpg',
  first_air_date: '2020-01-01',
  status: 'Returning Series',
  vote_average: 8.2,
  genres: [{ id: 18 }, { id: 35 }],
};

const buildSeason = (overview: string) => ({
  id: 1,
  season_number: 1,
  name: 'Season 1',
  overview,
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
});

describe('TVSeasonsScreen season actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRatingsData = [];
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockQueries(overview = 'Overview') {
    mockUseQuery.mockImplementation(({ queryKey }: any) => {
      if (Array.isArray(queryKey) && queryKey[2] === 'all-seasons') {
        return {
          data: [buildSeason(overview)],
          isLoading: false,
          isError: false,
        } as any;
      }

      return {
        data: baseShow,
        isLoading: false,
        isError: false,
      } as any;
    });
  }

  it('renders the moved season action buttons and opens the season rating modal', async () => {
    mockQueries();

    const screen = renderWithProviders(<TVSeasonsScreen />);

    expect(screen.getByTestId('season-mark-all-button-1')).toBeTruthy();
    expect(screen.getByTestId('season-rate-button-1')).toBeTruthy();

    act(() => {
      screen.getByTestId('season-mark-all-button-1').props.onPress();
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);

    act(() => {
      screen.getByTestId('season-rate-button-1').props.onPress();
    });

    await waitFor(() => {
      expect(screen.getByTestId('season-rating-modal')).toBeTruthy();
    });
  });

  it('still renders the rate-season button when the season overview is empty', () => {
    mockQueries('');

    const screen = renderWithProviders(<TVSeasonsScreen />);

    expect(screen.getByTestId('season-rate-button-1')).toBeTruthy();
  });

  it('shows the saved season rating with a star icon after the season has been rated', () => {
    mockQueries();
    mockRatingsData = [{ id: 'season-101-1', mediaType: 'season', rating: 8.5 }];

    const screen = renderWithProviders(<TVSeasonsScreen />);

    expect(screen.getByTestId('season-rate-button-1')).toBeTruthy();
    expect(screen.getAllByTestId('season-rate-icon-1').length).toBeGreaterThan(0);
    expect(screen.getByText('8.5')).toBeTruthy();
  });

  it('omits the decimal point for whole-number season ratings', () => {
    mockQueries();
    mockRatingsData = [{ id: 'season-101-1', mediaType: 'season', rating: 8 }];

    const screen = renderWithProviders(<TVSeasonsScreen />);

    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.queryByText('8.0')).toBeNull();
  });
});
