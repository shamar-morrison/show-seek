import {
  buildOpenWithFallbackUrl,
  buildOpenWithUrl,
  buildTraktAppUrlFromWeb,
} from '@/src/utils/openWithLinks';

describe('openWithLinks', () => {
  it('builds IMDb direct URL when imdbId exists', () => {
    const url = buildOpenWithUrl({
      serviceId: 'imdb',
      mediaType: 'movie',
      mediaId: 550,
      title: 'Fight Club',
      imdbId: 'tt0137523',
    });

    expect(url).toBe('https://www.imdb.com/title/tt0137523/');
  });

  it('falls back to IMDb search URL when imdbId is missing', () => {
    const url = buildOpenWithUrl({
      serviceId: 'imdb',
      mediaType: 'movie',
      mediaId: 550,
      title: 'Fight Club',
      year: '1999',
    });

    expect(url).toBe('https://www.imdb.com/find/?q=Fight%20Club%201999&s=tt');
  });

  it('builds Trakt direct URL when slug exists', () => {
    const url = buildOpenWithUrl({
      serviceId: 'trakt',
      mediaType: 'tv',
      mediaId: 1399,
      title: 'Game of Thrones',
      traktSlug: 'game-of-thrones',
    });

    expect(url).toBe('https://trakt.tv/shows/game-of-thrones');
  });

  it('falls back to Trakt search URL when slug is missing', () => {
    const url = buildOpenWithUrl({
      serviceId: 'trakt',
      mediaType: 'tv',
      mediaId: 1399,
      title: 'Game of Thrones',
      year: '2011',
    });

    expect(url).toBe('https://trakt.tv/search/shows?query=Game%20of%20Thrones%202011');
  });

  it('builds TMDB direct URL for movies and TV', () => {
    const movieUrl = buildOpenWithUrl({
      serviceId: 'tmdb',
      mediaType: 'movie',
      mediaId: 550,
      title: 'Fight Club',
    });
    const tvUrl = buildOpenWithUrl({
      serviceId: 'tmdb',
      mediaType: 'tv',
      mediaId: 1399,
      title: 'Game of Thrones',
    });

    expect(movieUrl).toBe('https://www.themoviedb.org/movie/550');
    expect(tvUrl).toBe('https://www.themoviedb.org/tv/1399');
  });

  it('encodes query for wikipedia, rotten tomatoes, metacritic, and web search fallback URLs', () => {
    const params = {
      mediaType: 'movie' as const,
      title: 'Spider-Man: No Way Home',
      year: '2021',
    };

    expect(
      buildOpenWithFallbackUrl({
        serviceId: 'wikipedia',
        ...params,
      })
    ).toBe(
      'https://en.wikipedia.org/w/index.php?search=Spider-Man%3A%20No%20Way%20Home%202021'
    );

    expect(
      buildOpenWithFallbackUrl({
        serviceId: 'rottenTomatoes',
        ...params,
      })
    ).toBe('https://www.rottentomatoes.com/search?search=Spider-Man%3A%20No%20Way%20Home%202021');

    expect(
      buildOpenWithFallbackUrl({
        serviceId: 'metacritic',
        ...params,
      })
    ).toBe('https://www.metacritic.com/search/Spider-Man%3A%20No%20Way%20Home%202021/');

    expect(
      buildOpenWithFallbackUrl({
        serviceId: 'webSearch',
        ...params,
      })
    ).toBe('https://www.google.com/search?q=Spider-Man%3A%20No%20Way%20Home%202021');
  });

  it('builds a trakt app deep link from web URL', () => {
    expect(buildTraktAppUrlFromWeb('https://trakt.tv/movies/fight-club-1999')).toBe(
      'trakt://movies/fight-club-1999'
    );
  });
});
