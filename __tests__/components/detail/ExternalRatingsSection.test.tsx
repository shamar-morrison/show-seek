import { ExternalRatingsSection } from '@/src/components/detail/ExternalRatingsSection';
import type { ExternalRatings } from '@/src/api/omdb';
import { render } from '@testing-library/react-native';
import React from 'react';

describe('ExternalRatingsSection', () => {
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
});
