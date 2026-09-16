import { ExternalRatingsSection } from '@/src/components/detail/ExternalRatingsSection';
import type { ExternalRatings } from '@/src/api/omdb';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

describe('ExternalRatingsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders skeleton with two separators when loading', () => {
    const { getAllByTestId } = render(<ExternalRatingsSection ratings={null} isLoading={true} />);
    const separators = getAllByTestId('section-separator');
    expect(separators.length).toBe(2);
  });

  it('renders a single SectionSeparator when ratings is null', () => {
    const { getAllByTestId, queryByText } = render(
      <ExternalRatingsSection ratings={null} isLoading={false} />
    );
    const separators = getAllByTestId('section-separator');
    expect(separators.length).toBe(1);
    expect(queryByText('IMDb')).toBeNull();
  });

  it('renders a single SectionSeparator when ratings object has no ratings', () => {
    const emptyRatings: ExternalRatings = {
      imdb: null,
      rottenTomatoes: null,
      metacritic: null,
      awards: null,
      imdbId: null,
    };
    const { getAllByTestId, queryByText } = render(
      <ExternalRatingsSection ratings={emptyRatings} isLoading={false} />
    );
    const separators = getAllByTestId('section-separator');
    expect(separators.length).toBe(1);
    expect(queryByText('IMDb')).toBeNull();
  });

  it('renders ratings and two separators when ratings are provided', () => {
    const ratings: ExternalRatings = {
      imdb: { rating: '7.8', votes: '10,000' },
      rottenTomatoes: '85%',
      metacritic: '75',
      awards: null,
      imdbId: 'tt0111161',
    };

    const { getAllByTestId, getByText } = render(
      <ExternalRatingsSection ratings={ratings} isLoading={false} />
    );

    const separators = getAllByTestId('section-separator');
    expect(separators.length).toBe(2);

    expect(getByText('7.8/10')).toBeTruthy();
    expect(getByText('IMDb')).toBeTruthy();
    expect(getByText('85%')).toBeTruthy();
    expect(getByText('Rotten Tomatoes')).toBeTruthy();
    expect(getByText('75')).toBeTruthy();
    expect(getByText('Metacritic')).toBeTruthy();
  });

  it('renders only available ratings when partial ratings are provided', () => {
    const ratings: ExternalRatings = {
      imdb: { rating: '8.2', votes: '5,000' },
      rottenTomatoes: null,
      metacritic: null,
      awards: null,
      imdbId: 'tt0111161',
    };

    const { getAllByTestId, getByText, queryByText } = render(
      <ExternalRatingsSection ratings={ratings} isLoading={false} />
    );

    const separators = getAllByTestId('section-separator');
    expect(separators.length).toBe(2);

    expect(getByText('8.2/10')).toBeTruthy();
    expect(getByText('IMDb')).toBeTruthy();
    expect(queryByText('Rotten Tomatoes')).toBeNull();
    expect(queryByText('Metacritic')).toBeNull();
  });

  it('opens the IMDb title page when the IMDb rating is pressed', () => {
    const ratings: ExternalRatings = {
      imdb: { rating: '7.8', votes: '10,000' },
      rottenTomatoes: '85%',
      metacritic: '75',
      awards: null,
      imdbId: 'tt0111161',
    };

    const { getByTestId } = render(
      <ExternalRatingsSection
        ratings={ratings}
        isLoading={false}
        mediaType="movie"
        mediaId={550}
        title="Fight Club"
        year="1999"
      />
    );

    fireEvent.press(getByTestId('external-rating-imdb'));
    expect(Linking.openURL).toHaveBeenCalledWith('https://www.imdb.com/title/tt0111161/');
  });

  it('opens Rotten Tomatoes and Metacritic search pages when pressed', () => {
    const ratings: ExternalRatings = {
      imdb: { rating: '7.8', votes: '10,000' },
      rottenTomatoes: '85%',
      metacritic: '75/100',
      awards: null,
      imdbId: 'tt0111161',
    };

    const { getByTestId } = render(
      <ExternalRatingsSection
        ratings={ratings}
        isLoading={false}
        mediaType="movie"
        mediaId={550}
        title="Fight Club"
        year="1999"
      />
    );

    fireEvent.press(getByTestId('external-rating-rotten-tomatoes'));
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.rottentomatoes.com/search?search=Fight%20Club%201999'
    );

    fireEvent.press(getByTestId('external-rating-metacritic'));
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.metacritic.com/search/Fight%20Club%201999/'
    );
  });

  it('falls back to IMDb search when no IMDb ID is available', () => {
    const ratings: ExternalRatings = {
      imdb: { rating: '7.8', votes: '10,000' },
      rottenTomatoes: null,
      metacritic: null,
      awards: null,
      imdbId: null,
    };

    const { getByTestId } = render(
      <ExternalRatingsSection
        ratings={ratings}
        isLoading={false}
        mediaType="movie"
        mediaId={550}
        title="Fight Club"
        year="1999"
        imdbId={null}
      />
    );

    fireEvent.press(getByTestId('external-rating-imdb'));
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.imdb.com/find/?q=Fight%20Club%201999&s=tt'
    );
  });

  it('calls onOpenLinkError when opening a link fails', async () => {
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('no app'));
    const onOpenLinkError = jest.fn();
    const ratings: ExternalRatings = {
      imdb: { rating: '7.8', votes: '10,000' },
      rottenTomatoes: null,
      metacritic: null,
      awards: null,
      imdbId: 'tt0111161',
    };

    const { getByTestId } = render(
      <ExternalRatingsSection
        ratings={ratings}
        isLoading={false}
        mediaType="movie"
        mediaId={550}
        title="Fight Club"
        year="1999"
        onOpenLinkError={onOpenLinkError}
      />
    );

    fireEvent.press(getByTestId('external-rating-imdb'));
    await Promise.resolve();
    expect(onOpenLinkError).toHaveBeenCalled();
  });
});
