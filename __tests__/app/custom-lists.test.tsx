import React from 'react';
import { render } from '@testing-library/react-native';

const mockSetOptions = jest.fn();
const mockPush = jest.fn();

const mockUseLists = jest.fn();
const mockUsePremium = jest.fn();
const mockUseHeaderSearch = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useNavigation: () => ({ setOptions: mockSetOptions }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockUsePremium(),
}));

jest.mock('@/src/hooks/useLists', () => ({
  useLists: () => mockUseLists(),
}));

jest.mock('@/src/hooks/useHeaderSearch', () => ({
  useHeaderSearch: (...args: unknown[]) => mockUseHeaderSearch(...args),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));

jest.mock('@/src/components/CreateListModal', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(() => null),
  };
});

jest.mock('@/src/components/library/LibrarySortModal', () => ({
  LibrarySortModal: () => null,
}));

jest.mock('@/src/components/MediaSortModal', () => ({
  DEFAULT_SORT_STATE: {
    option: 'recentlyAdded',
    direction: 'desc',
  },
}));

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));

jest.mock('@/src/components/library/QueryErrorState', () => ({
  QueryErrorState: () => null,
}));

jest.mock('@/src/components/library/StackedPosterPreview', () => ({
  StackedPosterPreview: () => null,
}));

jest.mock('@/src/components/library/SearchEmptyState', () => ({
  SearchEmptyState: () => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'search-empty-state' }, 'search-empty');
  },
}));

jest.mock('@/src/components/library/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, { testID: 'empty-state-title' }, title);
  },
}));

jest.mock('@/src/components/ui/HeaderIconButton', () => ({
  HeaderIconButton: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/styles/iconBadgeStyles', () => ({
  useIconBadgeStyles: () => ({ wrapper: {}, badge: {} }),
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: ({ data, renderItem, ListEmptyComponent }: any) => {
    const React = require('react');
    const { View } = require('react-native');

    if (!data || data.length === 0) {
      return React.createElement(View, { testID: 'flash-list-empty' }, ListEmptyComponent);
    }

    return React.createElement(
      View,
      { testID: 'flash-list' },
      data.map((item: any, index: number) =>
        React.createElement(View, { key: `${item.id}-${index}` }, renderItem({ item, index }))
      )
    );
  },
}));

import CustomListsScreen from '@/app/(tabs)/library/custom-lists';

const customListsData = [
  {
    id: 'list-1',
    name: 'Sci-Fi Queue',
    description: 'Future worlds',
    items: {},
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'list-2',
    name: 'Comedy Night',
    description: 'Funny picks',
    items: {},
    createdAt: 2,
    updatedAt: 2,
  },
];

describe('CustomListsScreen search', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUsePremium.mockReturnValue({
      isPremium: true,
      isLoading: false,
    });

    mockUseLists.mockReturnValue({
      data: customListsData,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseHeaderSearch.mockReturnValue({
      searchQuery: '',
      isSearchActive: false,
      filteredItems: customListsData,
      activateSearch: jest.fn(),
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: false },
    });
  });

  it('renders all custom lists when search query is empty', () => {
    const { getByText } = render(<CustomListsScreen />);

    expect(getByText('Sci-Fi Queue')).toBeTruthy();
    expect(getByText('Comedy Night')).toBeTruthy();
  });

  it('renders filtered custom lists from useHeaderSearch results', () => {
    mockUseHeaderSearch.mockReturnValue({
      searchQuery: 'comedy',
      isSearchActive: true,
      filteredItems: [customListsData[1]],
      activateSearch: jest.fn(),
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: true },
    });

    const { queryByText, getByText } = render(<CustomListsScreen />);

    expect(getByText('Comedy Night')).toBeTruthy();
    expect(queryByText('Sci-Fi Queue')).toBeNull();
  });

  it('shows SearchEmptyState when searchQuery exists and filtered results are empty', () => {
    mockUseHeaderSearch.mockReturnValue({
      searchQuery: 'missing',
      isSearchActive: true,
      filteredItems: [],
      activateSearch: jest.fn(),
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: true },
    });

    const { getByTestId } = render(<CustomListsScreen />);

    expect(getByTestId('search-empty-state')).toBeTruthy();
  });

  it('keeps EmptyState for truly empty custom list data (not search state)', () => {
    mockUseLists.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseHeaderSearch.mockReturnValue({
      searchQuery: 'anything',
      isSearchActive: true,
      filteredItems: [],
      activateSearch: jest.fn(),
      deactivateSearch: jest.fn(),
      setSearchQuery: jest.fn(),
      searchButton: { onPress: jest.fn(), showBadge: true },
    });

    const { getByTestId, queryByTestId } = render(<CustomListsScreen />);

    expect(getByTestId('empty-state-title')).toBeTruthy();
    expect(queryByTestId('search-empty-state')).toBeNull();
  });
});
