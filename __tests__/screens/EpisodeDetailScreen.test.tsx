import EpisodeDetailScreen from '@/src/screens/EpisodeDetailScreen';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseQuery = jest.fn();
const mockIsAccountRequired = jest.fn(() => false);
const mockEnsureNoteLoadedForEdit = jest.fn();
const mockNoteModalPresent = jest.fn();
const mockResolvePosterPath = jest.fn();
let mockUseMediaNoteValue: any = {
  note: null,
  hasNote: false,
  isLoading: false,
  ensureNoteLoadedForEdit: mockEnsureNoteLoadedForEdit,
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
  useIsEpisodeWatched: () => ({ isWatched: false }),
  useMarkEpisodeWatched: () => ({ mutate: jest.fn(), isPending: false }),
  useMarkEpisodeUnwatched: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/src/hooks/useFavoriteEpisodes', () => ({
  useIsEpisodeFavorited: () => ({ isFavorited: false, isLoading: false }),
  useToggleFavoriteEpisode: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/src/hooks/useLists', () => ({
  useMediaLists: () => ({ membership: {} }),
  useLists: () => ({ data: [{ id: 'currently-watching', items: {} }] }),
}));

jest.mock('@/src/hooks/useNotes', () => ({
  useMediaNote: () => mockUseMediaNoteValue,
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    resolvePosterPath: (...args: unknown[]) => mockResolvePosterPath(...args),
  }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: {
      showOriginalTitles: false,
    },
  }),
}));

jest.mock('@/src/hooks/useProgressiveRender', () => ({
  useProgressiveRender: () => ({ isReady: true }),
}));

jest.mock('@/src/hooks/useRatings', () => ({
  useEpisodeRating: () => ({ userRating: 0, isLoading: false }),
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

jest.mock('@/src/components/RatingButton', () => () => null);
jest.mock('@/src/components/RatingModal', () => () => null);
jest.mock('@/src/components/ImageLightbox', () => () => null);
jest.mock('@/src/components/VideoPlayerModal', () => () => null);
jest.mock('@/src/components/UserRating', () => () => null);

jest.mock('@/src/components/ui/AnimatedScrollHeader', () => ({
  AnimatedScrollHeader: () => null,
}));

jest.mock('@/src/components/ui/AppErrorState', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const AppErrorState = ({ message }: { message: string }) => React.createElement(Text, null, message);
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
    mockResolvePosterPath.mockReturnValue('/resolved-show.jpg');
    mockUseMediaNoteValue = {
      note: null,
      hasNote: false,
      isLoading: false,
      ensureNoteLoadedForEdit: mockEnsureNoteLoadedForEdit,
    };
    mockEnsureNoteLoadedForEdit.mockResolvedValue(null);

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
          data: mockEpisode,
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
