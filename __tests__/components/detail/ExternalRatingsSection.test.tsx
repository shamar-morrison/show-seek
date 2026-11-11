import { ExternalRatingsSection } from '@/src/components/detail/ExternalRatingsSection';
import type { ExternalRatings } from '@/src/api/mdblist';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

jest.mock('@/src/components/icons/TraktLogo', () => ({ TraktLogo: () => null }));

const none: ExternalRatings = {
  imdb: null,
  rottenTomatoes: null,
  metacritic: null,
  letterboxd: null,
  trakt: null,
  imdbId: null,
};

const all: ExternalRatings = {
  imdb: '8.8',
  rottenTomatoes: '79%',
  metacritic: '67',
  letterboxd: '4.3',
  trakt: '88%',
  imdbId: 'tt0137523',
};

const renderFightClub = (ratings: ExternalRatings, extra: object = {}) =>
  render(
    <ExternalRatingsSection
      ratings={ratings}
      isLoading={false}
      mediaType="movie"
      mediaId={550}
      title="Fight Club"
      year="1999"
      {...extra}
    />
  );

describe('ExternalRatingsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows a five-score skeleton between two separators while loading', () => {
    const { getAllByTestId, getByTestId } = render(
      <ExternalRatingsSection ratings={null} isLoading />
    );
    expect(getAllByTestId('section-separator')).toHaveLength(2);
    expect(getByTestId('external-ratings-skeleton').props.children).toHaveLength(5);
  });

  it.each([
    ['null', null],
    ['empty', none],
  ])('keeps a single separator and no scores when ratings are %s', (_label, ratings) => {
    const { getAllByTestId, queryByTestId } = render(
      <ExternalRatingsSection ratings={ratings} isLoading={false} />
    );
    expect(getAllByTestId('section-separator')).toHaveLength(1);
    expect(queryByTestId('external-rating-imdb')).toBeNull();
  });

  it('shows all five scores in order, each a logo with the score and no site name', () => {
    const { getAllByTestId, getByText, queryByText } = renderFightClub(all);

    expect(getAllByTestId('section-separator')).toHaveLength(2);
    expect(getAllByTestId(/^external-rating-/).map((node) => node.props.testID)).toEqual([
      'external-rating-imdb',
      'external-rating-rotten-tomatoes',
      'external-rating-metacritic',
      'external-rating-letterboxd',
      'external-rating-trakt',
    ]);
    for (const value of ['8.8', '79%', '67', '4.3', '88%']) {
      expect(getByText(value)).toBeTruthy();
    }
    expect(queryByText('Rotten Tomatoes')).toBeNull();
  });

  it('leaves out sites without a score', () => {
    const { queryByTestId, getByTestId } = renderFightClub({ ...none, letterboxd: '4.3' });

    expect(getByTestId('external-rating-letterboxd')).toBeTruthy();
    expect(queryByTestId('external-rating-imdb')).toBeNull();
    expect(queryByTestId('external-rating-trakt')).toBeNull();
  });

  it('describes each score for screen readers', () => {
    const { getByTestId } = renderFightClub(all);
    expect(getByTestId('external-rating-letterboxd').props.accessibilityLabel).toBe(
      'Letterboxd 4.3. Open Letterboxd page for Fight Club'
    );
  });

  it('opens each site for the title', () => {
    const { getByTestId } = renderFightClub(all);

    fireEvent.press(getByTestId('external-rating-imdb'));
    fireEvent.press(getByTestId('external-rating-rotten-tomatoes'));
    fireEvent.press(getByTestId('external-rating-metacritic'));
    fireEvent.press(getByTestId('external-rating-letterboxd'));
    fireEvent.press(getByTestId('external-rating-trakt'));

    expect((Linking.openURL as jest.Mock).mock.calls.map(([url]) => url)).toEqual([
      'https://www.imdb.com/title/tt0137523/',
      'https://www.rottentomatoes.com/search?search=Fight%20Club%201999',
      'https://www.metacritic.com/search/Fight%20Club%201999/',
      'https://letterboxd.com/tmdb/550/',
      'https://trakt.tv/search/movies?query=Fight%20Club%201999',
    ]);
  });

  it('searches Letterboxd for TV shows, which it has no TMDB link for', () => {
    const { getByTestId } = renderFightClub(all, {
      mediaType: 'tv',
      mediaId: 1399,
      title: 'Game of Thrones',
      year: '2011',
    });

    fireEvent.press(getByTestId('external-rating-letterboxd'));
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://letterboxd.com/search/Game%20of%20Thrones%202011/'
    );
  });

  it('falls back to IMDb search when no IMDb ID is available', () => {
    const { getByTestId } = renderFightClub({ ...all, imdbId: null }, { imdbId: null });

    fireEvent.press(getByTestId('external-rating-imdb'));
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.imdb.com/find/?q=Fight%20Club%201999&s=tt'
    );
  });

  it('calls onOpenLinkError when opening a link fails', async () => {
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('no app'));
    const onOpenLinkError = jest.fn();
    const { getByTestId } = renderFightClub(all, { onOpenLinkError });

    fireEvent.press(getByTestId('external-rating-imdb'));
    await Promise.resolve();
    expect(onOpenLinkError).toHaveBeenCalled();
  });
});
