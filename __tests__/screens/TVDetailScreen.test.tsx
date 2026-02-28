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
}));

jest.mock('@/src/hooks/useNotes', () => ({
  useMediaNote: () => mockUseMediaNoteValue,
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
    preferences: {
      showOriginalTitles: false,
      blurPlotSpoilers: false,
    },
  }),
}));

jest.mock('@/src/hooks/useRatings', () => ({
  useMediaRating: () => ({ userRating: 0, isLoading: false }),
}));

jest.mock('@/src/hooks/useReminders', () => ({
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

  it('alerts and still opens note editor when note preload fails without note content', async () => {
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
});
