import { fireEvent, renderWithProviders } from '@/__tests__/utils/test-utils';
import TVShowRatingsScreen from '@/app/(tabs)/library/ratings/tv-shows';
import * as Haptics from 'expo-haptics';
import React from 'react';

const mockPush = jest.fn();
const mockUseEnrichedTVRatings = jest.fn();
const mockUseRatingScreenLogic = jest.fn();
const mockCurrentTab = { value: 'library' as string | null | undefined };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
  },
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

jest.mock('@/src/context/AccentColorProvider', () => ({
  AccentColorProvider: ({ children }: { children: React.ReactNode }) => children,
  useAccentColor: () => ({
    accentColor: '#ff5500',
  }),
}));

jest.mock('@/src/i18n', () => ({
  __esModule: true,
  default: {
    language: 'en-US',
  },
}));

jest.mock('@/src/context/TabContext', () => ({
  useCurrentTab: () => mockCurrentTab.value,
}));

jest.mock('@/src/hooks/useHeaderSearch', () => ({
  useHeaderSearch: () => ({
    searchQuery: '',
    isSearchActive: false,
    deactivateSearch: jest.fn(),
    setSearchQuery: jest.fn(),
    searchButton: null,
  }),
}));

jest.mock('@/src/hooks/useEnrichedRatings', () => ({
  useEnrichedTVRatings: () => mockUseEnrichedTVRatings(),
}));

jest.mock('@/src/hooks/useRatingMultiSelectActions', () => ({
  useRatingMultiSelectActions: ({ onNavigate }: any) => ({
    handleItemPress: onNavigate,
    handleLongPress: jest.fn(),
    selectedCount: 0,
    isSelectionMode: false,
    isItemSelected: jest.fn(() => false),
    clearSelection: jest.fn(),
    selectionContentBottomPadding: 0,
    handleActionBarHeightChange: jest.fn(),
    handleRemoveSelectedItems: jest.fn(),
    bulkRemoveProgress: null,
    isBulkRemoving: false,
  }),
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
  BulkRemoveProgressModal: () => null,
}));

jest.mock('@/src/components/library/EmptyState', () => ({
  EmptyState: () => null,
}));

jest.mock('@/src/components/library/LibrarySortModal', () => ({
  LibrarySortModal: () => null,
}));

jest.mock('@/src/components/library/MultiSelectActionBar', () => ({
  MultiSelectActionBar: () => null,
}));

jest.mock('@/src/components/library/QueryErrorState', () => ({
  QueryErrorState: () => null,
}));

jest.mock('@/src/components/library/RatingBadge', () => ({
  RatingBadge: () => null,
}));

jest.mock('@/src/components/library/RatingsEmptyState', () => ({
  RatingsEmptyState: () => null,
}));

jest.mock('@/src/components/library/TVShowRatingListCard', () => ({
  TVShowRatingListCard: () => null,
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

jest.mock('@/src/components/MediaSortModal', () => ({
  RATING_SCREEN_SORT_OPTIONS: ['recentlyAdded'],
}));

jest.mock('@/src/components/ui/AnimatedCheck', () => ({
  AnimatedCheck: () => null,
}));

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));

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

describe('TVShowRatingsScreen', () => {
  const refetch = jest.fn();

  const validRating = {
    rating: { id: '1', mediaType: 'tv', rating: 9, ratedAt: 200 },
    tvShow: {
      id: 101,
      name: 'Valid Show',
      poster_path: '/valid.jpg',
      first_air_date: '2020-01-15',
      vote_average: 8.4,
    },
  };

  const invalidDateRating = {
    rating: { id: '2', mediaType: 'tv', rating: 7, ratedAt: 100 },
    tvShow: {
      id: 202,
      name: 'Broken Date Show',
      poster_path: '/broken.jpg',
      first_air_date: 'invalid-date',
      vote_average: 0,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentTab.value = 'library';

    mockUseEnrichedTVRatings.mockReturnValue({
      data: [validRating, invalidDateRating],
      isLoading: false,
      error: null,
      refetch,
    });

    mockUseRatingScreenLogic.mockImplementation(({ data }: any) => ({
      sortState: { option: 'recentlyAdded', direction: 'desc' },
      filterState: {},
      sortModalVisible: false,
      filterModalVisible: false,
      hasActiveFilterState: false,
      viewMode: 'grid',
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

  it('navigates to the TV detail route when the current tab is available', () => {
    const screen = renderWithProviders(<TVShowRatingsScreen />);

    fireEvent.press(screen.getByText('Valid Show'));

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/library/tv/101');
  });

  it('warns and skips navigation when the current tab is missing', () => {
    mockCurrentTab.value = null;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const screen = renderWithProviders(<TVShowRatingsScreen />);

    fireEvent.press(screen.getByText('Valid Show'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith('Cannot navigate to tv show: currentTab is null');

    warnSpy.mockRestore();
  });

  it('renders parsed first air years and suppresses invalid TMDB dates', () => {
    const screen = renderWithProviders(<TVShowRatingsScreen />);

    expect(screen.getByText('Valid Show')).toBeTruthy();
    expect(screen.getByText('2020')).toBeTruthy();
    expect(screen.getByText('Broken Date Show')).toBeTruthy();
    expect(screen.queryByText('NaN')).toBeNull();
  });
});
