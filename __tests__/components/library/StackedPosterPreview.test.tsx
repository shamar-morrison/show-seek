import { renderWithProviders, waitFor } from '@/__tests__/utils/test-utils';
import { StackedPosterPreview } from '@/src/components/library/StackedPosterPreview';
import React from 'react';

const mockGetSeasonDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();

jest.mock('@/src/api/tmdb', () => ({
  getImageUrl: (path: string | null) => (path ? `https://img${path}` : null),
  TMDB_IMAGE_SIZES: { poster: { small: 'w185' } },
  tmdbApi: {
    getSeasonDetails: (...args: unknown[]) => mockGetSeasonDetails(...args),
    getTVShowDetails: (...args: unknown[]) => mockGetTVShowDetails(...args),
  },
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    resolvePosterPath: (_type: string, _id: number, fallback: string | null) => fallback,
  }),
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: ({ source }: { source: { uri: string | null } }) => {
    const { Text } = require('react-native');
    return <Text testID="stacked-poster">{source.uri ?? 'none'}</Text>;
  },
}));

const posterUris = (screen: ReturnType<typeof renderWithProviders>) =>
  screen.getAllByTestId('stacked-poster').map((node) => node.props.children);

describe('StackedPosterPreview seasons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a season's saved poster without fetching", () => {
    const screen = renderWithProviders(
      <StackedPosterPreview
        items={[{ mediaType: 'season', mediaId: 1396, seasonNumber: 3, posterPath: '/s3.jpg' }]}
      />
    );

    expect(posterUris(screen)).toEqual(['https://img/s3.jpg']);
    expect(mockGetSeasonDetails).not.toHaveBeenCalled();
  });

  it("fetches the season's poster when none was saved", async () => {
    mockGetSeasonDetails.mockResolvedValue({ poster_path: '/fetched-s2.jpg' });

    const screen = renderWithProviders(
      <StackedPosterPreview
        items={[{ mediaType: 'season', mediaId: 1396, seasonNumber: 2, posterPath: null }]}
      />
    );

    await waitFor(() => expect(posterUris(screen)).toEqual(['https://img/fetched-s2.jpg']));
    expect(mockGetSeasonDetails).toHaveBeenCalledWith(1396, 2);
    expect(mockGetTVShowDetails).not.toHaveBeenCalled();
  });

  it("falls back to the show's poster when the season has none", async () => {
    mockGetSeasonDetails.mockResolvedValue({ poster_path: null });
    mockGetTVShowDetails.mockResolvedValue({ poster_path: '/show.jpg' });

    const screen = renderWithProviders(
      <StackedPosterPreview
        items={[{ mediaType: 'season', mediaId: 1396, seasonNumber: 0, posterPath: null }]}
      />
    );

    await waitFor(() => expect(posterUris(screen)).toEqual(['https://img/show.jpg']));
    expect(mockGetTVShowDetails).toHaveBeenCalledWith(1396);
  });
});
