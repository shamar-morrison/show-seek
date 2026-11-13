import EpisodeDetailScreen from '@/src/screens/EpisodeDetailScreen';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseQuery = jest.fn();
const mockIsAccountRequired = jest.fn(() => false);
const mockMarkEpisodeWatchedMutate = jest.fn();
const mockMarkEpisodeUnwatchedMutate = jest.fn();
const mockEnsureNoteLoadedForEdit = jest.fn();
const mockNoteModalPresent = jest.fn();
const mockResolvePosterPath = jest.fn();
const mockToggleFavoriteEpisodeMutate = jest.fn();
const mockToggleFavoriteEpisodeMutateAsync = jest.fn();
const mockAddToListPresent = jest.fn();
const mockRefreshEpisodeListEntries = jest.fn();
let mockLists: { id: string; items: Record<string, unknown> }[] = [];
let mockIsWatched = false;
let mockPreferences = {
  showOriginalTitles: false,
  allowUnreleasedEpisodeWatches: false,
};
let mockUseMediaNoteValue: any = {
  note: null,
  hasNote: false,
  isLoading: false,
  ensureNoteLoadedForEdit: mockEnsureNoteLoadedForEdit,
};
let mockUseIsEpisodeFavoritedValue = {
  isFavorited: false,
  isLoading: false,
};
let mockToggleFavoriteEpisodeValue = {
  mutate: mockToggleFavoriteEpisodeMutate,
  mutateAsync: mockToggleFavoriteEpisodeMutateAsync,
  isPending: false,
};

const mockTvShow = {
  id: 10,
  name: 'Loaded Show',
  original_name: 'Loaded Show',
  poster_path: '/show.jpg',
};

const mockEpisode = {
  id: 200,
  name: 'Pilot',
  overview: 'Episode overview',
  still_path: '/still.jpg',
  air_date: '2024-01-01',
  runtime: 42,
  vote_average: 8.3,
};

const mockSeason = {
  episodes: [],
};

const setMockQueries = (episodeOverrides: Partial<typeof mockEpisode> = {}) => {
  const episodeData = { ...mockEpisode, ...episodeOverrides };

  mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
    const lastKey = queryKey[queryKey.length - 1];

    if (queryKey[0] === 'tv' && queryKey.length === 2) {
      return {
        data: mockTvShow,
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      };
    }

    if (queryKey[0] === 'tv' && queryKey[2] === 'season' && queryKey.length === 4) {
      return {
        data: mockSeason,
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      };
    }

    if (lastKey === 'details') {
      return {
        data: episodeData,
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      };
    }

    if (lastKey === 'credits') {
      return {
        data: { guest_stars: [], crew: [] },
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      };
    }

    if (lastKey === 'videos') {
      return {
        data: [],
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      };
    }

    if (lastKey === 'images') {
      return {
        data: { stills: [] },
        isLoading: false,
        isError: false,
        error: null,
        refetch: jest.fn(),
      };
    }

    return {
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    };
  });
};

const mockOpenShareCard = jest.fn();
let mockSeasonProgress: { watchedCount: number; progressTotalCount: number } | null = null;
jest.mock('@/src/hooks/useOpenShareCard', () => ({
  useOpenShareCard: () => mockOpenShareCard,
}));

jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  Stack.displayName = 'Stack';
  const StackScreen = () => null;
  StackScreen.displayName = 'StackScreen';
  Stack.Screen = StackScreen;

  return {
    Stack,
    useLocalSearchParams: () => ({ id: '10', seasonNum: '1', episodeNum: '2' }),
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
    }),
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQuery: (args: any) => mockUseQuery(args),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(View, null, children),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Error: 'error',
  },
}));

jest.mock('@/src/api/tmdb', () => ({
  getImageUrl: (path: string | null) => (path ? `https://image.tmdb.org/t/p${path}` : null),
  TMDB_IMAGE_SIZES: {
    backdrop: { large: 'w1280', original: 'original' },
  },
  tmdbApi: {
    getTVShowDetails: jest.fn(),
    getSeasonDetails: jest.fn(),
    getEpisodeDetails: jest.fn(),
    getEpisodeCredits: jest.fn(),
    getEpisodeVideos: jest.fn(),
    getEpisodeImages: jest.fn(),
  },
}));

jest.mock('@/src/components/detail/detailStyles', () => ({
  useDetailStyles: () => ({
    sectionTitle: {},
    readMore: {},
    episodeHeroContainer: {},
  }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({ isPremium: true }),
}));

jest.mock('@/src/context/TabContext', () => ({
  useCurrentTab: () => 'discover',
}));

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockIsAccountRequired,
}));

jest.mock('@/src/hooks/useAnimatedScrollHeader', () => ({
  useAnimatedScrollHeader: () => ({
    scrollY: 0,
    scrollViewProps: {},
  }),
}));

jest.mock('@/src/hooks/useEpisodeTracking', () => ({
  useShowEpisodeTracking: () => ({ data: null }),
  useIsEpisodeWatched: () => ({ isWatched: mockIsWatched }),
  useSeasonProgress: () => ({ progress: mockSeasonProgress }),
  useMarkEpisodeWatched: () => ({ mutate: mockMarkEpisodeWatchedMutate, isPending: false }),
  useMarkEpisodeUnwatched: () => ({ mutate: mockMarkEpisodeUnwatchedMutate, isPending: false }),
}));

jest.mock('@/src/hooks/useFavoriteEpisodes', () => ({
  useIsEpisodeFavorited: () => mockUseIsEpisodeFavoritedValue,
  useToggleFavoriteEpisode: () => mockToggleFavoriteEpisodeValue,
}));

jest.mock('@/src/hooks/useLists', () => ({
  useMediaLists: () => ({ membership: {} }),
  useLists: () => ({ data: mockLists }),
}));

jest.mock('@/src/hooks/useNotes', () => ({
  useCanCreateNote: () => jest.fn(async () => true),
  useMediaNote: () => mockUseMediaNoteValue,
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    resolvePosterPath: (...args: unknown[]) => mockResolvePosterPath(...args),
  }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: mockPreferences,
  }),
}));

jest.mock('@/src/hooks/useProgressiveRender', () => ({
  useProgressiveRender: () => ({ isReady: true }),
}));

jest.mock('@/src/hooks/useRatings', () => ({
  useEpisodeRating: () => ({ userRating: 0, isLoading: false }),
  useSeasonRating: () => ({ userRating: 7, isLoading: false }),
}));

jest.mock('@/src/components/NotesModal', () => {
  const React = require('react');
  const NoteModal = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: mockNoteModalPresent,
      dismiss: jest.fn(),
    }));
    return null;
  });
  NoteModal.displayName = 'NoteModal';
  return {
    __esModule: true,
    default: NoteModal,
  };
});

jest.mock('@/src/hooks/useRefreshEpisodeListEntries', () => ({
  useRefreshEpisodeListEntries: (args: unknown) => mockRefreshEpisodeListEntries(args),
}));

jest.mock('@/src/components/AddToListModal', () => {
  const React = require('react');
  const MockAddToListModal = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: () => mockAddToListPresent(props.mediaItem),
      dismiss: jest.fn().mockResolvedValue(undefined),
    }));
    return null;
  });
  MockAddToListModal.displayName = 'MockAddToListModal';
  return { __esModule: true, default: MockAddToListModal };
});

jest.mock('@/src/components/RatingButton', () => () => null);
jest.mock('@/src/components/RatingModal', () => () => null);
jest.mock('@/src/components/ListActionsModal', () => {
  const React = require('react');
  const ListActionsModal = React.forwardRef((_props: any, _ref: any) => null);
  ListActionsModal.displayName = 'ListActionsModal';
  return {
    __esModule: true,
    default: ListActionsModal,
  };
});

jest.mock('@/src/hooks/usePersonFavoriteSheet', () => ({
  usePersonFavoriteSheet: () => ({
    sheetRef: { current: null },
    actions: [],
    selectedPerson: null,
    handlePersonLongPress: jest.fn(),
  }),
  toPersonFavoriteTarget: (person: any) => ({
    id: person.id,
    name: person.name,
    profile_path: person.profile_path ?? null,
    known_for_department: person.known_for_department ?? '',
  }),
}));
jest.mock('@/src/components/ImageLightbox', () => () => null);
jest.mock('@/src/components/VideoPlayerModal', () => () => null);
jest.mock('@/src/components/UserRating', () => () => null);

jest.mock('@/src/components/ui/AnimatedScrollHeader', () => ({
  AnimatedScrollHeader: () => null,
}));

jest.mock('@/src/components/ui/AppErrorState', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const { TouchableOpacity } = require('react-native');
  const AppErrorState = ({
    message,
    onRetry,
    retryLabel,
    retryTestID,
  }: {
    message: string;
    onRetry?: () => void;
    retryLabel?: string;
    retryTestID?: string;
  }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(Text, null, message),
      onRetry
        ? React.createElement(
            TouchableOpacity,
            { onPress: onRetry, testID: retryTestID },
            React.createElement(Text, null, retryLabel ?? 'Retry')
          )
        : null
    );
  AppErrorState.displayName = 'AppErrorState';
  return AppErrorState;
});

jest.mock('@/src/components/ui/ExpandableText', () => ({
  ExpandableText: ({ text }: { text: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, text);
  },
}));

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, 'loading');
  },
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: (props: any) => {
    const React = require('react');
    return React.createElement('Image', props);
  },
}));

jest.mock('@/src/components/ui/SectionSeparator', () => ({
  SectionSeparator: () => null,
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

jest.mock('@/src/components/detail/CastSection', () => ({ CastSection: () => null }));
jest.mock('@/src/components/detail/CrewSection', () => ({ CrewSection: () => null }));
jest.mock('@/src/components/detail/PhotosSection', () => ({ PhotosSection: () => null }));
jest.mock('@/src/components/detail/RelatedEpisodesSection', () => ({
  RelatedEpisodesSection: () => null,
}));
jest.mock('@/src/components/detail/VideosSection', () => ({ VideosSection: () => null }));

describe('EpisodeDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsWatched = false;
    mockSeasonProgress = null;
    mockLists = [{ id: 'currently-watching', items: {} }];
    mockPreferences = {
      showOriginalTitles: false,
      allowUnreleasedEpisodeWatches: false,
    };
    mockResolvePosterPath.mockReturnValue('/resolved-show.jpg');
    mockUseIsEpisodeFavoritedValue = {
      isFavorited: false,
      isLoading: false,
    };
    mockToggleFavoriteEpisodeValue = {
      mutate: mockToggleFavoriteEpisodeMutate,
      mutateAsync: mockToggleFavoriteEpisodeMutateAsync,
      isPending: false,
    };
    mockUseMediaNoteValue = {
      note: null,
      hasNote: false,
      isLoading: false,
      ensureNoteLoadedForEdit: mockEnsureNoteLoadedForEdit,
    };
    mockEnsureNoteLoadedForEdit.mockResolvedValue(null);

    setMockQueries();
  });

  it('puts Add to List first in the action row and opens it with the episode entry', () => {
    const { getByTestId, UNSAFE_root } = render(<EpisodeDetailScreen />);

    const actionIds = UNSAFE_root.findAll(
      (node: { type: unknown; props: { testID?: unknown } }) =>
        typeof node.type === 'string' &&
        typeof node.props.testID === 'string' &&
        /^episode-.+-action$/.test(node.props.testID)
    ).map((node: { props: { testID?: unknown } }) => node.props.testID);
    expect(actionIds[0]).toBe('episode-add-to-list-action');
    expect(actionIds).toContain('episode-favorite-action');

    const button = getByTestId('episode-add-to-list-action');
    expect(button.props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(button);

    expect(mockAddToListPresent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 10,
        media_type: 'episode',
        season_number: 1,
        episode_number: 2,
        episode_name: 'Pilot',
        show_name: 'Loaded Show',
        title: 'Loaded Show · S1E2 · Pilot',
        poster_path: '/show.jpg',
        still_path: '/still.jpg',
        release_date: '2024-01-01',
        episodeRuntimeMinutes: 42,
      })
    );
  });

  it('highlights Add to List when the episode is in a list', () => {
    mockLists = [
      {
        id: 'watchlist',
        items: {
          'episode-10-1-2': { id: 10, media_type: 'episode', season_number: 1, episode_number: 2 },
        },
      },
    ];

    const { getByTestId } = render(<EpisodeDetailScreen />);

    expect(getByTestId('episode-add-to-list-action').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it("shows the list's own icon for one list and the multiple-lists icon only for several", () => {
    const { Bookmark02Icon, CheckListIcon, Folder01Icon, PlusSignIcon } = jest.requireActual(
      '@hugeicons/core-free-icons'
    );
    const buttonIcon = (screen: ReturnType<typeof render>) =>
      screen
        .getByTestId('episode-add-to-list-action')
        .findAll((node: any) => node.props?.icon !== undefined)[0].props.icon;
    const entry = { id: 10, media_type: 'episode', season_number: 1, episode_number: 2 };

    mockLists = [{ id: 'watchlist', items: {} }];
    const screen = render(<EpisodeDetailScreen />);
    expect(buttonIcon(screen)).toBe(PlusSignIcon);

    mockLists = [{ id: 'watchlist', items: { 'episode-10-1-2': entry } }];
    screen.rerender(<EpisodeDetailScreen />);
    expect(buttonIcon(screen)).toBe(Bookmark02Icon);

    mockLists = [{ id: 'my-list', items: { 'episode-10-1-2': entry } }];
    screen.rerender(<EpisodeDetailScreen />);
    expect(buttonIcon(screen)).toBe(Folder01Icon);

    mockLists = [
      { id: 'watchlist', items: { 'episode-10-1-2': entry } },
      { id: 'my-list', items: { 'episode-10-1-2': entry } },
    ];
    screen.rerender(<EpisodeDetailScreen />);
    expect(buttonIcon(screen)).toBe(CheckListIcon);
  });

  it("offers the show instead of a retry when TMDB doesn't have the episode anymore", () => {
    const fallback = mockUseQuery.getMockImplementation()!;
    mockUseQuery.mockImplementation((args: { queryKey: unknown[] }) =>
      args.queryKey[args.queryKey.length - 1] === 'details'
        ? {
            data: undefined,
            isLoading: false,
            isError: true,
            error: { status: 404, message: 'The resource you requested could not be found.' },
            refetch: jest.fn(),
          }
        : fallback(args)
    );

    const { getByText, getByTestId, queryByText } = render(<EpisodeDetailScreen />);

    expect(
      getByText("TMDB doesn't have this episode anymore. It may have been removed or renumbered.")
    ).toBeTruthy();
    expect(queryByText('Failed to load episode details')).toBeNull();
    fireEvent.press(getByTestId('episode-missing-go-to-show'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/discover/tv/10');
  });

  it('keeps the usual retry for other errors', () => {
    const fallback = mockUseQuery.getMockImplementation()!;
    mockUseQuery.mockImplementation((args: { queryKey: unknown[] }) =>
      args.queryKey[args.queryKey.length - 1] === 'details'
        ? {
            data: undefined,
            isLoading: false,
            isError: true,
            error: { status: 500, message: 'TMDB request failed' },
            refetch: jest.fn(),
          }
        : fallback(args)
    );

    const { getByText, queryByTestId } = render(<EpisodeDetailScreen />);

    expect(getByText('Failed to load episode details')).toBeTruthy();
    expect(queryByTestId('episode-missing-go-to-show')).toBeNull();
  });

  it('asks a guest to sign in instead of opening Add to List', () => {
    mockIsAccountRequired.mockReturnValueOnce(true);
    const { getByTestId } = render(<EpisodeDetailScreen />);

    fireEvent.press(getByTestId('episode-add-to-list-action'));

    expect(mockAddToListPresent).not.toHaveBeenCalled();
  });

  it('refreshes saved entries of this episode with its loaded details', () => {
    render(<EpisodeDetailScreen />);

    expect(mockRefreshEpisodeListEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        tvId: 10,
        seasonNumber: 1,
        episodeNumber: 2,
        episode: expect.objectContaining({ name: 'Pilot' }),
        lists: mockLists,
      })
    );
  });

  it('shows a spinner and disables the favorite button while the favorite mutation is pending', () => {
    mockToggleFavoriteEpisodeValue = {
      mutate: mockToggleFavoriteEpisodeMutate,
      mutateAsync: mockToggleFavoriteEpisodeMutateAsync,
      isPending: true,
    };

    const { getByTestId, queryByTestId } = render(<EpisodeDetailScreen />);

    expect(getByTestId('episode-favorite-action').props.disabled).toBe(true);
    expect(getByTestId('episode-favorite-action-spinner')).toBeTruthy();
    expect(queryByTestId('episode-favorite-action-icon')).toBeNull();
  });

  it('renders the heart icon when the favorite action is idle', () => {
    const { getByTestId, queryByTestId } = render(<EpisodeDetailScreen />);

    expect(getByTestId('episode-favorite-action').props.disabled).toBe(false);
    expect(getByTestId('episode-favorite-action-icon')).toBeTruthy();
    expect(queryByTestId('episode-favorite-action-spinner')).toBeNull();
  });

  it('keeps a future episode locked when the unreleased watch preference is off', () => {
    setMockQueries({ air_date: '2999-01-01' });

    const { getByText } = render(<EpisodeDetailScreen />);

    fireEvent.press(getByText('Not yet aired'));
    expect(mockMarkEpisodeWatchedMutate).not.toHaveBeenCalled();
  });

  it('allows marking a future episode watched when the unreleased watch preference is on', () => {
    mockPreferences = {
      showOriginalTitles: false,
      allowUnreleasedEpisodeWatches: true,
    };
    setMockQueries({ air_date: '2999-01-01' });

    const { getByText } = render(<EpisodeDetailScreen />);

    fireEvent.press(getByText('Mark as Watched'));
    expect(mockMarkEpisodeWatchedMutate).toHaveBeenCalledTimes(1);
  });

  it('allows unwatching a future episode even when the unreleased watch preference is off', () => {
    mockIsWatched = true;
    setMockQueries({ air_date: '2999-01-01' });

    const { getByText } = render(<EpisodeDetailScreen />);

    fireEvent.press(getByText('Mark as Unwatched'));
    expect(mockMarkEpisodeUnwatchedMutate).toHaveBeenCalledTimes(1);
  });

  it('opens the note editor with preloaded note content', async () => {
    mockEnsureNoteLoadedForEdit.mockResolvedValueOnce({
      id: 'episode-10-1-2',
      userId: 'test-user-id',
      mediaType: 'episode',
      mediaId: 10,
      content: 'Loaded episode note',
      posterPath: '/show.jpg',
      mediaTitle: 'Pilot',
      createdAt: new Date(),
      updatedAt: new Date(),
      seasonNumber: 1,
      episodeNumber: 2,
      showId: 10,
    });

    const { getByTestId } = render(<EpisodeDetailScreen />);

    fireEvent.press(getByTestId('episode-note-action'));

    await waitFor(() => {
      expect(mockNoteModalPresent).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaType: 'episode',
          mediaId: 10,
          seasonNumber: 1,
          episodeNumber: 2,
          posterPath: '/resolved-show.jpg',
          mediaTitle: 'Pilot',
          initialNote: 'Loaded episode note',
          showId: 10,
        })
      );
    });
  });

  it('opens the share card editor with the episode from the action row', () => {
    const { getByTestId } = render(<EpisodeDetailScreen />);
    expect(mockOpenShareCard).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('episode-share-card-action'));

    expect(mockOpenShareCard).toHaveBeenLastCalledWith([
      expect.objectContaining({
        kind: 'episode',
        showTitle: mockTvShow.name,
        episodeTitle: mockEpisode.name,
        seasonNumber: 1,
        episodeNumber: 2,
        stillPath: mockEpisode.still_path,
        runtimeMinutes: mockEpisode.runtime,
        userRating: expect.any(Number),
      }),
    ]);
  });

  it('also offers the progress card once the season has been started', () => {
    mockSeasonProgress = { watchedCount: 3, progressTotalCount: 10 };
    const { getByTestId } = render(<EpisodeDetailScreen />);

    fireEvent.press(getByTestId('episode-share-card-action'));

    expect(mockOpenShareCard).toHaveBeenLastCalledWith([
      expect.objectContaining({ kind: 'episode' }),
      expect.objectContaining({
        kind: 'progress',
        showTitle: mockTvShow.name,
        watchedCount: 3,
        totalCount: 10,
        userRating: 7,
      }),
    ]);
  });

  it('does not offer the progress card when nothing in the season is watched', () => {
    mockSeasonProgress = { watchedCount: 0, progressTotalCount: 10 };
    const { getByTestId } = render(<EpisodeDetailScreen />);

    fireEvent.press(getByTestId('episode-share-card-action'));

    const [cards] = mockOpenShareCard.mock.lastCall as [{ kind: string }[]];
    expect(cards.map((card) => card.kind)).toEqual(['episode']);
  });

  it('alerts and opens a blank note editor when preload fails for a new note', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockEnsureNoteLoadedForEdit.mockRejectedValueOnce(new Error('Failed to load note'));

    const { getByTestId } = render(<EpisodeDetailScreen />);

    fireEvent.press(getByTestId('episode-note-action'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
      expect(mockNoteModalPresent).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaType: 'episode',
          mediaId: 10,
          seasonNumber: 1,
          episodeNumber: 2,
          mediaTitle: 'Pilot',
          initialNote: '',
          showId: 10,
        })
      );
    });

    alertSpy.mockRestore();
  });

  it('alerts and does not open the note editor when a persisted note fails to load', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockUseMediaNoteValue = {
      note: null,
      hasNote: true,
      isLoading: false,
      ensureNoteLoadedForEdit: mockEnsureNoteLoadedForEdit,
    };
    mockEnsureNoteLoadedForEdit.mockRejectedValueOnce(new Error('Failed to load note'));

    const { getByTestId } = render(<EpisodeDetailScreen />);

    fireEvent.press(getByTestId('episode-note-action'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    expect(mockNoteModalPresent).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
