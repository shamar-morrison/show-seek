import TVDetailScreen from '@/src/screens/TVDetailScreen';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseQuery = jest.fn();
const mockIsAccountRequired = jest.fn(() => false);
const mockEnsureNoteLoadedForEdit = jest.fn();
const mockNoteModalPresent = jest.fn();
let mockUseMediaNoteValue: any = {
  note: null,
  hasNote: false,
  isLoading: false,
  ensureNoteLoadedForEdit: mockEnsureNoteLoadedForEdit,
};
let mockTvLoading = false;
let mockPreferencesValue: any = {
  showOriginalTitles: false,
  blurPlotSpoilers: false,
  allowUnreleasedEpisodeWatches: false,
  autoAddToWatching: false,
};
let mockAllSeasons: any[] | undefined;
let mockTrackingEpisodes: Record<string, any> = {};
let mockMarkPending = false;
const mockMarkShowAllWatchedMutate = jest.fn();
const mockMarkShowAllUnwatchedMutate = jest.fn();

const mockShow = {
  id: 10,
  name: 'Loaded Show',
  original_name: 'Loaded Show',
  overview: 'Loaded TV Overview',
  poster_path: '/show.jpg',
  backdrop_path: '/show-backdrop.jpg',
  first_air_date: '2024-01-01',
  vote_average: 8.2,
  genres: [{ id: 18, name: 'Drama' }],
  created_by: [],
  seasons: [],
  status: 'Ended',
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
    useLocalSearchParams: () => ({ id: '10' }),
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
    }),
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQuery: (args: any) => mockUseQuery(args),
}));

jest.mock('@/src/api/tmdb', () => ({
  getImageUrl: (path: string | null) => (path ? `https://image.tmdb.org/t/p${path}` : null),
  TMDB_IMAGE_SIZES: {
    backdrop: { medium: 'w780', large: 'w1280', original: 'original' },
    poster: { medium: 'w342' },
  },
  tmdbApi: {
    getTVShowDetails: jest.fn(),
    getSeasonDetails: jest.fn(),
    getTVCredits: jest.fn(),
    getTVVideos: jest.fn(),
    getSimilarTV: jest.fn(),
    getTVWatchProviders: jest.fn(),
    getTVImages: jest.fn(),
    getTVReviews: jest.fn(),
    getRecommendedTV: jest.fn(),
  },
}));

jest.mock('@/src/components/detail/detailStyles', () => ({
  useDetailStyles: () => ({}),
}));

jest.mock('@/src/context/TabContext', () => ({
  useCurrentTab: () => 'discover',
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({ isPremium: true }),
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

jest.mock('@/src/hooks/useProgressiveRender', () => ({
  useProgressiveRender: () => ({ isReady: true }),
}));

jest.mock('@/src/hooks/useContentFilter', () => ({
  useContentFilter: (items: any[]) => items,
}));

jest.mock('@/src/hooks/useDetailLongPress', () => ({
  useDetailLongPress: () => ({
    handleLongPress: jest.fn(),
    addToListModalRef: { current: { present: jest.fn(), dismiss: jest.fn() } },
    selectedMediaItem: null,
  }),
}));

jest.mock('@/src/hooks/useExternalRatings', () => ({
  useExternalRatings: () => ({
    ratings: null,
    isLoading: false,
  }),
}));

jest.mock('@/src/hooks/useLists', () => ({
  useMediaLists: () => ({ membership: {}, isLoading: false }),
  useLists: () => ({ data: [], isLoading: false }),
}));

jest.mock('@/src/hooks/useEpisodeTracking', () => ({
  useShowEpisodeTracking: () => ({ data: { episodes: mockTrackingEpisodes }, isLoading: false }),
  useMarkShowAllEpisodesWatched: () => ({
    mutate: mockMarkShowAllWatchedMutate,
    isPending: mockMarkPending,
  }),
  useMarkShowAllEpisodesUnwatched: () => ({
    mutate: mockMarkShowAllUnwatchedMutate,
    isPending: mockMarkPending,
  }),
}));

jest.mock('@/src/hooks/useNotes', () => ({
  useMediaNote: () => mockUseMediaNoteValue,
  useCanCreateNote: () => jest.fn(async () => true),
}));

jest.mock('@/src/hooks/useNotificationPermissions', () => ({
  useNotificationPermissions: () => ({ requestPermission: jest.fn(async () => true) }),
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    resolvePosterPath: (_mediaType: 'movie' | 'tv', _mediaId: number, fallbackPosterPath: string | null) =>
      fallbackPosterPath,
  }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: mockPreferencesValue,
  }),
}));

jest.mock('@/src/hooks/useRatings', () => ({
  useMediaRating: () => ({ userRating: 0, isLoading: false }),
}));

jest.mock('@/src/hooks/useReminders', () => ({
  useCanCreateReminder: () => jest.fn(async () => true),
  useMediaReminder: () => ({ reminder: null, hasReminder: false, isLoading: false }),
  useCreateReminder: () => ({ mutateAsync: jest.fn() }),
  useCancelReminder: () => ({ mutateAsync: jest.fn() }),
  useUpdateReminder: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('@/src/hooks/useTraktReviews', () => ({
  useTraktReviews: () => ({ reviews: [], isLoading: false, isError: false }),
}));

jest.mock('@/src/hooks/useTVReminderLogic', () => ({
  useTVReminderLogic: () => ({
    nextEpisodeInfo: null,
    effectiveNextEpisode: null,
    nextSeasonAirDate: null,
    nextSeasonNumber: null,
    isUsingSubsequent: false,
    isLoadingSubsequent: false,
    handleSetReminder: jest.fn(),
    handleCancelReminder: jest.fn(),
  }),
}));

jest.mock('@/src/utils/premiumAlert', () => ({
  showPremiumAlert: jest.fn(),
}));

jest.mock('@/src/components/AddToListModal', () => {
  const React = require('react');
  const AddToListModal = React.forwardRef((_props: any, _ref: any) => null);
  AddToListModal.displayName = 'AddToListModal';
  return {
    __esModule: true,
    default: AddToListModal,
  };
});

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
jest.mock('@/src/components/ShareCardModal', () => () => null);
jest.mock('@/src/components/TVReminderModal', () => () => null);
jest.mock('@/src/components/ImageLightbox', () => () => null);
jest.mock('@/src/components/VideoPlayerModal', () => () => null);
jest.mock('@/src/components/UserRating', () => () => null);

jest.mock('@/src/components/ui/AnimatedScrollHeader', () => ({
  AnimatedScrollHeader: () => null,
}));

jest.mock('@/src/components/ui/BlurredText', () => ({
  BlurredText: ({ text }: { text: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, text);
  },
}));

jest.mock('@/src/components/ui/ExpandableText', () => ({
  ExpandableText: ({ text }: { text: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, text);
  },
}));

jest.mock('@/src/components/ui/HeaderIconButton', () => ({
  HeaderIconButton: ({ children }: { children: React.ReactNode }) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, null, children);
  },
}));

jest.mock('@/src/components/ui/SectionSeparator', () => ({
  SectionSeparator: () => null,
}));

jest.mock('@/src/components/ui/AppErrorState', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const AppErrorState = ({ message }: { message: string }) => React.createElement(Text, null, message);
  AppErrorState.displayName = 'AppErrorState';
  return AppErrorState;
});

jest.mock('@/src/components/ui/Toast', () => {
  const React = require('react');
  const Toast = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ show: jest.fn() }));
    return null;
  });
  Toast.displayName = 'Toast';
  return { __esModule: true, default: Toast };
});

jest.mock('@/src/components/detail/DetailScreenSkeleton', () => ({
  DetailScreenSkeleton: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'detail-skeleton' }, 'loading');
  },
}));

jest.mock('@/src/components/detail/TVHeroSection', () => ({
  TVHeroSection: ({ onPosterPress }: { onPosterPress: () => void }) => {
    const React = require('react');
    const { TouchableOpacity } = require('react-native');
    return React.createElement(TouchableOpacity, {
      testID: 'tv-poster-touchable',
      onPress: onPosterPress,
    });
  },
}));

jest.mock('@/src/components/detail/CastSection', () => ({ CastSection: () => null }));
jest.mock('@/src/components/detail/CreatorsSection', () => ({ CreatorsSection: () => null }));
jest.mock('@/src/components/detail/ExternalRatingsSection', () => ({
  ExternalRatingsSection: () => null,
}));
jest.mock('@/src/components/detail/MediaActionButtons', () => ({
  MediaActionButtons: ({ onNote }: { onNote?: () => void }) => {
    const React = require('react');
    const { TouchableOpacity } = require('react-native');
    return React.createElement(TouchableOpacity, {
      testID: 'media-action-note',
      onPress: onNote,
    });
  },
}));
jest.mock('@/src/components/detail/MediaDetailsInfo', () => ({ MediaDetailsInfo: () => null }));
jest.mock('@/src/components/detail/OpenWithDrawer', () => () => null);
jest.mock('@/src/components/detail/PhotosSection', () => ({ PhotosSection: () => null }));
jest.mock('@/src/components/detail/RecommendationsSection', () => ({
  RecommendationsSection: () => null,
}));
jest.mock('@/src/components/detail/ReviewsSection', () => ({ ReviewsSection: () => null }));
jest.mock('@/src/components/detail/SeasonsSection', () => ({ SeasonsSection: () => null }));

const mockUpNextSection = jest.fn();
jest.mock('@/src/components/detail/UpNextEpisodeSection', () => ({
  UpNextEpisodeSection: (props: any) => {
    mockUpNextSection(props);
    return null;
  },
}));
jest.mock('@/src/components/detail/SimilarMediaSection', () => ({
  SimilarMediaSection: () => null,
}));
jest.mock('@/src/components/detail/TraktReviewsSection', () => ({
  TraktReviewsSection: () => null,
}));
jest.mock('@/src/components/detail/TVMetaSection', () => ({ TVMetaSection: () => null }));
jest.mock('@/src/components/detail/VideosSection', () => ({ VideosSection: () => null }));
jest.mock('@/src/components/detail/WatchProvidersSection', () => ({
  WatchProvidersSection: () => null,
}));

describe('TVDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTvLoading = false;
    mockPreferencesValue = {
      showOriginalTitles: false,
      blurPlotSpoilers: false,
      allowUnreleasedEpisodeWatches: false,
      autoAddToWatching: false,
    };
    mockAllSeasons = undefined;
    mockTrackingEpisodes = {};
    mockMarkPending = false;
    mockUseMediaNoteValue = {
      note: null,
      hasNote: false,
      isLoading: false,
      ensureNoteLoadedForEdit: mockEnsureNoteLoadedForEdit,
    };
    mockEnsureNoteLoadedForEdit.mockResolvedValue(null);

    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const subKey = queryKey[2];

      if (queryKey[0] === 'tv' && queryKey.length === 2) {
        return {
          data: mockTvLoading ? undefined : mockShow,
          isLoading: mockTvLoading,
          isError: false,
          error: null,
          refetch: jest.fn(),
        };
      }

      if (subKey === 'credits') {
        return { data: { cast: [], crew: [] }, isLoading: false, isError: false, refetch: jest.fn() };
      }

      if (subKey === 'videos') {
        return { data: [], isLoading: false, isError: false, refetch: jest.fn() };
      }

      if (subKey === 'similar') {
        return { data: { results: [] }, isLoading: false, isError: false, refetch: jest.fn() };
      }

      if (subKey === 'watch-providers') {
        return { data: null, isLoading: false, isError: false, refetch: jest.fn() };
      }

      if (subKey === 'images') {
        return {
          data: { backdrops: [] },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        };
      }

      if (subKey === 'reviews') {
        return {
          data: { results: [] },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        };
      }

      if (subKey === 'recommendations') {
        return {
          data: { results: [] },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        };
      }

      if (subKey === 'all-seasons') {
        return {
          data: mockAllSeasons,
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        };
      }

      return { data: undefined, isLoading: false, isError: false, refetch: jest.fn() };
    });
  });

  it('does not throw when transitioning from loading to loaded state', () => {
    mockTvLoading = true;

    const { getByTestId, getByText, rerender } = render(<TVDetailScreen />);
    expect(getByTestId('detail-skeleton')).toBeTruthy();

    mockTvLoading = false;

    expect(() => rerender(<TVDetailScreen />)).not.toThrow();
    expect(getByText('Loaded TV Overview')).toBeTruthy();
  });

  it('navigates to poster picker on poster press', () => {
    const { getByTestId } = render(<TVDetailScreen />);

    fireEvent.press(getByTestId('tv-poster-touchable'));

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/discover/tv/10/poster-picker');
  });

  it('alerts and opens a blank note editor when preload fails for a new note', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockEnsureNoteLoadedForEdit.mockRejectedValueOnce(new Error('Failed to load note'));

    const { getByTestId } = render(<TVDetailScreen />);

    fireEvent.press(getByTestId('media-action-note'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
      expect(mockNoteModalPresent).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaType: 'tv',
          mediaId: 10,
          mediaTitle: 'Loaded Show',
          initialNote: '',
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

    const { getByTestId } = render(<TVDetailScreen />);

    fireEvent.press(getByTestId('media-action-note'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });

    expect(mockNoteModalPresent).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  describe('Up Next episode card', () => {
    const nextEpisode = {
      id: 101,
      name: 'Freedom Day',
      overview: 'Overview',
      air_date: '2023-05-04',
      episode_number: 1,
      season_number: 1,
      still_path: '/still.jpg',
    };
    const regularSeasons = [
      {
        id: 11,
        name: 'Season 1',
        season_number: 1,
        episode_count: 10,
        air_date: '2023-01-01',
        overview: 'Overview 1',
        poster_path: '/season-1.jpg',
      },
    ];

    const setShowState = (overrides: Record<string, unknown>) => {
      Object.assign(mockShow, overrides);
    };

    const getUpNextProps = () => mockUpNextSection.mock.calls[0]?.[0];

    afterEach(() => {
      Object.assign(mockShow, { status: 'Ended', seasons: [] });
      delete (mockShow as Record<string, unknown>).next_episode_to_air;
    });

    it('renders the up next card above the seasons for a Returning Series show', () => {
      setShowState({ status: 'Returning Series', seasons: regularSeasons, next_episode_to_air: nextEpisode });

      render(<TVDetailScreen />);

      expect(mockUpNextSection).toHaveBeenCalledTimes(1);
      expect(getUpNextProps()).toEqual(expect.objectContaining({ episode: nextEpisode }));
      expect(typeof getUpNextProps().onEpisodePress).toBe('function');
    });

    it('navigates to the episode details screen when the up next episode is pressed', () => {
      setShowState({ status: 'In Production', seasons: regularSeasons, next_episode_to_air: nextEpisode });

      render(<TVDetailScreen />);

      getUpNextProps().onEpisodePress(1, 1);

      expect(mockPush).toHaveBeenCalledWith('/(tabs)/discover/tv/10/season/1/episode/1');
    });

    it('does not render the up next card when the show has ended', () => {
      setShowState({ status: 'Ended', seasons: regularSeasons, next_episode_to_air: nextEpisode });

      render(<TVDetailScreen />);

      expect(mockUpNextSection).not.toHaveBeenCalled();
    });

    it('does not render the up next card when there is no upcoming air date', () => {
      setShowState({ status: 'Returning Series', seasons: regularSeasons });

      render(<TVDetailScreen />);

      expect(mockUpNextSection).not.toHaveBeenCalled();
    });
  });

  describe('Show-wide Mark as Watched button', () => {
    const seasonOne = {
      season_number: 1,
      episodes: [
        { id: 101, name: 'S1 E1', episode_number: 1, season_number: 1, air_date: '2024-01-01' },
        { id: 102, name: 'S1 E2', episode_number: 2, season_number: 1, air_date: '2024-01-08' },
      ],
    };
    const seasonTwo = {
      season_number: 2,
      episodes: [
        { id: 201, name: 'S2 E1', episode_number: 1, season_number: 2, air_date: '2024-02-01' },
        { id: 202, name: 'S2 E2', episode_number: 2, season_number: 2, air_date: '2099-01-01' },
      ],
    };

    const pressConfirmButton = (alertSpy: jest.SpyInstance) => {
      const buttons = alertSpy.mock.calls[0][2];
      const confirmButton = buttons[1];
      confirmButton.onPress();
    };

    beforeEach(() => {
      mockAllSeasons = [seasonOne, seasonTwo];
    });

    it('renders nothing when season details are unavailable', () => {
      mockAllSeasons = undefined;

      const { queryByTestId } = render(<TVDetailScreen />);

      expect(queryByTestId('tv-show-watch-button')).toBeNull();
    });

    it('shows Mark as Watched at 0% and marks aired episodes across seasons after confirm', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { getByTestId, queryByTestId } = render(<TVDetailScreen />);

      expect(getByTestId('tv-show-watch-button')).toBeTruthy();
      expect(queryByTestId('tv-show-watch-progress')).toBeNull();

      fireEvent.press(getByTestId('tv-show-watch-button'));

      expect(alertSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('3'),
        expect.anything()
      );
      pressConfirmButton(alertSpy);

      expect(mockMarkShowAllWatchedMutate).toHaveBeenCalledTimes(1);
      const params = mockMarkShowAllWatchedMutate.mock.calls[0][0];
      expect(params.tvShowId).toBe(10);
      expect(params.episodesToMark).toHaveLength(3);
      expect(params.episodesToMark.map((e: any) => e.episode.id).sort()).toEqual([101, 102, 201]);

      alertSpy.mockRestore();
    });

    it('includes unaired episodes when the unreleased preference is on', () => {
      mockPreferencesValue = { ...mockPreferencesValue, allowUnreleasedEpisodeWatches: true };
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { getByTestId } = render(<TVDetailScreen />);

      fireEvent.press(getByTestId('tv-show-watch-button'));

      expect(alertSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining("haven't aired yet"),
        expect.anything()
      );
      pressConfirmButton(alertSpy);

      const params = mockMarkShowAllWatchedMutate.mock.calls[0][0];
      expect(params.episodesToMark).toHaveLength(4);

      alertSpy.mockRestore();
    });

    it('shows progress count when partially watched and marks only the remainder', () => {
      mockTrackingEpisodes = { '1_1': { episodeId: 101 } };
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { getByTestId, getByText } = render(<TVDetailScreen />);

      expect(getByText('1/3 episodes')).toBeTruthy();

      fireEvent.press(getByTestId('tv-show-watch-button'));
      pressConfirmButton(alertSpy);

      const params = mockMarkShowAllWatchedMutate.mock.calls[0][0];
      expect(params.episodesToMark.map((e: any) => e.episode.id).sort()).toEqual([102, 201]);

      alertSpy.mockRestore();
    });

    it('flips to Mark as Unwatched when fully watched and clears per-season groups', () => {
      mockTrackingEpisodes = {
        '1_1': { episodeId: 101 },
        '1_2': { episodeId: 102 },
        '2_1': { episodeId: 201 },
      };
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { getByTestId, getByText, queryByTestId } = render(<TVDetailScreen />);

      expect(getByText('Mark as Unwatched')).toBeTruthy();
      expect(queryByTestId('tv-show-watch-progress')).toBeNull();

      fireEvent.press(getByTestId('tv-show-watch-button'));

      expect(alertSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringContaining('3'),
        expect.anything()
      );
      pressConfirmButton(alertSpy);

      expect(mockMarkShowAllUnwatchedMutate).toHaveBeenCalledTimes(1);
      const params = mockMarkShowAllUnwatchedMutate.mock.calls[0][0];
      expect(params.tvShowId).toBe(10);
      expect(params.episodesToUnmark).toEqual([
        { seasonNumber: 1, episodes: seasonOne.episodes },
        { seasonNumber: 2, episodes: [seasonTwo.episodes[0]] },
      ]);

      alertSpy.mockRestore();
    });

    it('skips the confirm dialog when only one season is affected', () => {
      mockAllSeasons = [seasonOne];
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { getByTestId } = render(<TVDetailScreen />);

      fireEvent.press(getByTestId('tv-show-watch-button'));

      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockMarkShowAllWatchedMutate).toHaveBeenCalledTimes(1);

      alertSpy.mockRestore();
    });

    it('does nothing while a bulk write is pending', () => {
      mockMarkPending = true;
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const { getByTestId } = render(<TVDetailScreen />);

      fireEvent.press(getByTestId('tv-show-watch-button'));

      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockMarkShowAllWatchedMutate).not.toHaveBeenCalled();
      expect(mockMarkShowAllUnwatchedMutate).not.toHaveBeenCalled();

      alertSpy.mockRestore();
    });
  });
});
