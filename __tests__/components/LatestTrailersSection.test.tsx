import { LatestTrailersSection } from '@/src/components/LatestTrailersSection';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getLatestTrailers: jest.fn().mockResolvedValue([
      {
        id: 'trailer-1',
        key: 'dQw4w9WgXcQ',
        name: 'Official Teaser',
        mediaTitle: 'Test Movie',
        mediaOriginalTitle: 'Test Movie Original',
        mediaType: 'movie',
      },
    ]),
  },
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));

jest.mock('@/src/components/ui/HorizontalFlashList', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    HorizontalFlashList: ({ data, renderItem }: any) => (
      <View testID="horizontal-flash-list">
        {data?.map((item: any, index: number) => (
          <View key={item.id || index}>{renderItem({ item, index })}</View>
        ))}
      </View>
    ),
  };
});

jest.mock('@/src/components/ui/LoadingSkeleton', () => ({
  MovieCardSkeleton: () => null,
  LoadingSkeleton: () => null,
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: { dataSaver: false, showOriginalTitles: false },
  }),
}));

describe('LatestTrailersSection', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    jest.clearAllMocks();
  });

  it('renders section title and trailer items, and opens modal on press', async () => {
    const { findByText, getByTestId, queryByTestId } = render(
      <QueryClientProvider client={queryClient}>
        <LatestTrailersSection label="Latest Trailers" />
      </QueryClientProvider>
    );

    const title = await findByText('Latest Trailers');
    expect(title).toBeTruthy();

    const trailerCard = await findByText('Official Teaser');
    expect(trailerCard).toBeTruthy();

    // Player should not be visible initially
    expect(queryByTestId('youtube-view')).toBeNull();

    // Tap trailer card
    fireEvent.press(trailerCard);

    // Trailer modal should open
    expect(getByTestId('youtube-view')).toBeTruthy();

    // Close modal
    fireEvent.press(getByTestId('trailer-player-close-button'));
    expect(queryByTestId('youtube-view')).toBeNull();
  });
});
