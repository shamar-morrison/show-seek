import { render, waitFor } from '@testing-library/react-native';
import { fireEvent } from '@testing-library/react-native';
import React from 'react';

const mockSetOptions = jest.fn();
const mockPush = jest.fn();
const mockUseMonthDetail = jest.fn();
const mockUseCurrentTab = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ month: '2026-03' }),
  useNavigation: () => ({ setOptions: mockSetOptions }),
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/src/hooks/useHistory', () => ({
  useMonthDetail: (...args: unknown[]) => mockUseMonthDetail(...args),
}));

jest.mock('@/src/context/TabContext', () => ({
  useCurrentTab: () => mockUseCurrentTab(),
}));

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));

jest.mock('@/src/components/library/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => {
    const { Text } = require('react-native');
    return <Text>{title}</Text>;
  },
}));

jest.mock('@/src/components/library/MediaListCard', () => ({
  MediaListCard: ({
    item,
    subtitle,
  }: {
    item: { title: string };
    subtitle?: string;
  }) => {
    const { Text, View } = require('react-native');
    return (
      <View testID="media-list-card">
        <Text>{item.title}</Text>
        {subtitle ? <Text>{subtitle}</Text> : null}
      </View>
    );
  },
}));

jest.mock('@/src/components/library/ActivityRatingCard', () => ({
  ActivityRatingCard: ({ item }: { item: { title: string } }) => {
    const { Text } = require('react-native');
    return <Text testID="activity-rating-card">{item.title}</Text>;
  },
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: ({ data, renderItem }: any) => {
    const React = require('react');
    const { View } = require('react-native');

    return React.createElement(
      View,
      { testID: 'flash-list' },
      data.map((item: any, index: number) =>
        React.createElement(View, { key: `${index}` }, renderItem({ item, index }))
      )
    );
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

import MonthDetailScreen from '@/src/screens/MonthDetailScreen';

describe('MonthDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCurrentTab.mockReturnValue('library');
    mockUseMonthDetail.mockReturnValue({
      data: {
        month: '2026-03',
        monthName: 'March 2026',
        stats: {
          month: '2026-03',
          monthName: 'March 2026',
          watched: 4,
          rated: 0,
          addedToLists: 0,
          averageRating: null,
          topGenres: [],
          comparisonToPrevious: null,
        },
        items: {
          watched: [
            {
              kind: 'episode-group',
              id: 500,
              mediaType: 'tv',
              title: 'Grouped Show',
              posterPath: '/grouped-show.jpg',
              timestamp: new Date('2026-03-07T09:30:00Z').getTime(),
              episodeCount: 2,
            },
            {
              kind: 'media',
              id: 101,
              mediaType: 'movie',
              title: 'Watched Movie',
              posterPath: '/watched-movie.jpg',
              timestamp: new Date('2026-03-06T10:00:00Z').getTime(),
              voteAverage: 7.8,
              releaseDate: '2025-01-01',
            },
          ],
          rated: [],
          added: [],
        },
      },
      isLoading: false,
    });
  });

  it('renders grouped watched show rows with episode counts while keeping the watched badge tied to total watched items', async () => {
    const { getAllByTestId, getAllByText, getByText, queryByTestId } = render(<MonthDetailScreen />);

    await waitFor(() => {
      expect(mockSetOptions).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'March 2026' })
      );
    });

    expect(getAllByTestId('media-list-card')).toHaveLength(2);
    expect(queryByTestId('activity-rating-card')).toBeNull();
    expect(getAllByText('Grouped Show')).toHaveLength(1);
    expect(getByText('2 Episodes')).toBeTruthy();
    expect(getAllByText('4')).toHaveLength(2);
  });

  it('filters unsupported added-item media types from the added tab and its count', async () => {
    mockUseMonthDetail.mockReturnValue({
      data: {
        month: '2026-03',
        monthName: 'March 2026',
        stats: {
          month: '2026-03',
          monthName: 'March 2026',
          watched: 0,
          rated: 0,
          addedToLists: 8,
          averageRating: null,
          topGenres: [],
          comparisonToPrevious: null,
        },
        items: {
          watched: [],
          rated: [],
          added: [
            {
              id: 'movie-101',
              type: 'added' as const,
              mediaType: 'movie' as const,
              title: 'Valid Added Movie',
              posterPath: '/movie.jpg',
              timestamp: new Date('2026-03-06T10:00:00Z').getTime(),
              voteAverage: 7.8,
              releaseDate: '2025-01-01',
            },
            {
              id: 'season-500-2',
              type: 'added' as const,
              mediaType: 'season' as const,
              title: 'Filtered Season',
              posterPath: '/season.jpg',
              timestamp: new Date('2026-03-07T10:00:00Z').getTime(),
              seasonNumber: 2,
              tvShowId: 500,
            },
          ],
        },
      },
      isLoading: false,
    });

    const { getAllByTestId, getAllByText, queryByText } = render(<MonthDetailScreen />);

    await waitFor(() => {
      expect(getAllByTestId('media-list-card')).toHaveLength(1);
    });

    fireEvent.press(getAllByText('Added')[0]);

    expect(queryByText('Filtered Season')).toBeNull();
    expect(getAllByText('Valid Added Movie')).toHaveLength(1);
    expect(getAllByText('1')).toHaveLength(1);
  });
});
