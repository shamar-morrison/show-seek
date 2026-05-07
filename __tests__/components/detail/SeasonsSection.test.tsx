import { SeasonsSection } from '@/src/components/detail/SeasonsSection';
import type { RatingItem } from '@/src/services/RatingService';
import { render } from '@testing-library/react-native';
import React from 'react';

const mockUseRatings = jest.fn();
const mockSeasonCard = jest.fn();

jest.mock('@/src/hooks/useRatings', () => ({
  useRatings: () => mockUseRatings(),
}));

jest.mock('@/src/components/SeasonCard', () => ({
  SeasonCard: (props: any) => {
    mockSeasonCard(props);
    return null;
  },
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: ({ data, renderItem, keyExtractor }: any) => {
    const { View } = require('react-native');
    return (
      <View testID="flash-list">
        {data.map((item: any, index: number) => (
          <View key={keyExtractor ? keyExtractor(item) : index}>{renderItem({ item })}</View>
        ))}
      </View>
    );
  },
}));

jest.mock('@/src/components/detail/detailStyles', () => ({
  useDetailStyles: () => ({
    sectionTitle: {},
    similarList: {},
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('SeasonsSection', () => {
  const seasons = [
    {
      id: 11,
      season_number: 1,
      name: 'Season 1',
      episode_count: 10,
      air_date: '2024-01-01',
      overview: 'Overview 1',
      poster_path: '/season-1.jpg',
    },
    {
      id: 12,
      season_number: 2,
      name: 'Season 2',
      episode_count: 8,
      air_date: '2025-01-01',
      overview: 'Overview 2',
      poster_path: '/season-2.jpg',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRatings.mockReturnValue({ data: [] });
  });

  it('passes through only season ratings for the current show', () => {
    const ratings: RatingItem[] = [
      {
        id: 'season-55-1',
        mediaType: 'season',
        rating: 8.5,
        ratedAt: 100,
        tvShowId: 55,
        seasonNumber: 1,
      },
      {
        id: 'season-55-2',
        mediaType: 'season',
        rating: 9,
        ratedAt: 90,
        tvShowId: 55,
        seasonNumber: 2,
      },
      {
        id: 'season-99-1',
        mediaType: 'season',
        rating: 7,
        ratedAt: 80,
        tvShowId: 99,
        seasonNumber: 1,
      },
      {
        id: 'tv-55',
        mediaType: 'tv',
        rating: 6,
        ratedAt: 70,
      },
      {
        id: 'episode-55-1-1',
        mediaType: 'episode',
        rating: 9.5,
        ratedAt: 60,
        tvShowId: 55,
        seasonNumber: 1,
        episodeNumber: 1,
      },
    ];

    mockUseRatings.mockReturnValue({ data: ratings });

    render(<SeasonsSection tvShowId={55} seasons={seasons as any} onSeasonPress={jest.fn()} />);

    expect(mockSeasonCard).toHaveBeenCalledTimes(2);
    expect(mockSeasonCard.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        tvShowId: 55,
        season: seasons[0],
        userRating: 8.5,
      })
    );
    expect(mockSeasonCard.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        tvShowId: 55,
        season: seasons[1],
        userRating: 9,
      })
    );
  });

  it('omits userRating for seasons without a matching rating', () => {
    mockUseRatings.mockReturnValue({
      data: [
        {
          id: 'season-99-1',
          mediaType: 'season',
          rating: 7,
          ratedAt: 80,
          tvShowId: 99,
          seasonNumber: 1,
        },
      ],
    });

    render(<SeasonsSection tvShowId={55} seasons={seasons as any} onSeasonPress={jest.fn()} />);

    expect(mockSeasonCard.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        season: seasons[0],
        userRating: undefined,
      })
    );
    expect(mockSeasonCard.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        season: seasons[1],
        userRating: undefined,
      })
    );
  });
});
