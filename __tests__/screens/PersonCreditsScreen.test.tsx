import PersonCreditsScreen from '@/src/screens/PersonCreditsScreen';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockSetOptions = jest.fn();
const mockUseQuery = jest.fn();
const mockGetListsForMedia = jest.fn();
const mockRequireAccount = jest.fn();
const mockPresent = jest.fn();
const mockImpactAsync = jest.fn();

let mockViewMode: 'list' | 'grid' = 'list';
let mockShowIndicators = true;
let latestAddToListModalOnDismiss: (() => void) | null = null;
let mockSearchParams: {
  id: string;
  name: string;
  mediaType: 'movie' | 'tv';
  creditType: 'cast' | 'crew';
} = {
  id: '99',
  name: 'Test Person',
  mediaType: 'movie',
  creditType: 'cast',
};

const mockMovieCredit = {
  id: 101,
  title: 'Known Movie',
  original_title: 'Known Movie',
  overview: 'Movie overview',
  poster_path: '/movie.jpg',
  backdrop_path: null,
  release_date: '2024-01-01',
  vote_average: 8.4,
  vote_count: 1200,
  popularity: 250,
  genre_ids: [18],
  video: false,
  adult: false,
  original_language: 'en',
  character: 'Lead',
};

const mockTVCredit = {
  id: 202,
  name: 'Known TV Show',
  original_name: 'Known TV Show',
  overview: 'TV overview',
  poster_path: '/tv.jpg',
  backdrop_path: null,
  first_air_date: '2023-01-01',
  vote_average: 7.9,
  vote_count: 900,
  popularity: 180,
  genre_ids: [18],
  original_language: 'en',
  character: 'Host',
};

const mockDirectedMovieCredit = {
  ...mockMovieCredit,
  id: 303,
  title: 'Directed Movie',
  original_title: 'Directed Movie',
  popularity: 320,
  job: 'Director',
  department: 'Directing',
};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockSearchParams,
  useNavigation: () => ({
    setOptions: mockSetOptions,
  }),
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: (args: any) => mockUseQuery(args),
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    FlashList: ({ data, renderItem, keyExtractor, ListFooterComponent }: any) =>
      React.createElement(
        View,
        null,
        data.map((item: any, index: number) =>
          React.createElement(
            React.Fragment,
            { key: keyExtractor ? keyExtractor(item, index) : `${index}` },
            renderItem({ item, index })
          )
        ),
        ListFooterComponent ?? null
      ),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = () => React.createElement(View, null);

  return {
    Film: Icon,
    SlidersHorizontal: Icon,
    Star: Icon,
    Tv: Icon,
  };
});

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Medium: 'medium',
  },
  impactAsync: (...args: any[]) => mockImpactAsync(...args),
}));

jest.mock('@/src/components/AddToListModal', () => {
  const React = require('react');
  const { Text } = require('react-native');

  const AddToListModal = React.forwardRef(({ mediaItem, onDismiss }: any, ref: any) => {
    latestAddToListModalOnDismiss = onDismiss ?? null;
    React.useImperativeHandle(ref, () => ({
      present: mockPresent,
      dismiss: jest.fn(),
    }));
    return React.createElement(Text, { testID: 'add-to-list-modal' }, mediaItem?.media_type || '');
  });

  AddToListModal.displayName = 'AddToListModal';
  return { __esModule: true, default: AddToListModal };
});

jest.mock('@/src/components/ListActionsModal', () => {
  const React = require('react');
  const ListActionsModal = React.forwardRef(() => null);

  return {
    __esModule: true,
    default: ListActionsModal,
    ListActionsIcon: () => null,
  };
});

jest.mock('@/src/components/library/LibrarySortModal', () => ({
  LibrarySortModal: () => null,
}));

jest.mock('@/src/components/ui/AppErrorState', () => () => null);
jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));
jest.mock('@/src/components/ui/ListMembershipBadge', () => ({
  ListMembershipBadge: () => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { testID: 'list-membership-badge' });
  },
}));
jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { testID: 'media-image' });
  },
}));
jest.mock('@/src/components/WatchStatusFiltersModal', () => () => null);

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('@/src/context/TabContext', () => ({
  useCurrentTab: () => 'discover',
}));

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockRequireAccount,
}));

jest.mock('@/src/hooks/useGenres', () => ({
  useAllGenres: () => ({ data: {} }),
}));

jest.mock('@/src/hooks/useListMembership', () => ({
  useListMembership: () => ({
    getListsForMedia: mockGetListsForMedia,
    showIndicators: mockShowIndicators,
  }),
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    resolvePosterPath: (_mediaType: 'movie' | 'tv', _mediaId: number, posterPath: string | null) =>
      posterPath,
  }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: {
      showOriginalTitles: false,
    },
  }),
}));

jest.mock('@/src/hooks/useViewModeToggle', () => ({
  useViewModeToggle: () => ({
    viewMode: mockViewMode,
    isLoadingPreference: false,
  }),
}));

jest.mock('@/src/utils/listActions', () => ({
  createSortAction: ({ onPress, showBadge }: { onPress: () => void; showBadge: boolean }) => ({
    id: 'sort',
    label: 'Sort',
    onPress,
    showBadge,
  }),
}));

const setupCreditsQuery = (
  creditsData:
    | { cast: (typeof mockMovieCredit)[]; crew: (typeof mockDirectedMovieCredit)[] }
    | {
        cast: (typeof mockTVCredit)[];
        crew: Array<typeof mockTVCredit & { job: string; department: string }>;
      }
    | undefined = undefined
) => {
  mockUseQuery.mockImplementation(() => ({
    data:
      creditsData ??
      (mockSearchParams.mediaType === 'tv'
        ? { cast: [mockTVCredit], crew: [] }
        : { cast: [mockMovieCredit], crew: [] }),
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }));
};

describe('PersonCreditsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockViewMode = 'list';
    mockShowIndicators = true;
    latestAddToListModalOnDismiss = null;
    mockRequireAccount.mockReturnValue(false);
    mockSearchParams = {
      id: '99',
      name: 'Test Person',
      mediaType: 'movie',
      creditType: 'cast',
    };
    setupCreditsQuery();
  });

  it('shows list indicators in list mode when membership exists', () => {
    mockGetListsForMedia.mockReturnValue(['watchlist']);

    const { getAllByTestId } = render(<PersonCreditsScreen />);

    expect(getAllByTestId('list-membership-badge')).toHaveLength(1);
  });

  it('shows list indicators in grid mode when membership exists', () => {
    mockViewMode = 'grid';
    mockSearchParams = {
      ...mockSearchParams,
      mediaType: 'tv',
    };
    setupCreditsQuery();
    mockGetListsForMedia.mockReturnValue(['favorites']);

    const { getAllByTestId } = render(<PersonCreditsScreen />);

    expect(getAllByTestId('list-membership-badge')).toHaveLength(1);
  });

  it('does not show list indicators when membership is empty', () => {
    mockGetListsForMedia.mockReturnValue([]);

    const { queryAllByTestId } = render(<PersonCreditsScreen />);

    expect(queryAllByTestId('list-membership-badge')).toHaveLength(0);
  });

  it('does not show list indicators when the preference is disabled', () => {
    mockShowIndicators = false;
    mockGetListsForMedia.mockReturnValue(['watchlist']);

    const { queryAllByTestId } = render(<PersonCreditsScreen />);

    expect(queryAllByTestId('list-membership-badge')).toHaveLength(0);
    expect(mockGetListsForMedia).not.toHaveBeenCalled();
  });

  it('shows exhaustive directed/written movie credits and sets the directed section title', () => {
    mockSearchParams = {
      ...mockSearchParams,
      creditType: 'crew',
    };

    const directedMovies = Array.from({ length: 12 }, (_, index) => ({
      ...mockDirectedMovieCredit,
      id: 500 + index,
      title: `Directed Movie ${index}`,
      original_title: `Directed Movie ${index}`,
    }));

    setupCreditsQuery({
      cast: [mockMovieCredit],
      crew: directedMovies,
    });

    const { getByText, queryByText } = render(<PersonCreditsScreen />);

    expect(mockSetOptions).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test Person - person.directedWrittenMovies' })
    );
    expect(getByText('Directed Movie 0')).toBeTruthy();
    expect(getByText('Directed Movie 11')).toBeTruthy();
    expect(queryByText('Known Movie')).toBeNull();
  });

  it('shows acting movie credits only and sets the acting section title for cast credits', () => {
    setupCreditsQuery({
      cast: [mockMovieCredit],
      crew: [mockDirectedMovieCredit],
    });

    const { getByText, queryByText } = render(<PersonCreditsScreen />);

    expect(mockSetOptions).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test Person - person.actingMovies' })
    );
    expect(getByText('Known Movie')).toBeTruthy();
    expect(queryByText('Directed Movie')).toBeNull();
  });

  it('opens AddToListModal for authenticated long press in list mode', async () => {
    const { getByText, getByTestId } = render(<PersonCreditsScreen />);

    fireEvent(getByText('Known Movie'), 'longPress');

    await waitFor(() => {
      expect(getByTestId('add-to-list-modal')).toBeTruthy();
    });

    expect(getByTestId('add-to-list-modal').props.children).toBe('movie');
    expect(mockPresent).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens AddToListModal for authenticated long press in grid mode without navigating', async () => {
    mockViewMode = 'grid';
    mockSearchParams = {
      ...mockSearchParams,
      mediaType: 'tv',
    };
    setupCreditsQuery();

    const { getByText, getByTestId } = render(<PersonCreditsScreen />);

    fireEvent(getByText('Known TV Show'), 'longPress');

    await waitFor(() => {
      expect(getByTestId('add-to-list-modal')).toBeTruthy();
    });

    expect(getByTestId('add-to-list-modal').props.children).toBe('tv');
    expect(mockPresent).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('clears selected media when AddToListModal is dismissed', async () => {
    const { getByText, getByTestId, queryByTestId } = render(<PersonCreditsScreen />);

    fireEvent(getByText('Known Movie'), 'longPress');

    await waitFor(() => {
      expect(getByTestId('add-to-list-modal')).toBeTruthy();
    });
    expect(latestAddToListModalOnDismiss).toBeDefined();

    act(() => {
      latestAddToListModalOnDismiss?.();
    });

    await waitFor(() => {
      expect(queryByTestId('add-to-list-modal')).toBeNull();
    });
  });

  it('blocks signed-out long press from opening AddToListModal', () => {
    mockRequireAccount.mockReturnValue(true);

    const { getByText, queryByTestId } = render(<PersonCreditsScreen />);

    fireEvent(getByText('Known Movie'), 'longPress');

    expect(mockRequireAccount).toHaveBeenCalledTimes(1);
    expect(mockPresent).not.toHaveBeenCalled();
    expect(queryByTestId('add-to-list-modal')).toBeNull();
  });

  it('blocks guest long press from opening AddToListModal', () => {
    mockViewMode = 'grid';
    mockSearchParams = {
      ...mockSearchParams,
      mediaType: 'tv',
    };
    setupCreditsQuery();
    mockRequireAccount.mockReturnValue(true);

    const { getByText, queryByTestId } = render(<PersonCreditsScreen />);

    fireEvent(getByText('Known TV Show'), 'longPress');

    expect(mockRequireAccount).toHaveBeenCalledTimes(1);
    expect(mockPresent).not.toHaveBeenCalled();
    expect(queryByTestId('add-to-list-modal')).toBeNull();
  });
});
