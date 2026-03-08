import { renderWithProviders } from '@/__tests__/utils/test-utils';
import { EpisodeRatingCard } from '@/src/components/library/EpisodeRatingCard';
import { MovieRatingListCard } from '@/src/components/library/MovieRatingListCard';
import { TVShowRatingListCard } from '@/src/components/library/TVShowRatingListCard';
import { EnrichedMovieRating, EnrichedTVRating } from '@/src/hooks/useEnrichedRatings';
import { RatingItem } from '@/src/services/RatingService';
import React from 'react';

jest.mock('@/src/components/ui/AnimatedCheck', () => ({
  AnimatedCheck: ({ visible }: { visible: boolean }) =>
    visible ? require('react').createElement('View', { testID: 'animated-check-visible' }) : null,
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: (props: any) => require('react').createElement('Image', props),
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    resolvePosterPath: (
      _mediaType: 'movie' | 'tv',
      _mediaId: number,
      fallbackPosterPath: string | null
    ) => fallbackPosterPath,
  }),
}));

const movieItem: EnrichedMovieRating = {
  rating: {
    id: '123',
    mediaType: 'movie',
    rating: 8,
    ratedAt: 1,
  },
  movie: {
    id: 123,
    title: 'Movie One',
    poster_path: '/movie.jpg',
    release_date: '2024-01-01',
    vote_average: 8.2,
  } as any,
};

const tvItem: EnrichedTVRating = {
  rating: {
    id: '456',
    mediaType: 'tv',
    rating: 7,
    ratedAt: 1,
  },
  tvShow: {
    id: 456,
    name: 'Show One',
    poster_path: '/show.jpg',
    first_air_date: '2024-02-02',
    vote_average: 7.9,
  } as any,
};

const episodeItem: RatingItem = {
  id: 'episode-10-1-1',
  mediaType: 'episode',
  rating: 9,
  ratedAt: 1,
  tvShowId: 10,
  seasonNumber: 1,
  episodeNumber: 1,
  tvShowName: 'Show One',
  episodeName: 'Pilot',
  posterPath: '/episode.jpg',
};

describe('rating selection cards', () => {
  it('shows the movie rating selection badge and check when selected', () => {
    const { getByTestId } = renderWithProviders(
      <MovieRatingListCard
        item={movieItem}
        onPress={jest.fn()}
        onLongPress={jest.fn()}
        selectionMode={true}
        isSelected={true}
      />
    );

    expect(getByTestId('movie-rating-card-selection-badge')).toBeTruthy();
    expect(getByTestId('animated-check-visible')).toBeTruthy();
  });

  it('shows the TV rating selection badge and check when selected', () => {
    const { getByTestId } = renderWithProviders(
      <TVShowRatingListCard
        item={tvItem}
        onPress={jest.fn()}
        onLongPress={jest.fn()}
        selectionMode={true}
        isSelected={true}
      />
    );

    expect(getByTestId('tv-rating-card-selection-badge')).toBeTruthy();
    expect(getByTestId('animated-check-visible')).toBeTruthy();
  });

  it('shows the episode rating selection badge and check when selected', () => {
    const { getByTestId } = renderWithProviders(
      <EpisodeRatingCard
        rating={episodeItem}
        onPress={jest.fn()}
        onLongPress={jest.fn()}
        selectionMode={true}
        isSelected={true}
      />
    );

    expect(getByTestId('episode-rating-card-selection-badge')).toBeTruthy();
    expect(getByTestId('animated-check-visible')).toBeTruthy();
  });
});
