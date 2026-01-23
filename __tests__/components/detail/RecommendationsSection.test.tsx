import { RecommendationsSection } from '@/src/components/detail/RecommendationsSection';
import { SimilarMediaItem } from '@/src/components/detail/types';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

// Mock the hooks and components used by RecommendationsSection
jest.mock('@/src/hooks/useListMembership', () => ({
  useListMembership: () => ({
    getListsForMedia: jest.fn().mockReturnValue([]),
  }),
}));

jest.mock('@/src/components/ui/ListMembershipBadge', () => ({
  ListMembershipBadge: () => null,
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: ({ testID }: { testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID || 'media-image'} />;
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

jest.mock('lucide-react-native', () => ({
  Star: () => {
    const { View } = require('react-native');
    return <View testID="star-icon" />;
  },
}));

jest.mock('@/src/api/tmdb', () => ({
  getImageUrl: jest.fn().mockReturnValue('https://test-image-url.com'),
  TMDB_IMAGE_SIZES: {
    poster: { small: 'w185' },
  },
}));

describe('RecommendationsSection', () => {
  const mockItems: SimilarMediaItem[] = [
    {
      id: 101,
      title: 'Recommended Movie 1',
      poster_path: '/rec-poster1.jpg',
      release_date: '2024-03-01',
      vote_average: 8.5,
    },
    {
      id: 102,
      title: 'Recommended Movie 2',
      poster_path: '/rec-poster2.jpg',
      release_date: '2024-04-01',
      vote_average: 7.8,
    },
  ];

  const mockOnMediaPress = jest.fn();
  const mockOnMediaLongPress = jest.fn();
  const mockOnLayout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading skeleton when isLoading and shouldLoad are true', () => {
    const { getByText } = render(
      <RecommendationsSection
        items={[]}
        isLoading={true}
        isError={false}
        shouldLoad={true}
        onMediaPress={mockOnMediaPress}
        mediaType="movie"
      />
    );

    expect(getByText('You May Also Like')).toBeTruthy();
  });

  it('should render error state when isError and shouldLoad are true', () => {
    const { getByText } = render(
      <RecommendationsSection
        items={[]}
        isLoading={false}
        isError={true}
        shouldLoad={true}
        onMediaPress={mockOnMediaPress}
        mediaType="movie"
      />
    );

    expect(getByText('Failed to load recommendations')).toBeTruthy();
  });

  it('should render recommendations when data is available', () => {
    const { getByText } = render(
      <RecommendationsSection
        items={mockItems}
        isLoading={false}
        isError={false}
        shouldLoad={true}
        onMediaPress={mockOnMediaPress}
        mediaType="movie"
      />
    );

    expect(getByText('You May Also Like')).toBeTruthy();
    expect(getByText('Recommended Movie 1')).toBeTruthy();
    expect(getByText('Recommended Movie 2')).toBeTruthy();
  });

  it('should call onMediaPress when a card is pressed', () => {
    const { getByText } = render(
      <RecommendationsSection
        items={mockItems}
        isLoading={false}
        isError={false}
        shouldLoad={true}
        onMediaPress={mockOnMediaPress}
        mediaType="movie"
      />
    );

    const movieTitle = getByText('Recommended Movie 1');
    fireEvent.press(movieTitle);

    expect(mockOnMediaPress).toHaveBeenCalledWith(101);
  });

  it('should call onMediaLongPress when a card is long-pressed', () => {
    const { getByText } = render(
      <RecommendationsSection
        items={mockItems}
        isLoading={false}
        isError={false}
        shouldLoad={true}
        onMediaPress={mockOnMediaPress}
        onMediaLongPress={mockOnMediaLongPress}
        mediaType="movie"
      />
    );

    const movieTitle = getByText('Recommended Movie 1');
    fireEvent(movieTitle, 'longPress');

    expect(mockOnMediaLongPress).toHaveBeenCalledWith(mockItems[0]);
  });

  it('should pass the correct item to onMediaLongPress callback', () => {
    const { getByText } = render(
      <RecommendationsSection
        items={mockItems}
        isLoading={false}
        isError={false}
        shouldLoad={true}
        onMediaPress={mockOnMediaPress}
        onMediaLongPress={mockOnMediaLongPress}
        mediaType="movie"
      />
    );

    const movieTitle = getByText('Recommended Movie 2');
    fireEvent(movieTitle, 'longPress');

    expect(mockOnMediaLongPress).toHaveBeenCalledWith(mockItems[1]);
  });

  it('should work without onMediaLongPress prop (optional)', () => {
    const { getByText } = render(
      <RecommendationsSection
        items={mockItems}
        isLoading={false}
        isError={false}
        shouldLoad={true}
        onMediaPress={mockOnMediaPress}
        mediaType="movie"
      />
    );

    // Long-pressing should not throw when onMediaLongPress is not provided
    const movieTitle = getByText('Recommended Movie 1');
    expect(() => fireEvent(movieTitle, 'longPress')).not.toThrow();
  });

  it('should render items even when shouldLoad is false if items are already available', () => {
    // Note: The component renders items when they exist, regardless of shouldLoad
    // shouldLoad primarily controls loading/error states and the empty trigger view
    const { getByText } = render(
      <RecommendationsSection
        items={mockItems}
        isLoading={false}
        isError={false}
        shouldLoad={false}
        onMediaPress={mockOnMediaPress}
        onLayout={mockOnLayout}
        mediaType="movie"
      />
    );

    // Items are rendered because the component prioritizes showing available data
    expect(getByText('Recommended Movie 1')).toBeTruthy();
    expect(getByText('Recommended Movie 2')).toBeTruthy();
  });

  it('should return null when items array is empty and not loading/error', () => {
    const { queryByText } = render(
      <RecommendationsSection
        items={[]}
        isLoading={false}
        isError={false}
        shouldLoad={true}
        onMediaPress={mockOnMediaPress}
        mediaType="movie"
      />
    );

    expect(queryByText('You May Also Like')).toBeNull();
  });
});
