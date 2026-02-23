import { SimilarMediaSection } from '@/src/components/detail/SimilarMediaSection';
import { SimilarMediaItem } from '@/src/components/detail/types';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

// Mock the hooks and components used by SimilarMediaSection
jest.mock('@/src/hooks/useListMembership', () => ({
  useListMembership: () => ({
    getListsForMedia: jest.fn().mockReturnValue([]),
  }),
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    overrides: {},
    resolvePosterPath: (_mediaType: 'movie' | 'tv', _mediaId: number, fallbackPosterPath: string | null) =>
      fallbackPosterPath,
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

describe('SimilarMediaSection', () => {
  const mockItems: SimilarMediaItem[] = [
    {
      id: 1,
      title: 'Movie 1',
      poster_path: '/poster1.jpg',
      release_date: '2024-01-01',
      vote_average: 8.0,
    },
    {
      id: 2,
      title: 'Movie 2',
      poster_path: '/poster2.jpg',
      release_date: '2024-02-01',
      vote_average: 7.5,
    },
  ];

  const mockOnMediaPress = jest.fn();
  const mockOnMediaLongPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render nothing when items array is empty', () => {
    const { queryByText } = render(
      <SimilarMediaSection
        items={[]}
        onMediaPress={mockOnMediaPress}
        title="Similar Movies"
        mediaType="movie"
      />
    );

    expect(queryByText('Similar Movies')).toBeNull();
  });

  it('should render the section title when items are present', () => {
    const { getByText } = render(
      <SimilarMediaSection
        items={mockItems}
        onMediaPress={mockOnMediaPress}
        title="Similar Movies"
        mediaType="movie"
      />
    );

    expect(getByText('Similar Movies')).toBeTruthy();
  });

  it('should call onMediaPress when a card is pressed', () => {
    const { getByText } = render(
      <SimilarMediaSection
        items={mockItems}
        onMediaPress={mockOnMediaPress}
        title="Similar Movies"
        mediaType="movie"
      />
    );

    // Find and press the first movie card
    const movieTitle = getByText('Movie 1');
    fireEvent.press(movieTitle);

    expect(mockOnMediaPress).toHaveBeenCalledWith(1);
  });

  it('should call onMediaLongPress when a card is long-pressed', () => {
    const { getByText } = render(
      <SimilarMediaSection
        items={mockItems}
        onMediaPress={mockOnMediaPress}
        onMediaLongPress={mockOnMediaLongPress}
        title="Similar Movies"
        mediaType="movie"
      />
    );

    // Find and long-press the first movie card
    const movieTitle = getByText('Movie 1');
    fireEvent(movieTitle, 'longPress');

    expect(mockOnMediaLongPress).toHaveBeenCalledWith(mockItems[0]);
  });

  it('should pass the correct item to onMediaLongPress callback', () => {
    const { getByText } = render(
      <SimilarMediaSection
        items={mockItems}
        onMediaPress={mockOnMediaPress}
        onMediaLongPress={mockOnMediaLongPress}
        title="Similar Movies"
        mediaType="movie"
      />
    );

    // Long-press the second movie
    const movieTitle = getByText('Movie 2');
    fireEvent(movieTitle, 'longPress');

    expect(mockOnMediaLongPress).toHaveBeenCalledWith(mockItems[1]);
  });

  it('should work without onMediaLongPress prop (optional)', () => {
    const { getByText } = render(
      <SimilarMediaSection
        items={mockItems}
        onMediaPress={mockOnMediaPress}
        title="Similar Movies"
        mediaType="movie"
      />
    );

    // Long-pressing should not throw when onMediaLongPress is not provided
    const movieTitle = getByText('Movie 1');
    expect(() => fireEvent(movieTitle, 'longPress')).not.toThrow();
  });

  it('should render movie titles correctly', () => {
    const { getByText } = render(
      <SimilarMediaSection
        items={mockItems}
        onMediaPress={mockOnMediaPress}
        title="Similar Movies"
        mediaType="movie"
      />
    );

    expect(getByText('Movie 1')).toBeTruthy();
    expect(getByText('Movie 2')).toBeTruthy();
  });
});
