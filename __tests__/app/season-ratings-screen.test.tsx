import { act, fireEvent, renderWithProviders, waitFor } from '@/__tests__/utils/test-utils';
import SeasonRatingsScreen from '@/app/(tabs)/library/ratings/seasons';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import React from 'react';

const mockPush = jest.fn();
const mockSetOptions = jest.fn();
const mockDeleteSeasonRatingMutateAsync = jest.fn();
let mockStoredViewMode: 'flat' | 'grouped' | null = 'flat';
const mockCurrentTab = { value: 'library' as string | null | undefined };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useNavigation: () => ({
    setOptions: mockSetOptions,
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(mockStoredViewMode)),
  setItem: jest.fn(() => Promise.resolve()),
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
        React.createElement(View, { key: `${item.id}-${index}` }, renderItem({ item, index }))
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

jest.mock('@/src/context/TabContext', () => ({
  useCurrentTab: () => mockCurrentTab.value,
}));

jest.mock('@/src/hooks/useHeaderSearch', () => ({
  useHeaderSearch: ({ items }: { items: any[] }) => ({
    searchQuery: '',
    isSearchActive: false,
    deactivateSearch: jest.fn(),
    setSearchQuery: jest.fn(),
    searchButton: { onPress: jest.fn() },
    filteredItems: items,
  }),
}));

const mockSeasonRatings = [
  {
    id: 'season-101-1',
    mediaType: 'season' as const,
    rating: 9,
    ratedAt: 200,
    title: 'Season 1',
    tvShowId: 101,
    seasonNumber: 1,
    tvShowName: 'Alpha Show',
    posterPath: '/alpha.jpg',
  },
  {
    id: 'season-202-2',
    mediaType: 'season' as const,
    rating: 8,
    ratedAt: 100,
    title: 'Season 2',
    tvShowId: 202,
    seasonNumber: 2,
    tvShowName: 'Beta Show',
    posterPath: '/beta.jpg',
  },
];

jest.mock('@/src/hooks/useRatings', () => ({
  useRatings: () => ({
    data: mockSeasonRatings,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useDeleteSeasonRating: () => ({
    mutateAsync: mockDeleteSeasonRatingMutateAsync,
    isPending: false,
  }),
}));

jest.mock('@/src/components/library/SeasonRatingCard', () => ({
  SeasonRatingCard: ({
    rating,
    onPress,
    onLongPress,
  }: {
    rating: { id: string; tvShowName: string; title: string };
    onPress: (rating: any) => void;
    onLongPress: (rating: any) => void;
  }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable
        testID={`season-card-${rating.id}`}
        onPress={() => onPress(rating)}
        onLongPress={() => onLongPress(rating)}
      >
        <Text>{rating.tvShowName}</Text>
        <Text>{rating.title}</Text>
      </Pressable>
    );
  },
}));

jest.mock('@/src/components/library/BulkRemoveProgressModal', () => ({
  BulkRemoveProgressModal: () => null,
}));

jest.mock('@/src/components/library/EmptyState', () => ({
  EmptyState: () => null,
}));

jest.mock('@/src/components/library/MultiSelectActionBar', () => ({
  MultiSelectActionBar: ({
    onCancel,
    onRemoveItems,
  }: {
    onCancel: () => void;
    onRemoveItems: () => void;
  }) => {
    const { Pressable, Text, View } = require('react-native');
    return (
      <View testID="season-ratings-action-bar">
        <Pressable testID="actionbar-cancel" onPress={onCancel}>
          <Text>Cancel</Text>
        </Pressable>
        <Pressable testID="actionbar-remove" onPress={onRemoveItems}>
          <Text>Remove</Text>
        </Pressable>
      </View>
    );
  },
}));

jest.mock('@/src/components/library/QueryErrorState', () => ({
  QueryErrorState: () => null,
}));

jest.mock('@/src/components/library/SearchEmptyState', () => ({
  SearchEmptyState: () => null,
}));

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));

jest.mock('@/src/components/ui/HeaderIconButton', () => ({
  HeaderIconButton: ({ children }: { children: React.ReactNode }) => children,
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

describe('SeasonRatingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStoredViewMode = 'flat';
    mockCurrentTab.value = 'library';
    mockDeleteSeasonRatingMutateAsync.mockResolvedValue(undefined);
  });

  it('navigates to the expanded season route from the recent list view', async () => {
    const screen = renderWithProviders(<SeasonRatingsScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('season-card-season-101-1')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('season-card-season-101-1'));

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/library/tv/101/seasons?season=1');
  });

  it('supports grouped-by-show tabs', async () => {
    mockStoredViewMode = 'grouped';
    const screen = renderWithProviders(<SeasonRatingsScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('season-ratings-category-tabs')).toBeTruthy();
    });

    expect(screen.getByTestId('season-card-season-101-1')).toBeTruthy();
    expect(screen.getByTestId('season-card-season-202-2')).toBeTruthy();

    fireEvent.press(screen.getByTestId('season-ratings-category-tabs-tab-show-202'));

    await waitFor(() => {
      expect(screen.queryByTestId('season-card-season-101-1')).toBeNull();
      expect(screen.getByTestId('season-card-season-202-2')).toBeTruthy();
    });
  });

  it('supports bulk removal from the season ratings list', async () => {
    const screen = renderWithProviders(<SeasonRatingsScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('season-card-season-101-1')).toBeTruthy();
    });

    fireEvent(screen.getByTestId('season-card-season-101-1'), 'longPress');

    expect(screen.getByTestId('season-ratings-action-bar')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('actionbar-remove'));
    });

    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const buttons = alertCall[2] as Array<{ style?: string; onPress?: () => unknown }>;
    const confirmButton = buttons.find((button) => button.style === 'destructive');
    await act(async () => {
      await confirmButton?.onPress?.();
    });

    await waitFor(() => {
      expect(mockDeleteSeasonRatingMutateAsync).toHaveBeenCalledWith({
        tvShowId: 101,
        seasonNumber: 1,
      });
    });
  });
});
