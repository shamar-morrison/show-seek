import { act, fireEvent, renderWithProviders, waitFor } from '@/__tests__/utils/test-utils';
import TVSeasonsScreen from '@/src/screens/TVSeasonsScreen';
import React from 'react';
import { Alert } from 'react-native';

const mockUseQuery = jest.fn();
let mockRatingsData: Array<{ id: string; mediaType: 'season'; rating: number }> = [];
let mockNotesData: Array<{
  id: string;
  userId: string;
  mediaType: 'season';
  mediaId: number;
  content: string;
  posterPath: string | null;
  mediaTitle: string;
  createdAt: Date;
  updatedAt: Date;
  seasonNumber: number;
  showId: number;
}> = [];
const mockNotePresent = jest.fn().mockResolvedValue(undefined);
const mockPush = jest.fn();

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
    push: mockPush,
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

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'user-1', isAnonymous: false }, isGuest: false }),
}));

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

let mockEpisodeTracking: { episodes: Record<string, object> } | null = null;

jest.mock('@/src/hooks/useEpisodeTracking', () => ({
  useShowEpisodeTracking: () => ({ data: mockEpisodeTracking }),
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
  useMarkShowAllEpisodesWatched: () => ({
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

const mockOpenShareCard = jest.fn();
jest.mock('@/src/hooks/useOpenShareCard', () => ({
  useOpenShareCard: () => mockOpenShareCard,
}));

jest.mock('@/src/components/ui/LoadingModal', () => () => null);

jest.mock('@/src/components/NotesModal', () => {
  const React = require('react');
  const MockNoteModal = React.forwardRef((_: unknown, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: (...args: any[]) => mockNotePresent(...args),
      dismiss: jest.fn().mockResolvedValue(undefined),
    }));
    return null;
  });
  MockNoteModal.displayName = 'MockNoteModal';
  return {
    __esModule: true,
    default: MockNoteModal,
  };
});

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
    mockNotesData = [];
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

      if (Array.isArray(queryKey) && queryKey[0] === 'notes') {
        return {
          data: mockNotesData,
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

  it('navigates to the TV detail screen when the header show title is pressed', () => {
    mockQueries();

    const screen = renderWithProviders(<TVSeasonsScreen />);

    fireEvent.press(screen.getByTestId('header-show-title'));

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/library/tv/101');
  });

  it('does not offer a progress card for a season with nothing watched', () => {
    mockEpisodeTracking = null;
    mockQueries();

    const screen = renderWithProviders(<TVSeasonsScreen />);

    expect(screen.queryByTestId('season-share-card-button-1')).toBeNull();
  });

  it('opens a progress card for a season that has been started', () => {
    mockEpisodeTracking = { episodes: { '1_1': { seasonNumber: 1, episodeNumber: 1 } } };
    mockQueries();

    const screen = renderWithProviders(<TVSeasonsScreen />);
    expect(mockOpenShareCard).not.toHaveBeenCalled();

    act(() => {
      screen.getByTestId('season-share-card-button-1').props.onPress();
    });

    expect(mockOpenShareCard).toHaveBeenLastCalledWith([
      expect.objectContaining({
        kind: 'progress',
        showTitle: baseShow.name,
        seasonTitle: 'Season 1',
        seasonYear: '2020',
        watchedCount: 1,
        totalCount: 1,
        posterPath: '/season1.jpg',
      }),
    ]);
    mockEpisodeTracking = null;
  });

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

  it('uses icons with spoken labels instead of text on the season actions', () => {
    mockRatingsData = [];
    mockQueries();

    const screen = renderWithProviders(<TVSeasonsScreen />);

    // The header has its own show-wide Mark All button with the same label.
    expect(screen.getByTestId('season-mark-all-button-1')).toHaveProp(
      'accessibilityLabel',
      'Mark all'
    );
    expect(screen.getByLabelText('Rate')).toBeTruthy();
    expect(screen.getByLabelText('Add Note')).toBeTruthy();
    expect(screen.queryByText('Mark all')).toBeNull();
    expect(screen.queryByText('Rate')).toBeNull();
    expect(screen.queryByText('Add Note')).toBeNull();
  });

  it('passes the season rating to the progress card when there is one', () => {
    mockEpisodeTracking = { episodes: { '1_1': { seasonNumber: 1, episodeNumber: 1 } } };
    mockRatingsData = [{ id: 'season-101-1', mediaType: 'season', rating: 8.5 }];
    mockQueries();

    const screen = renderWithProviders(<TVSeasonsScreen />);
    act(() => {
      screen.getByTestId('season-share-card-button-1').props.onPress();
    });

    expect(mockOpenShareCard).toHaveBeenLastCalledWith([
      expect.objectContaining({ kind: 'progress', userRating: 8.5 }),
    ]);
    mockEpisodeTracking = null;
    mockRatingsData = [];
  });

  it('shows the saved season rating as text after the season has been rated', () => {
    mockQueries();
    mockRatingsData = [{ id: 'season-101-1', mediaType: 'season', rating: 8.5 }];

    const screen = renderWithProviders(<TVSeasonsScreen />);

    expect(screen.getByTestId('season-rate-button-1')).toBeTruthy();
    expect(screen.getByText('8.5')).toBeTruthy();
  });

  it('omits the decimal point for whole-number season ratings', () => {
    mockQueries();
    mockRatingsData = [{ id: 'season-101-1', mediaType: 'season', rating: 8 }];

    const screen = renderWithProviders(<TVSeasonsScreen />);

    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.queryByText('8.0')).toBeNull();
  });

  it('renders the season note button and presents the note editor on press', async () => {
    mockQueries();

    const screen = renderWithProviders(<TVSeasonsScreen />);

    expect(screen.getByTestId('season-note-button-1')).toBeTruthy();

    await act(async () => {
      screen.getByTestId('season-note-button-1').props.onPress();
    });

    expect(mockNotePresent).toHaveBeenCalledTimes(1);
    expect(mockNotePresent).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: 'season',
        mediaId: 101,
        seasonNumber: 1,
        showId: 101,
        mediaTitle: 'Mock Show - Season 1',
        posterPath: '/season1.jpg',
      })
    );
  });

  it('shows edit affordance text when the season already has a note', () => {
    mockQueries();
    mockNotesData = [
      {
        id: 'season-101-1',
        userId: 'user-1',
        mediaType: 'season',
        mediaId: 101,
        content: 'Great season',
        posterPath: '/show.jpg',
        mediaTitle: 'Season 1',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        seasonNumber: 1,
        showId: 101,
      },
    ];

    const screen = renderWithProviders(<TVSeasonsScreen />);

    expect(screen.getByTestId('season-note-button-1')).toBeTruthy();
    expect(screen.getByLabelText('Edit Note')).toBeTruthy();
  });
});
