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

const mockAddToListPresent = jest.fn().mockResolvedValue(undefined);
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
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  const FlashList = React.forwardRef(({ data, renderItem, ListEmptyComponent }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: jest.fn().mockResolvedValue(undefined),
      scrollToOffset: jest.fn(),
    }));

    return (
      <View>
        {(data || []).length === 0 && ListEmptyComponent}
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

let mockListsData: Array<{ id: string; items: Record<string, object> }> = [];

jest.mock('@/src/hooks/useLists', () => ({
  useMediaLists: () => ({ membership: {} }),
  useLists: () => ({ data: mockListsData }),
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

jest.mock('@/src/components/AddToListModal', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockAddToListModal = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: (...args: any[]) => mockAddToListPresent(props.mediaItem, ...args),
      dismiss: jest.fn().mockResolvedValue(undefined),
    }));
    return <View testID="season-add-to-list-modal" />;
  });
  MockAddToListModal.displayName = 'MockAddToListModal';
  return { __esModule: true, default: MockAddToListModal };
});

jest.mock('@/src/components/ui/Toast', () => {
  const React = require('react');
  const MockToast = React.forwardRef(() => null);
  MockToast.displayName = 'MockToast';
  return { __esModule: true, default: MockToast };
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

  function mockQueries(overview = 'Overview', seasons: any[] = [buildSeason(overview)]) {
    mockUseQuery.mockImplementation(({ queryKey }: any) => {
      if (Array.isArray(queryKey) && queryKey[2] === 'all-seasons') {
        return {
          data: seasons,
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

  describe('add to list', () => {
    afterEach(() => {
      mockListsData = [];
    });

    it('opens the list sheet with the season as a list entry', async () => {
      mockQueries();

      const screen = renderWithProviders(<TVSeasonsScreen />);

      fireEvent.press(screen.getByTestId('season-add-to-list-button-1'));

      await waitFor(() => expect(mockAddToListPresent).toHaveBeenCalledTimes(1));
      expect(mockAddToListPresent.mock.calls[0][0]).toEqual({
        id: 101,
        media_type: 'season',
        season_number: 1,
        season_name: 'Season 1',
        show_name: 'Mock Show',
        title: 'Mock Show · Season 1',
        name: 'Mock Show · Season 1',
        poster_path: '/season1.jpg',
        vote_average: 0,
        release_date: '2020-01-01',
        first_air_date: '2020-01-01',
        genre_ids: [18, 35],
        runtimeMinutes: 42,
        seasonRuntimeMinutes: 42,
      });
    });

    it('marks the button when that season is in a list, but not when only the show is', () => {
      mockListsData = [
        {
          id: 'watchlist',
          items: {
            'tv-101': { id: 101, media_type: 'tv' },
            'season-101-2': { id: 101, media_type: 'season', season_number: 2 },
          },
        },
      ];
      mockQueries();

      const screen = renderWithProviders(<TVSeasonsScreen />);
      expect(
        screen.getByTestId('season-add-to-list-button-1').props.accessibilityState
      ).toMatchObject({ selected: false });

      mockListsData = [
        {
          id: 'favorites',
          items: { 'season-101-1': { id: 101, media_type: 'season', season_number: 1 } },
        },
      ];
      screen.rerender(<TVSeasonsScreen />);

      expect(
        screen.getByTestId('season-add-to-list-button-1').props.accessibilityState
      ).toMatchObject({ selected: true });
    });

    it("shows the list's own icon for one list and the multiple-lists icon for several", () => {
      const { FavouriteIcon, CheckListIcon } = jest.requireActual('@hugeicons/core-free-icons');
      const buttonIcon = (screen: ReturnType<typeof renderWithProviders>) =>
        screen
          .getByTestId('season-add-to-list-button-1')
          .findAll((node: any) => node.props?.icon !== undefined)[0].props.icon;

      const season = { id: 101, media_type: 'season', season_number: 1 };
      mockListsData = [{ id: 'favorites', items: { 'season-101-1': season } }];
      mockQueries();
      const screen = renderWithProviders(<TVSeasonsScreen />);
      expect(buttonIcon(screen)).toBe(FavouriteIcon);

      mockListsData = [
        { id: 'favorites', items: { 'season-101-1': season } },
        { id: 'watchlist', items: { 'season-101-1': season } },
      ];
      screen.rerender(<TVSeasonsScreen />);
      expect(buttonIcon(screen)).toBe(CheckListIcon);
    });
  });

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

  describe('season search', () => {
    beforeEach(() => {
      const globalAny = global as any;
      globalAny.requestAnimationFrame = (callback: (timestamp: number) => void) => {
        callback(0);
        return 1;
      };
      globalAny.cancelAnimationFrame = jest.fn();
    });

    const buildNamedSeason = (seasonNumber: number, name: string, airDates: string[]) => ({
      ...buildSeason('Overview'),
      id: seasonNumber,
      season_number: seasonNumber,
      name,
      air_date: airDates[0],
      episodes: airDates.map((airDate, index) => ({
        ...buildSeason('Overview').episodes[0],
        id: seasonNumber * 100 + index,
        episode_number: index + 1,
        air_date: airDate,
        season_number: seasonNumber,
      })),
    });

    const searchSeasons = [
      buildNamedSeason(0, 'Specials', ['2018-12-24']),
      buildNamedSeason(1, 'Book One: Water', ['2019-09-01', '2020-05-01']),
      buildNamedSeason(2, 'Book Two: Earth', ['2021-03-01']),
      buildNamedSeason(12, 'Season 12', ['2022-01-01']),
    ];

    const typeSearch = async (screen: ReturnType<typeof renderWithProviders>, text: string) => {
      fireEvent.changeText(screen.getByPlaceholderText('Search by name, number or year…'), text);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
    };

    it('hides the search button when the show has a single season', () => {
      mockQueries();

      const screen = renderWithProviders(<TVSeasonsScreen />);

      expect(screen.queryByTestId('header-search-button')).toBeNull();
    });

    it('filters seasons by name, year and season number', async () => {
      mockQueries('Overview', searchSeasons);

      const screen = renderWithProviders(<TVSeasonsScreen />);
      fireEvent.press(screen.getByTestId('header-search-button'));

      expect(screen.queryByTestId('header-mark-all-button')).toBeNull();

      await typeSearch(screen, 'earth');
      expect(screen.getByText('Book Two: Earth')).toBeTruthy();
      expect(screen.queryByText('Book One: Water')).toBeNull();

      // A season that runs across the new year matches both years
      await typeSearch(screen, '2020');
      expect(screen.getByText('Book One: Water')).toBeTruthy();
      expect(screen.queryByText('Book Two: Earth')).toBeNull();

      await typeSearch(screen, '12');
      expect(screen.getByText('Season 12')).toBeTruthy();
      expect(screen.queryByText('Book One: Water')).toBeNull();

      await typeSearch(screen, 'nothing like this');
      expect(screen.getByText('No results found')).toBeTruthy();
    });

    it('restores the full list and header when the search is closed', async () => {
      mockQueries('Overview', searchSeasons);

      const screen = renderWithProviders(<TVSeasonsScreen />);
      fireEvent.press(screen.getByTestId('header-search-button'));
      await typeSearch(screen, 'earth');

      fireEvent.press(screen.getByTestId('searchable-header-clear'));
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });

      expect(screen.getByTestId('header-mark-all-button')).toBeTruthy();
      expect(screen.getByText('Specials')).toBeTruthy();
      expect(screen.getByText('Book One: Water')).toBeTruthy();
      expect(screen.getByText('Season 12')).toBeTruthy();
    });
  });
});
