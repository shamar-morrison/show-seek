import { ExternalRatingsSection } from '@/src/components/detail/ExternalRatingsSection';
import type { ExternalRatings } from '@/src/api/mdblist';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

jest.mock('@/src/components/icons/TraktLogo', () => ({ TraktLogo: () => null }));

const mockGetTraktSlug = jest.fn();
jest.mock('@/src/api/trakt', () => ({
  getTraktSlugByTmdbId: (...args: unknown[]) => mockGetTraktSlug(...args),
}));

const noLinks = { rottenTomatoes: null, metacritic: null, letterboxd: null };

const none: ExternalRatings = {
  imdb: null,
  rottenTomatoes: null,
  metacritic: null,
  letterboxd: null,
  trakt: null,
  imdbId: null,
  links: noLinks,
};

const all: ExternalRatings = {
  imdb: '8.8',
  rottenTomatoes: '79%',
  metacritic: '67',
  letterboxd: '4.3',
  trakt: '88%',
  imdbId: 'tt0137523',
  links: {
    rottenTomatoes: 'https://www.rottentomatoes.com/m/fight_club',
    metacritic: 'https://www.metacritic.com/movie/fight-club',
    letterboxd: 'https://letterboxd.com/film/fight-club/',
  },
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
    mockGetTraktSlug.mockResolvedValue('fight-club-1999');
  });

  const pressAndSettle = async (utils: ReturnType<typeof render>, testID: string) => {
    fireEvent.press(utils.getByTestId(testID));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalled());
  };

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
    expect(
      getAllByTestId(/^external-rating-[a-z-]+$/)
        .map((node) => node.props.testID)
        .filter((id: string) => !/-(value|suffix|balance|score)$/.test(id))
    ).toEqual([
      'external-rating-imdb',
      'external-rating-rotten-tomatoes',
      'external-rating-metacritic',
      'external-rating-letterboxd',
      'external-rating-trakt',
    ]);
    for (const value of ['8.8', '79', '67', '4.3', '88']) {
      expect(getByText(value)).toBeTruthy();
    }
    expect(queryByText('Rotten Tomatoes')).toBeNull();
  });

  it('optically centres a % score with a half-size invisible %', () => {
    const { getByTestId, queryByTestId } = renderFightClub(all);
    // The balancing "%" is hidden from screen readers, so look it up including hidden elements.
    const hidden = { includeHiddenElements: true };

    // Invisible "%", number, visible "%", side by side in the normal row (nothing positioned
    // outside it, which Android clips).
    expect(getByTestId('external-rating-rotten-tomatoes-score')).toHaveStyle({
      flexDirection: 'row',
    });
    // Half size: it splits the difference between centring the number and the whole "79%".
    expect(getByTestId('external-rating-rotten-tomatoes-balance', hidden)).toHaveStyle({
      opacity: 0,
      fontSize: 7,
    });
    expect(getByTestId('external-rating-rotten-tomatoes-balance', hidden).props.children).toBe('%');
    expect(getByTestId('external-rating-rotten-tomatoes-value').props.children).toBe('79');
    expect(getByTestId('external-rating-rotten-tomatoes-suffix').props.children).toBe('%');
    expect(getByTestId('external-rating-rotten-tomatoes-suffix')).not.toHaveStyle({
      position: 'absolute',
    });
    expect(getByTestId('external-rating-trakt-suffix').props.children).toBe('%');
    expect(getByTestId('external-rating-imdb-value').props.children).toBe('8.8');
    expect(queryByTestId('external-rating-imdb-suffix')).toBeNull();
    expect(queryByTestId('external-rating-imdb-balance', hidden)).toBeNull();
  });

  it('hides the balancing % from screen readers', () => {
    const { getByTestId } = renderFightClub(all);
    const balance = getByTestId('external-rating-trakt-balance', { includeHiddenElements: true });

    expect(balance.props.accessibilityElementsHidden).toBe(true);
    expect(balance.props.importantForAccessibility).toBe('no-hide-descendants');
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

  it.each([
    ['external-rating-imdb', 'https://www.imdb.com/title/tt0137523/'],
    ['external-rating-rotten-tomatoes', 'https://www.rottentomatoes.com/m/fight_club'],
    ['external-rating-metacritic', 'https://www.metacritic.com/movie/fight-club'],
    ['external-rating-letterboxd', 'https://letterboxd.com/film/fight-club/'],
  ])("%s opens the title's own page", async (testID, url) => {
    const utils = renderFightClub(all);
    await pressAndSettle(utils, testID);
    expect(Linking.openURL).toHaveBeenCalledWith(url);
  });

  it('searches a site when MDBList has no page for it', async () => {
    const utils = renderFightClub({ ...all, links: noLinks });

    await pressAndSettle(utils, 'external-rating-rotten-tomatoes');
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.rottentomatoes.com/search?search=Fight%20Club%201999'
    );
  });

  it("opens Trakt's app on the title's page, found by its Trakt slug", async () => {
    const utils = renderFightClub(all);

    await pressAndSettle(utils, 'external-rating-trakt');
    expect(mockGetTraktSlug).toHaveBeenCalledWith(550, 'movie');
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).toHaveBeenCalledWith('trakt://movies/fight-club-1999');
  });

  it("opens Trakt's website when the app isn't installed", async () => {
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('no app'));
    const utils = renderFightClub(all);

    fireEvent.press(utils.getByTestId('external-rating-trakt'));
    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith('https://trakt.tv/movies/fight-club-1999')
    );
  });

  it('uses the shows section for a TV show on Trakt', async () => {
    mockGetTraktSlug.mockResolvedValue('game-of-thrones');
    const utils = renderFightClub(all, {
      mediaType: 'tv',
      mediaId: 1399,
      title: 'Game of Thrones',
    });

    await pressAndSettle(utils, 'external-rating-trakt');
    expect(Linking.openURL).toHaveBeenCalledWith('trakt://shows/game-of-thrones');
  });

  it('falls back to a Trakt search when the slug lookup finds nothing', async () => {
    mockGetTraktSlug.mockResolvedValue(null);
    const utils = renderFightClub(all);

    await pressAndSettle(utils, 'external-rating-trakt');
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://trakt.tv/search/movies?query=Fight%20Club%201999'
    );
  });

  it('searches Letterboxd for TV shows without a Letterboxd page', async () => {
    const utils = renderFightClub(
      { ...all, links: noLinks },
      { mediaType: 'tv', mediaId: 1399, title: 'Game of Thrones', year: '2011' }
    );

    await pressAndSettle(utils, 'external-rating-letterboxd');
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://letterboxd.com/search/Game%20of%20Thrones%202011/'
    );
  });

  it('falls back to IMDb search when no IMDb ID is available', async () => {
    const utils = renderFightClub({ ...all, imdbId: null }, { imdbId: null });

    await pressAndSettle(utils, 'external-rating-imdb');
    expect(Linking.openURL).toHaveBeenCalledWith(
      'https://www.imdb.com/find/?q=Fight%20Club%201999&s=tt'
    );
  });

  it('calls onOpenLinkError when opening a link fails', async () => {
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('no app'));
    const onOpenLinkError = jest.fn();
    const { getByTestId } = renderFightClub(all, { onOpenLinkError });

    fireEvent.press(getByTestId('external-rating-imdb'));
    await waitFor(() => expect(onOpenLinkError).toHaveBeenCalled());
  });
});
