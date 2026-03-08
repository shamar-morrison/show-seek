import { act, fireEvent, renderWithProviders, waitFor } from '@/__tests__/utils/test-utils';
import EpisodeRatingsScreen from '@/app/(tabs)/library/ratings/episodes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

const mockPush = jest.fn();
const mockSetOptions = jest.fn();
const mockDeleteEpisodeMutateAsync = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useNavigation: () => ({
    setOptions: mockSetOptions,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  const FlashList = React.forwardRef(({ data, renderItem }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      scrollToOffset: jest.fn(),
    }));

    return (
      <View>
        {(data || []).map((item: any, index: number) => (
          <View key={item.id ?? index}>{renderItem({ item, index, target: 'Cell' })}</View>
        ))}
      </View>
    );
  });

  return { FlashList };
});

jest.mock('@/src/context/TabContext', () => ({
  useCurrentTab: () => 'library',
}));

jest.mock('@/src/hooks/useRatings', () => ({
  useRatings: () => ({
    data: [
      {
        id: 'episode-101-1-1',
        mediaType: 'episode',
        rating: 8,
        ratedAt: 200,
        tvShowId: 101,
        seasonNumber: 1,
        episodeNumber: 1,
        tvShowName: 'Show One',
        episodeName: 'Pilot',
        posterPath: '/one.jpg',
      },
      {
        id: 'episode-202-1-1',
        mediaType: 'episode',
        rating: 7,
        ratedAt: 100,
        tvShowId: 202,
        seasonNumber: 1,
        episodeNumber: 1,
        tvShowName: 'Show Two',
        episodeName: 'Arrival',
        posterPath: '/two.jpg',
      },
    ],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useDeleteEpisodeRating: () => ({
    mutateAsync: mockDeleteEpisodeMutateAsync,
    isPending: false,
  }),
}));

jest.mock('@/src/components/library/EpisodeRatingCard', () => ({
  EpisodeRatingCard: ({
    rating,
    onPress,
    onLongPress,
    selectionMode,
    isSelected,
  }: any) => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');

    return (
      <Pressable
        testID={`episode-card-${rating.id}`}
        onPress={() => onPress(rating)}
        onLongPress={() => onLongPress?.(rating)}
      >
        <Text>{rating.tvShowName}</Text>
        <Text>{rating.episodeName}</Text>
        {selectionMode ? (
          <View testID={`selection-state-${rating.id}`}>{isSelected ? <Text>selected</Text> : null}</View>
        ) : null}
      </Pressable>
    );
  },
}));

jest.mock('@/src/components/ui/ModalBackground', () => ({
  ModalBackground: () => null,
}));

describe('EpisodeRatingsScreen multi-select', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('grouped');
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('resets grouped selection to All and hides the tabs during multi-select', async () => {
    const { getByTestId, queryByTestId } = renderWithProviders(
      <EpisodeRatingsScreen />
    );

    await waitFor(() => {
      expect(getByTestId('episode-ratings-category-tabs')).toBeTruthy();
    });

    expect(getByTestId('episode-card-episode-101-1-1')).toBeTruthy();
    expect(getByTestId('episode-card-episode-202-1-1')).toBeTruthy();

    fireEvent.press(getByTestId('episode-ratings-category-tabs-tab-show-101'));

    await waitFor(() => {
      expect(getByTestId('episode-card-episode-101-1-1')).toBeTruthy();
      expect(queryByTestId('episode-card-episode-202-1-1')).toBeNull();
    });

    await act(async () => {
      fireEvent(getByTestId('episode-card-episode-101-1-1'), 'longPress');
    });

    await waitFor(() => {
      expect(queryByTestId('episode-ratings-category-tabs')).toBeNull();
      expect(getByTestId('multi-select-action-bar')).toBeTruthy();
      expect(getByTestId('episode-card-episode-202-1-1')).toBeTruthy();
    });
  });
});
