import WatchStatusDetailScreen from '@/app/(tabs)/library/watch-status/[id]';
import { act, render } from '@testing-library/react-native';
import React from 'react';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockRefetch = jest.fn();
const mockRemoveMutateAsync = jest.fn();
const mockUseHeaderSearch = jest.fn();
const mockUseLists = jest.fn();
const mockFilterMediaItems = jest.fn();
const mockHasActiveFilters = jest.fn();

let mockViewMode: 'grid' | 'list' = 'grid';
let capturedMediaGridProps: any = null;
let capturedFlashListProps: any = null;

const baseItem = {
  id: 202,
  title: 'Watchlist Movie',
  media_type: 'movie' as const,
  vote_average: 7.4,
  release_date: '2023-03-03',
  poster_path: '/watchlist.jpg',
  addedAt: 5,
};

const watchlist = {
  id: 'watchlist',
  name: 'Should Watch',
  items: { 202: baseItem },
  createdAt: 1,
  updatedAt: 2,
};

jest.mock('expo-router', () => ({
  Stack: {
    Screen: () => null,
  },
  useLocalSearchParams: () => ({ id: 'watchlist' }),
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (key === 'library.watchStatusEmptyDescription') {
        return `${key}:${options?.listName ?? ''}`;
      }
      return key;
    },
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

jest.mock('@/src/hooks/useLists', () => ({
  useLists: () => mockUseLists(),
  useRemoveFromList: () => ({
    isPending: false,
    mutateAsync: (...args: unknown[]) => mockRemoveMutateAsync(...args),
  }),
}));

jest.mock('@/src/hooks/useHeaderSearch', () => ({
  useHeaderSearch: (...args: unknown[]) => mockUseHeaderSearch(...args),
}));

jest.mock('@/src/hooks/useGenres', () => ({
  useAllGenres: () => ({ data: {} }),
}));

jest.mock('@/src/hooks/useMediaGridHandlers', () => ({
  useMediaGridHandlers: () => ({
    handleItemPress: jest.fn(),
    handleLongPress: jest.fn(),
    handleShowToast: jest.fn(),
    addToListModalRef: { current: null },
    selectedMediaItems: [],
    selectedCount: 0,
    isSelectionMode: false,
    isItemSelected: jest.fn(() => false),
    clearSelection: jest.fn(),
    toastRef: { current: null },
  }),
}));

jest.mock('@/src/hooks/useListDetailMultiSelectActions', () => ({
  useListDetailMultiSelectActions: () => ({
    bulkAddMode: 'copy',
    bulkPrimaryLabel: 'Add',
    selectionContentBottomPadding: 0,
    handleActionBarHeightChange: jest.fn(),
    handleRemoveSelectedItems: jest.fn(),
    bulkRemoveProgress: null,
    isBulkRemoving: false,
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

jest.mock('@/src/utils/listFilters', () => ({
  DEFAULT_WATCH_STATUS_FILTERS: {},
  filterMediaItems: (...args: unknown[]) => mockFilterMediaItems(...args),
  hasActiveFilters: (...args: unknown[]) => mockHasActiveFilters(...args),
}));

jest.mock('@/src/components/library/MediaGrid', () => ({
  MediaGrid: (props: any) => {
    const React = require('react');
    const { View } = require('react-native');

    capturedMediaGridProps = props;

    return React.createElement(View, { testID: 'media-grid' });
  },
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: (props: any) => {
    const React = require('react');
    const { View } = require('react-native');

    capturedFlashListProps = props;

    return React.createElement(
      View,
      { testID: 'flash-list' },
      (!props.data || props.data.length === 0) && props.ListEmptyComponent ? props.ListEmptyComponent : null
    );
  },
}));

jest.mock('@/src/components/library/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'empty-state-title' }, title);
  },
}));

jest.mock('@/src/components/library/SearchEmptyState', () => ({
  SearchEmptyState: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'search-empty-state' }, 'search-empty');
  },
}));

jest.mock('@/src/components/AddToListModal', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(() => null),
  };
});

jest.mock('@/src/components/ListActionsModal', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(() => null),
    ListActionsIcon: () => null,
  };
});

jest.mock('@/src/components/ShuffleModal', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/src/components/library/BulkRemoveProgressModal', () => ({
  BulkRemoveProgressModal: () => null,
}));
jest.mock('@/src/components/MediaSortModal', () => ({
  DEFAULT_SORT_STATE: {
    option: 'recentlyAdded',
    direction: 'desc',
  },
}));
jest.mock('@/src/components/library/LibrarySortModal', () => ({
  LibrarySortModal: () => null,
}));
jest.mock('@/src/components/library/MediaListCard', () => ({
  MediaListCard: () => null,
}));
jest.mock('@/src/components/library/MultiSelectActionBar', () => ({
  MultiSelectActionBar: () => null,
}));
jest.mock('@/src/components/library/QueryErrorState', () => ({
  QueryErrorState: () => null,
}));
jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));
jest.mock('@/src/components/ui/Toast', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(() => null),
  };
});
jest.mock('@/src/components/WatchStatusFiltersModal', () => ({
  __esModule: true,
  default: () => null,
}));

describe('WatchStatusDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedMediaGridProps = null;
    capturedFlashListProps = null;
    mockViewMode = 'grid';
    mockRefetch.mockReset().mockResolvedValue(undefined);
    mockRemoveMutateAsync.mockReset().mockResolvedValue(undefined);
    mockFilterMediaItems.mockImplementation((items) => items);
    mockHasActiveFilters.mockReturnValue(false);
    mockUseLists.mockReturnValue({
      data: [watchlist],
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    });
    mockUseHeaderSearch.mockReturnValue({
      searchQuery: '',
      isSearchActive: false,
      filteredItems: [baseItem],
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: false },
    });
  });

  it('forwards refresh props to MediaGrid in grid mode and preserves the default watch-status empty state', async () => {
    mockFilterMediaItems.mockReturnValue([]);
    mockUseHeaderSearch.mockReturnValue({
      searchQuery: '',
      isSearchActive: false,
      filteredItems: [],
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: false },
    });

    render(<WatchStatusDetailScreen />);

    expect(capturedMediaGridProps).toBeTruthy();
    expect(capturedMediaGridProps.refreshing).toBe(false);
    expect(capturedMediaGridProps.emptyState.title).toBe('library.emptyList');
    expect(capturedMediaGridProps.emptyState.description).toBe(
      'library.watchStatusEmptyDescription:lists.shouldWatch'
    );

    await act(async () => {
      await capturedMediaGridProps.onRefresh();
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('prefers the filter empty state in grid mode when filters are active', () => {
    mockFilterMediaItems.mockReturnValue([]);
    mockHasActiveFilters.mockReturnValue(true);
    mockUseHeaderSearch.mockReturnValue({
      searchQuery: '',
      isSearchActive: false,
      filteredItems: [],
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: true },
    });

    render(<WatchStatusDetailScreen />);

    expect(capturedMediaGridProps.emptyState.title).toBe('discover.noResultsWithFilters');
  });

  it('wires FlashList refresh in list mode and keeps the search empty state', async () => {
    mockViewMode = 'list';
    mockUseHeaderSearch.mockReturnValue({
      searchQuery: 'missing',
      isSearchActive: true,
      filteredItems: [],
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: false },
    });

    const { getByTestId } = render(<WatchStatusDetailScreen />);

    expect(getByTestId('search-empty-state')).toBeTruthy();
    expect(capturedFlashListProps).toBeTruthy();
    expect(capturedFlashListProps.refreshing).toBe(false);

    await act(async () => {
      await capturedFlashListProps.onRefresh();
    });

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
