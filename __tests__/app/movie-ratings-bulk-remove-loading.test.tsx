import { renderWithProviders } from '@/__tests__/utils/test-utils';
import MovieRatingsScreen from '@/app/(tabs)/library/ratings/movies';
import React from 'react';

const mockPush = jest.fn();
const mockUseEnrichedMovieRatings = jest.fn();
const mockUseRatingMultiSelectActions = jest.fn();
const mockUseRatingScreenLogic = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
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
      scrollToOffset: jest.fn(),
    }));

    if (!data || data.length === 0) {
      return React.createElement(View, { testID: 'flash-list-empty' }, ListEmptyComponent);
    }

    return React.createElement(
      View,
      { testID: 'flash-list' },
      data.map((item: any, index: number) =>
        React.createElement(View, { key: `${item.rating.id}-${index}` }, renderItem({ item, index }))
      )
    );
  });
  FlashList.displayName = 'FlashList';

  return { FlashList };
});

jest.mock('@/src/context/TabContext', () => ({
  useCurrentTab: () => 'library',
}));

jest.mock('@/src/hooks/useEnrichedRatings', () => ({
  useEnrichedMovieRatings: () => mockUseEnrichedMovieRatings(),
}));

jest.mock('@/src/hooks/useRatingMultiSelectActions', () => ({
  useRatingMultiSelectActions: (...args: any[]) => mockUseRatingMultiSelectActions(...args),
}));

jest.mock('@/src/hooks/useRatingScreenLogic', () => ({
  useRatingScreenLogic: (...args: any[]) => mockUseRatingScreenLogic(...args),
}));

jest.mock('@/src/hooks/useRatings', () => ({
  useDeleteRating: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    resolvePosterPath: (_mediaType: string, _id: number, posterPath: string | null) => posterPath,
  }),
}));

jest.mock('@/src/components/library/BulkRemoveProgressModal', () => ({
  BulkRemoveProgressModal: ({ visible, current, total }: any) => {
    const React = require('react');
    const { Text } = require('react-native');

    if (!visible) return null;

    return React.createElement(
      Text,
      { testID: 'bulk-remove-progress-modal' },
      `Removing ${current}/${total}`
    );
  },
}));

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'full-screen-loading' }, 'loading');
  },
}));

jest.mock('@/src/components/library/MovieRatingListCard', () => ({
  MovieRatingListCard: ({ item }: any) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: `movie-card-${item.rating.id}` }, item.movie.title);
  },
}));

jest.mock('@/src/components/library/LibrarySortModal', () => ({
  LibrarySortModal: () => null,
}));

jest.mock('@/src/components/library/MultiSelectActionBar', () => ({
  MultiSelectActionBar: () => null,
}));

jest.mock('@/src/components/library/EmptyState', () => ({
  EmptyState: () => null,
}));

jest.mock('@/src/components/library/QueryErrorState', () => ({
  QueryErrorState: () => null,
}));

jest.mock('@/src/components/library/RatingsEmptyState', () => ({
  RatingsEmptyState: () => null,
}));

jest.mock('@/src/components/ListActionsModal', () => {
  const React = require('react');
  const ListActionsModal = React.forwardRef(() => null);
  ListActionsModal.displayName = 'ListActionsModal';
  return {
    __esModule: true,
    default: ListActionsModal,
  };
});

jest.mock('@/src/components/ui/Toast', () => {
  const React = require('react');
  const Toast = React.forwardRef(() => null);
  Toast.displayName = 'Toast';
  return {
    __esModule: true,
    default: Toast,
  };
});

jest.mock('@/src/components/WatchStatusFiltersModal', () => () => null);
jest.mock('@/src/components/library/RatingBadge', () => ({
  RatingBadge: () => null,
}));
jest.mock('@/src/components/ui/AnimatedCheck', () => ({
  AnimatedCheck: () => null,
}));
jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));
jest.mock('@/src/components/MediaSortModal', () => ({
  RATING_SCREEN_SORT_OPTIONS: ['recentlyAdded'],
}));

describe('MovieRatingsScreen bulk remove loading state', () => {
  const refetch = jest.fn();

  const movieOne = {
    rating: { id: '1', mediaType: 'movie', rating: 9, ratedAt: 200 },
    movie: {
      id: 1,
      title: 'Movie One',
      poster_path: '/one.jpg',
      release_date: '2024-01-01',
      vote_average: 7.5,
    },
  };

  const movieTwo = {
    rating: { id: '2', mediaType: 'movie', rating: 8, ratedAt: 100 },
    movie: {
      id: 2,
      title: 'Movie Two',
      poster_path: '/two.jpg',
      release_date: '2023-01-01',
      vote_average: 8.1,
    },
  };

  let enrichedState: {
    data: typeof movieOne[];
    isLoading: boolean;
    error: Error | null;
    refetch: typeof refetch;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    enrichedState = {
      data: [movieOne, movieTwo],
      isLoading: false,
      error: null,
      refetch,
    };

    mockUseEnrichedMovieRatings.mockImplementation(() => enrichedState);

    mockUseRatingMultiSelectActions.mockReturnValue({
      handleItemPress: jest.fn(),
      handleLongPress: jest.fn(),
      selectedCount: 0,
      isSelectionMode: false,
      isItemSelected: jest.fn(() => false),
      clearSelection: jest.fn(),
      selectionContentBottomPadding: 0,
      handleActionBarHeightChange: jest.fn(),
      handleRemoveSelectedItems: jest.fn(),
      bulkRemoveProgress: { processed: 1, total: 2 },
      isBulkRemoving: true,
    });

    mockUseRatingScreenLogic.mockImplementation(({ data }: any) => ({
      sortState: { option: 'recentlyAdded', direction: 'desc' },
      filterState: {},
      sortModalVisible: false,
      filterModalVisible: false,
      hasActiveFilterState: false,
      viewMode: 'list',
      isLoadingPreference: false,
      listRef: { current: null },
      listActionsModalRef: { current: null },
      setSortModalVisible: jest.fn(),
      setFilterModalVisible: jest.fn(),
      setFilterState: jest.fn(),
      handleApplySort: jest.fn(),
      listActions: [],
      sortedData: data ?? [],
      genreMap: {},
    }));
  });

  it('keeps the progress modal visible and does not render the full-screen loader while ratings shrink', () => {
    const screen = renderWithProviders(<MovieRatingsScreen />);

    expect(screen.getByTestId('bulk-remove-progress-modal')).toBeTruthy();
    expect(screen.queryByTestId('full-screen-loading')).toBeNull();
    expect(screen.getByText('Movie One')).toBeTruthy();
    expect(screen.getByText('Movie Two')).toBeTruthy();

    enrichedState = {
      ...enrichedState,
      data: [movieTwo],
      isLoading: false,
    };

    screen.rerender(<MovieRatingsScreen />);

    expect(screen.getByTestId('bulk-remove-progress-modal')).toBeTruthy();
    expect(screen.queryByTestId('full-screen-loading')).toBeNull();
    expect(screen.queryByText('Movie One')).toBeNull();
    expect(screen.getByText('Movie Two')).toBeTruthy();
  });
});
