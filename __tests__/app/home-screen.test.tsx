import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockPresent = jest.fn();
const mockRequireAccount = jest.fn();
const mockPush = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockRepairHomeScreenLists = jest.fn();
const mockContentFilterState = {
  diagnostics: {
    allItemsRemovedByPreferences: false,
    removedByPreferences: false,
    removedByUnreleasedContent: false,
    removedByWatchedContent: false,
  },
  filteredItems: null as any[] | null,
};

const mockAuthState = {
  user: { uid: 'user-1', isAnonymous: false } as null | { uid: string; isAnonymous?: boolean },
  isGuest: false,
};

const mockPremiumState = {
  isPremium: true,
};

const mockPreferencesState: {
  homeScreenLists: Array<{ id: string; type: string; label: string }>;
  isLoading: boolean;
  preferences: Record<string, unknown> & {
    homeScreenLists: Array<{ id: string; type: string; label: string }>;
    showOriginalTitles: boolean;
    dataSaver: boolean;
  };
} = {
  homeScreenLists: [{ id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' }],
  isLoading: false,
  preferences: {
    homeScreenLists: [{ id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' }],
    showOriginalTitles: false,
    dataSaver: false,
  },
};

const mockListsState = {
  data: [] as any[],
  isLoading: false,
  isError: false,
};

let mockTmdbPages: any[] = [];
let latestMediaItem: any = null;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    router: {
      push: (...args: unknown[]) => mockPush(...args),
    },
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => effect(), [effect]);
    },
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: (...args: unknown[]) => mockInvalidateQueries(...args),
  }),
  useInfiniteQuery: () => ({
    data: { pages: mockTmdbPages },
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: jest.fn(),
  }),
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    FlashList: ({ data = [], renderItem, keyExtractor, ...rest }: any) =>
      React.createElement(
        View,
        rest,
        data.map((item: any, index: number) =>
          React.createElement(
            View,
            { key: keyExtractor ? keyExtractor(item, index) : index },
            renderItem({ item, index })
          )
        )
      ),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Medium: 'medium',
  },
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => () => {
    if (!mockAuthState.user || mockAuthState.isGuest) {
      mockRequireAccount();
      return true;
    }
    return false;
  },
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => mockPreferencesState,
  useUpdateHomeScreenLists: () => ({
    mutate: (...args: any[]) => mockRepairHomeScreenLists(...args),
    isPending: false,
  }),
}));

jest.mock('@/src/hooks/useContentFilter', () => ({
  useContentFilter: (items: any[]) => items,
  useContentFilterWithDiagnostics: (items: any[]) => ({
    diagnostics: mockContentFilterState.diagnostics,
    filteredItems: mockContentFilterState.filteredItems ?? items,
  }),
}));

jest.mock('@/src/hooks/useLists', () => ({
  useLists: () => mockListsState,
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    overrides: {},
    resolvePosterPath: (_mediaType: 'movie' | 'tv', _mediaId: number, fallbackPosterPath: string | null) =>
      fallbackPosterPath,
  }),
}));

jest.mock('@/src/hooks/useNavigation', () => ({
  useCurrentTab: () => 'home',
}));

jest.mock('@/src/hooks/useListMembership', () => ({
  useListMembership: () => ({
    getListsForMedia: () => [],
  }),
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));

jest.mock('@/src/components/ui/ListMembershipBadge', () => ({
  ListMembershipBadge: () => null,
}));

jest.mock('@/src/components/HomeDrawer', () => ({
  HomeDrawer: () => null,
}));

jest.mock('@/src/components/HomeScreenCustomizationModal', () => {
  const React = require('react');
  const HomeScreenCustomizationModal = React.forwardRef(() => null);
  HomeScreenCustomizationModal.displayName = 'HomeScreenCustomizationModal';
  return {
    __esModule: true,
    default: HomeScreenCustomizationModal,
  };
});

jest.mock('@/src/components/ui/HeaderIconButton', () => {
  const React = require('react');
  return {
    HeaderIconButton: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
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

jest.mock('@/src/components/AddToListModal', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const AddToListModal = React.forwardRef(({ mediaItem }: any, ref: any) => {
    latestMediaItem = mediaItem;
    React.useImperativeHandle(ref, () => ({ present: mockPresent }));
    return React.createElement(Text, { testID: 'add-to-list-modal' }, mediaItem?.title || '');
  });
  AddToListModal.displayName = 'AddToListModal';
  return { __esModule: true, default: AddToListModal };
});

import HomeScreen from '@/app/(tabs)/home/index';

const trendingMovie = {
  id: 101,
  title: 'Trending Pick',
  original_title: 'Trending Pick',
  overview: 'Overview',
  poster_path: '/trend.jpg',
  backdrop_path: null,
  release_date: '2024-05-05',
  vote_average: 7.8,
  vote_count: 100,
  popularity: 80,
  genre_ids: [28, 12],
  video: false,
  adult: false,
  original_language: 'en',
};

describe('HomeScreen long press add-to-list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestMediaItem = null;
    mockAuthState.user = { uid: 'user-1', isAnonymous: false };
    mockAuthState.isGuest = false;
    mockPremiumState.isPremium = true;
    mockPreferencesState.homeScreenLists = [
      { id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' },
    ];
    mockPreferencesState.isLoading = false;
    mockPreferencesState.preferences = {
      homeScreenLists: [{ id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' }],
      showOriginalTitles: false,
      dataSaver: false,
    };
    mockListsState.data = [];
    mockListsState.isLoading = false;
    mockListsState.isError = false;
    mockContentFilterState.diagnostics = {
      allItemsRemovedByPreferences: false,
      removedByPreferences: false,
      removedByUnreleasedContent: false,
      removedByWatchedContent: false,
    };
    mockContentFilterState.filteredItems = null;
    mockTmdbPages = [
      {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [trendingMovie],
      },
    ];
  });

  it('opens AddToListModal for authenticated long press on a TMDB home card', async () => {
    const { getByText, getByTestId } = render(<HomeScreen />);

    fireEvent(getByText('Trending Pick'), 'longPress');

    await waitFor(() => {
      expect(getByTestId('add-to-list-modal')).toBeTruthy();
      expect(mockPresent).toHaveBeenCalledTimes(1);
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(latestMediaItem).toEqual({
      id: 101,
      media_type: 'movie',
      title: 'Trending Pick',
      name: undefined,
      poster_path: '/trend.jpg',
      vote_average: 7.8,
      release_date: '2024-05-05',
      first_air_date: undefined,
      genre_ids: [28, 12],
    });
  });

  it('opens AddToListModal for authenticated long press on a user list home card', async () => {
    mockPreferencesState.homeScreenLists = [{ id: 'watchlist', type: 'default', label: 'Watchlist' }];
    mockPreferencesState.preferences = {
      homeScreenLists: [{ id: 'watchlist', type: 'default', label: 'Watchlist' }],
      showOriginalTitles: false,
      dataSaver: false,
    };
    mockListsState.data = [
      {
        id: 'watchlist',
        name: 'Watchlist',
        items: {
          202: {
            id: 202,
            media_type: 'movie',
            title: 'Saved Movie',
            poster_path: '/saved.jpg',
            vote_average: 8.4,
            release_date: '2023-08-12',
            addedAt: 10,
            genre_ids: [35],
          },
        },
        createdAt: 1,
      },
    ];

    const { getByText, getByTestId } = render(<HomeScreen />);

    fireEvent(getByText('Saved Movie'), 'longPress');

    await waitFor(() => {
      expect(getByTestId('add-to-list-modal')).toBeTruthy();
      expect(mockPresent).toHaveBeenCalledTimes(1);
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(latestMediaItem).toEqual({
      id: 202,
      media_type: 'movie',
      title: 'Saved Movie',
      name: undefined,
      poster_path: '/saved.jpg',
      vote_average: 8.4,
      release_date: '2023-08-12',
      first_air_date: undefined,
      genre_ids: [35],
    });
  });

  it('filters stale deleted custom selections before rendering home sections', async () => {
    mockPreferencesState.homeScreenLists = [
      { id: 'deleted-custom', type: 'custom', label: 'Deleted Custom' },
      { id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' },
    ];
    mockPreferencesState.preferences = {
      homeScreenLists: [
        { id: 'deleted-custom', type: 'custom', label: 'Deleted Custom' },
        { id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' },
      ],
      showOriginalTitles: false,
      dataSaver: false,
    };

    const { getByText, queryByText } = render(<HomeScreen />);

    expect(getByText('Trending Pick')).toBeTruthy();
    expect(queryByText('Deleted Custom')).toBeNull();

    await waitFor(() => {
      expect(mockRepairHomeScreenLists).toHaveBeenCalledWith(
        [{ id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' }],
        expect.objectContaining({
          onError: expect.any(Function),
        })
      );
    });
  });

  it('shows a warning when preferences hide all items in a home TMDB section', () => {
    mockPreferencesState.homeScreenLists = [{ id: 'upcoming-tv', type: 'tmdb', label: 'Upcoming TV Shows' }];
    mockPreferencesState.preferences = {
      homeScreenLists: [{ id: 'upcoming-tv', type: 'tmdb', label: 'Upcoming TV Shows' }],
      hideUnreleasedContent: true,
      showOriginalTitles: false,
      dataSaver: false,
    };
    mockTmdbPages = [
      {
        page: 1,
        total_pages: 1,
        total_results: 1,
        results: [
          {
            id: 505,
            name: 'Future Show',
            original_name: 'Future Show',
            overview: 'Soon',
            poster_path: '/future.jpg',
            backdrop_path: null,
            first_air_date: '2026-12-01',
            vote_average: 7.2,
            vote_count: 12,
            popularity: 10,
            genre_ids: [18],
            original_language: 'en',
          },
        ],
      },
    ];
    mockContentFilterState.filteredItems = [];
    mockContentFilterState.diagnostics = {
      allItemsRemovedByPreferences: true,
      removedByPreferences: true,
      removedByUnreleasedContent: true,
      removedByWatchedContent: false,
    };

    const { getByText, queryByText } = render(<HomeScreen />);

    expect(getByText('home.contentHiddenByPreferences')).toBeTruthy();
    expect(queryByText('Future Show')).toBeNull();
  });

  it('shows an empty-state message when a home TMDB section has no results', () => {
    mockPreferencesState.homeScreenLists = [{ id: 'upcoming-tv', type: 'tmdb', label: 'Upcoming TV Shows' }];
    mockPreferencesState.preferences = {
      homeScreenLists: [{ id: 'upcoming-tv', type: 'tmdb', label: 'Upcoming TV Shows' }],
      showOriginalTitles: false,
      dataSaver: false,
    };
    mockTmdbPages = [
      {
        page: 1,
        total_pages: 1,
        total_results: 0,
        results: [],
      },
    ];
    mockContentFilterState.filteredItems = [];
    mockContentFilterState.diagnostics = {
      allItemsRemovedByPreferences: false,
      removedByPreferences: false,
      removedByUnreleasedContent: false,
      removedByWatchedContent: false,
    };

    const { getByText } = render(<HomeScreen />);

    expect(getByText('home.noContentAvailable')).toBeTruthy();
  });

  it('blocks unauthenticated long press from opening AddToListModal', async () => {
    mockAuthState.user = null;

    const { getByText, queryByTestId } = render(<HomeScreen />);

    fireEvent(getByText('Trending Pick'), 'longPress');

    expect(mockRequireAccount).toHaveBeenCalledTimes(1);
    expect(mockPresent).not.toHaveBeenCalled();
    expect(queryByTestId('add-to-list-modal')).toBeNull();
  });

  it('blocks guest long press from opening AddToListModal', async () => {
    mockAuthState.isGuest = true;

    const { getByText, queryByTestId } = render(<HomeScreen />);

    fireEvent(getByText('Trending Pick'), 'longPress');

    expect(mockRequireAccount).toHaveBeenCalledTimes(1);
    expect(mockPresent).not.toHaveBeenCalled();
    expect(queryByTestId('add-to-list-modal')).toBeNull();
  });
});
