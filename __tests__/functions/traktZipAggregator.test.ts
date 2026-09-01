import * as fs from 'fs';
import * as path from 'path';
import AdmZip = require('adm-zip');
import {
  aggregateCustomLists,
  aggregateEpisodeHistory,
  aggregateFavorites,
  aggregateMovieHistory,
  aggregateRatings,
  aggregateWatchlist,
  buildTraktMovieWatchDocId,
  parseTraktDateToMs,
} from '../../functions/src/trakt/zipAggregator';
import {
  classifyZipEntry,
  parseTraktZipBuffer,
} from '../../functions/src/trakt/zipParser';

const SafeAdmZip = (AdmZip as unknown as { default?: typeof AdmZip }).default || AdmZip;

describe('Trakt Zip Aggregator & Parser (Stage 1)', () => {
  describe('buildTraktMovieWatchDocId', () => {
    it('generates deterministic doc IDs matching the trakt-{movieId}-{watchedAtMs} format with millisecond precision', () => {
      const docId = buildTraktMovieWatchDocId(12345, 1696161600000);
      expect(docId).toBe('trakt-12345-1696161600000');
    });

    it('handles string movieId and trims whitespace safely', () => {
      const docId = buildTraktMovieWatchDocId(' 872585 ', 1700000000123);
      expect(docId).toBe('trakt-872585-1700000000123');
    });

    it('truncates non-integer millisecond timestamps', () => {
      const docId = buildTraktMovieWatchDocId(999, 1696161600000.85);
      expect(docId).toBe('trakt-999-1696161600000');
    });
  });

  describe('parseTraktDateToMs', () => {
    it('parses ISO date strings to UTC millisecond timestamps', () => {
      const ms = parseTraktDateToMs('2023-10-01T12:00:00.000Z');
      expect(ms).toBe(Date.parse('2023-10-01T12:00:00.000Z'));
    });

    it('returns null for empty, undefined, or malformed strings', () => {
      expect(parseTraktDateToMs('')).toBeNull();
      expect(parseTraktDateToMs(null)).toBeNull();
      expect(parseTraktDateToMs(undefined)).toBeNull();
      expect(parseTraktDateToMs('invalid-date')).toBeNull();
    });

    it('accepts finite positive millisecond numbers directly', () => {
      expect(parseTraktDateToMs(1696161600000)).toBe(1696161600000);
    });
  });

  describe('aggregateMovieHistory', () => {
    it('groups multiple plays of the same movie and computes plays and max last_watched_at', () => {
      const rawEvents = [
        {
          action: 'watch',
          id: 101,
          movie: {
            ids: { imdb: 'tt0111161', slug: 'the-shawshank-redemption-1994', tmdb: 278, trakt: 1 },
            title: 'The Shawshank Redemption',
            year: 1994,
          },
          watched_at: '2022-01-01T10:00:00.000Z',
        },
        {
          action: 'watch',
          id: 102,
          movie: {
            ids: { imdb: 'tt0111161', slug: 'the-shawshank-redemption-1994', tmdb: 278, trakt: 1 },
            title: 'The Shawshank Redemption',
            year: 1994,
          },
          watched_at: '2023-05-15T20:30:00.000Z',
        },
        {
          action: 'watch',
          id: 103,
          movie: {
            ids: { imdb: 'tt1375666', slug: 'inception-2010', tmdb: 27205, trakt: 2 },
            title: 'Inception',
            year: 2010,
          },
          watched_at: '2023-06-01T18:00:00.000Z',
        },
      ];

      const { movieWatches, watchedMovies } = aggregateMovieHistory(rawEvents);

      expect(watchedMovies).toHaveLength(2);

      const shawshank = watchedMovies.find((m) => m.movie.ids.tmdb === 278);
      expect(shawshank).toBeDefined();
      expect(shawshank?.plays).toBe(2);
      expect(shawshank?.last_watched_at).toBe('2023-05-15T20:30:00.000Z');
      expect(shawshank?.movie.title).toBe('The Shawshank Redemption');
      expect(shawshank?.movie.year).toBe(1994);

      const inception = watchedMovies.find((m) => m.movie.ids.tmdb === 27205);
      expect(inception).toBeDefined();
      expect(inception?.plays).toBe(1);
      expect(inception?.last_watched_at).toBe('2023-06-01T18:00:00.000Z');

      expect(movieWatches).toHaveLength(3);
      expect(movieWatches[0].docId).toBe(`trakt-278-${Date.parse('2022-01-01T10:00:00.000Z')}`);
      expect(movieWatches[1].docId).toBe(`trakt-278-${Date.parse('2023-05-15T20:30:00.000Z')}`);
      expect(movieWatches[2].docId).toBe(`trakt-27205-${Date.parse('2023-06-01T18:00:00.000Z')}`);
    });

    it('deduplicates identical watch events for the same timestamp and movie', () => {
      const rawEvents = [
        {
          movie: { ids: { tmdb: 550 }, title: 'Fight Club', year: 1999 },
          watched_at: '2023-01-01T12:00:00.000Z',
        },
        {
          movie: { ids: { tmdb: 550 }, title: 'Fight Club', year: 1999 },
          watched_at: '2023-01-01T12:00:00.000Z',
        },
      ];

      const { movieWatches, watchedMovies } = aggregateMovieHistory(rawEvents);
      expect(watchedMovies[0].plays).toBe(1);
      expect(movieWatches).toHaveLength(1); // Unique watch document by docId
    });

    it('skips events missing tmdb IDs or with malformed dates', () => {
      const rawEvents = [
        {
          movie: { ids: { trakt: 123 }, title: 'Missing TMDB' },
          watched_at: '2023-01-01T12:00:00.000Z',
        },
        {
          movie: { ids: { tmdb: 999 }, title: 'Invalid Date' },
          watched_at: 'not-a-real-date',
        },
      ];

      const { movieWatches, watchedMovies } = aggregateMovieHistory(rawEvents);
      expect(watchedMovies).toHaveLength(0);
      expect(movieWatches).toHaveLength(0);
    });
  });

  describe('aggregateEpisodeHistory', () => {
    it('groups flat episode events into hierarchical TraktWatchedShow[] with sorted seasons and episodes', () => {
      const rawEvents = [
        {
          episode: { number: 1, season: 1, title: 'Pilot' },
          show: {
            ids: { imdb: 'tt0903747', slug: 'breaking-bad', tmdb: 1396, trakt: 1388 },
            title: 'Breaking Bad',
            year: 2008,
          },
          watched_at: '2021-01-01T20:00:00.000Z',
        },
        {
          episode: { number: 2, season: 1, title: "Cat's in the Bag..." },
          show: {
            ids: { imdb: 'tt0903747', slug: 'breaking-bad', tmdb: 1396, trakt: 1388 },
            title: 'Breaking Bad',
            year: 2008,
          },
          watched_at: '2021-01-02T21:00:00.000Z',
        },
        {
          episode: { number: 1, season: 2, title: 'Seven Thirty-Seven' },
          show: {
            ids: { imdb: 'tt0903747', slug: 'breaking-bad', tmdb: 1396, trakt: 1388 },
            title: 'Breaking Bad',
            year: 2008,
          },
          watched_at: '2022-03-01T22:00:00.000Z',
        },
      ];

      const watchedShows = aggregateEpisodeHistory(rawEvents);

      expect(watchedShows).toHaveLength(1);
      const bb = watchedShows[0];
      expect(bb.show.ids.tmdb).toBe(1396);
      expect(bb.show.title).toBe('Breaking Bad');
      expect(bb.plays).toBe(3);
      expect(bb.last_watched_at).toBe('2022-03-01T22:00:00.000Z');

      expect(bb.seasons).toHaveLength(2);
      expect(bb.seasons?.[0].number).toBe(1);
      expect(bb.seasons?.[0].episodes).toHaveLength(2);
      expect(bb.seasons?.[0].episodes?.[0].number).toBe(1);
      expect(bb.seasons?.[0].episodes?.[0].last_watched_at).toBe('2021-01-01T20:00:00.000Z');
      expect(bb.seasons?.[0].episodes?.[1].number).toBe(2);

      expect(bb.seasons?.[1].number).toBe(2);
      expect(bb.seasons?.[1].episodes?.[0].number).toBe(1);
    });

    it('tracks episode rewatches by incrementing episode plays and updating last_watched_at', () => {
      const rawEvents = [
        {
          episode: { number: 1, season: 1 },
          show: { ids: { tmdb: 1396 }, title: 'Breaking Bad' },
          watched_at: '2020-01-01T10:00:00.000Z',
        },
        {
          episode: { number: 1, season: 1 },
          show: { ids: { tmdb: 1396 }, title: 'Breaking Bad' },
          watched_at: '2023-01-01T10:00:00.000Z',
        },
      ];

      const watchedShows = aggregateEpisodeHistory(rawEvents);
      expect(watchedShows).toHaveLength(1);
      expect(watchedShows[0].plays).toBe(2);
      expect(watchedShows[0].seasons?.[0].episodes?.[0].plays).toBe(2);
      expect(watchedShows[0].seasons?.[0].episodes?.[0].last_watched_at).toBe(
        '2023-01-01T10:00:00.000Z'
      );
    });

    it('skips episode events missing season or number or show tmdb id', () => {
      const rawEvents = [
        {
          episode: { number: 1 }, // Missing season
          show: { ids: { tmdb: 1396 } },
          watched_at: '2023-01-01T10:00:00.000Z',
        },
        {
          episode: { number: 1, season: 1 },
          show: { ids: { trakt: 1388 } }, // Missing TMDB ID
          watched_at: '2023-01-01T10:00:00.000Z',
        },
      ];

      const watchedShows = aggregateEpisodeHistory(rawEvents);
      expect(watchedShows).toHaveLength(0);
    });
  });

  describe('aggregateRatings', () => {
    it('aggregates movie and show ratings and preserves the latest rating when duplicates occur', () => {
      const rawRatings = [
        {
          movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption', year: 1994 },
          rated_at: '2020-01-01T12:00:00.000Z',
          rating: 8,
          type: 'movie',
        },
        {
          movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption', year: 1994 },
          rated_at: '2023-01-01T12:00:00.000Z',
          rating: 10,
          type: 'movie',
        },
        {
          rated_at: '2022-05-01T15:00:00.000Z',
          rating: 9,
          show: { ids: { tmdb: 1396 }, title: 'Breaking Bad', year: 2008 },
          type: 'show',
        },
      ];

      const ratings = aggregateRatings(rawRatings);

      expect(ratings).toHaveLength(2);
      const movieRating = ratings.find((r) => r.type === 'movie');
      expect(movieRating?.rating).toBe(10);
      expect(movieRating?.rated_at).toBe('2023-01-01T12:00:00.000Z');

      const showRating = ratings.find((r) => r.type === 'show');
      expect(showRating?.rating).toBe(9);
      expect(showRating?.show?.ids.tmdb).toBe(1396);
    });

    it('folds season ratings into parent show rating using show tmdb id', () => {
      const rawRatings = [
        {
          rated_at: '2023-03-01T12:00:00.000Z',
          rating: 8,
          season: { ids: { tmdb: 12345 }, number: 1 },
          show: { ids: { tmdb: 1396 }, title: 'Breaking Bad', year: 2008 },
          type: 'season',
        },
      ];

      const ratings = aggregateRatings(rawRatings);

      expect(ratings).toHaveLength(1);
      expect(ratings[0].type).toBe('show');
      expect(ratings[0].show?.ids.tmdb).toBe(1396);
      expect(ratings[0].rating).toBe(8);
    });

    it('rejects invalid rating numbers (e.g. < 1, > 10, non-integers) and invalid dates', () => {
      const rawRatings = [
        {
          movie: { ids: { tmdb: 100 } },
          rated_at: '2023-01-01T12:00:00.000Z',
          rating: 0,
          type: 'movie',
        },
        {
          movie: { ids: { tmdb: 101 } },
          rated_at: '2023-01-01T12:00:00.000Z',
          rating: 11,
          type: 'movie',
        },
        {
          movie: { ids: { tmdb: 102 } },
          rated_at: '2023-01-01T12:00:00.000Z',
          rating: 7.5,
          type: 'movie',
        },
        {
          movie: { ids: { tmdb: 103 } },
          rated_at: 'invalid-date',
          rating: 9,
          type: 'movie',
        },
      ];

      const ratings = aggregateRatings(rawRatings);
      expect(ratings).toHaveLength(0);
    });
  });

  describe('aggregateWatchlist & aggregateFavorites', () => {
    it('aggregates watchlist items and deduplicates overlapping items', () => {
      const rawWatchlist = [
        {
          id: 1,
          listed_at: '2022-01-01T10:00:00.000Z',
          movie: { ids: { tmdb: 872585 }, title: 'Oppenheimer', year: 2023 },
          type: 'movie',
        },
        {
          id: 1,
          listed_at: '2023-08-01T10:00:00.000Z',
          movie: { ids: { tmdb: 872585 }, title: 'Oppenheimer', year: 2023 },
          type: 'movie',
        },
      ];

      const watchlist = aggregateWatchlist(rawWatchlist);
      expect(watchlist).toHaveLength(1);
      expect(watchlist[0].listed_at).toBe('2023-08-01T10:00:00.000Z');
      expect(watchlist[0].movie?.ids.tmdb).toBe(872585);
    });

    it('aggregates favorites and filters entries without tmdb ids', () => {
      const rawFavorites = [
        {
          listed_at: '2023-01-01T10:00:00.000Z',
          movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption' },
          type: 'movie',
        },
        {
          listed_at: '2023-01-01T10:00:00.000Z',
          movie: { ids: { trakt: 999 }, title: 'No TMDB' },
          type: 'movie',
        },
      ];

      const favorites = aggregateFavorites(rawFavorites);
      expect(favorites).toHaveLength(1);
      expect(favorites[0].movie?.ids.tmdb).toBe(278);
    });
  });

  describe('aggregateCustomLists', () => {
    it('aggregates custom lists with metadata and list items', () => {
      const rawLists = [
        {
          created_at: '2023-01-01T00:00:00.000Z',
          description: 'Best Sci-Fi of all time',
          ids: { slug: 'sci-fi-classics', trakt: 777 },
          items: [
            {
              listed_at: '2023-01-02T00:00:00.000Z',
              movie: { ids: { tmdb: 157336 }, title: 'Interstellar', year: 2014 },
              type: 'movie',
            },
            {
              listed_at: '2023-01-03T00:00:00.000Z',
              show: { ids: { tmdb: 60625 }, title: 'Rick and Morty', year: 2013 },
              type: 'show',
            },
          ],
          name: 'Sci-Fi Classics',
          privacy: 'public',
          updated_at: '2023-02-01T00:00:00.000Z',
        },
      ];

      const customLists = aggregateCustomLists(rawLists);

      expect(customLists).toHaveLength(1);
      const listObj = customLists[0];
      expect(listObj.list.name).toBe('Sci-Fi Classics');
      expect(listObj.list.ids.trakt).toBe(777);
      expect(listObj.list.privacy).toBe('public');
      expect(listObj.items).toHaveLength(2);
      expect(listObj.items[0].movie?.ids.tmdb).toBe(157336);
      expect(listObj.items[1].show?.ids.tmdb).toBe(60625);
    });
  });

  describe('classifyZipEntry', () => {
    it('correctly classifies standard and real Trakt export file names', () => {
      expect(classifyZipEntry('ratings-movies-1.json')).toBe('ratings_movies');
      expect(classifyZipEntry('ratings_movies.json')).toBe('ratings_movies');
      expect(classifyZipEntry('ratings/movies.json')).toBe('ratings_movies');

      expect(classifyZipEntry('ratings-shows-1.json')).toBe('ratings_shows');
      expect(classifyZipEntry('ratings-episodes.json')).toBe('ratings_episodes');
      expect(classifyZipEntry('ratings-seasons.json')).toBe('ratings_seasons');

      expect(classifyZipEntry('watched-history.json')).toBe('history_events');
      expect(classifyZipEntry('history.json')).toBe('history_events');
      expect(classifyZipEntry('history-movies-1.json')).toBe('history_movies');
      expect(classifyZipEntry('watched-movies.json')).toBe('history_movies');

      expect(classifyZipEntry('history-episodes-1.json')).toBe('history_episodes');
      expect(classifyZipEntry('watched-shows.json')).toBe('history_episodes');

      expect(classifyZipEntry('lists-watchlist.json')).toBe('watchlist');
      expect(classifyZipEntry('watchlist-movies-1.json')).toBe('watchlist');
      expect(classifyZipEntry('watchlist.json')).toBe('watchlist');

      expect(classifyZipEntry('lists-favorites.json')).toBe('favorites');
      expect(classifyZipEntry('favorites.json')).toBe('favorites');

      expect(classifyZipEntry('lists-lists.json')).toBe('lists_metadata');
      expect(classifyZipEntry('lists.json')).toBe('lists_metadata');
      expect(classifyZipEntry('lists-list-30504620-trakt-shows.json')).toBe('list_items');
      expect(classifyZipEntry('personal-lists/my-favorites.json')).toBe('legacy_custom_list');
      expect(classifyZipEntry('lists/top-movies.json')).toBe('legacy_custom_list');
    });

    it('ignores macOS metadata and non-json files', () => {
      expect(classifyZipEntry('__MACOSX/._ratings-movies-1.json')).toBe('ignored');
      expect(classifyZipEntry('.DS_Store')).toBe('ignored');
      expect(classifyZipEntry('README.txt')).toBe('ignored');
    });
  });

  describe('parseTraktZipBuffer (End-to-End Zip Stream Extraction)', () => {
    it('extracts and aggregates all datasets from a real Trakt export format archive', () => {
      const zip = new SafeAdmZip();

      // Granular history events
      zip.addFile(
        'watched-history.json',
        Buffer.from(
          JSON.stringify([
            {
              action: 'watch',
              id: 101,
              movie: { ids: { tmdb: 493922 }, title: 'Hereditary', year: 2018 },
              type: 'movie',
              watched_at: '2026-03-22T22:27:00.000Z',
            },
            {
              action: 'watch',
              id: 102,
              movie: { ids: { tmdb: 493922 }, title: 'Hereditary', year: 2018 },
              type: 'movie',
              watched_at: '2018-06-08T17:00:00.000Z',
            },
            {
              action: 'watch',
              episode: { ids: { tmdb: 3460128 }, number: 10, season: 1, title: 'Finale' },
              id: 103,
              show: { ids: { tmdb: 124364 }, title: 'FROM', year: 2022 },
              type: 'episode',
              watched_at: '2026-02-06T19:37:00.000Z',
            },
          ])
        )
      );

      // Ratings
      zip.addFile(
        'ratings-movies.json',
        Buffer.from(
          JSON.stringify([
            {
              movie: { ids: { tmdb: 1368166 }, title: 'The Housemaid', year: 2025 },
              rated_at: '2026-01-01T12:00:00.000Z',
              rating: 6,
              type: 'movie',
            },
          ])
        )
      );

      // Watchlist (with show and movie items, including season/episode granularity)
      zip.addFile(
        'lists-watchlist.json',
        Buffer.from(
          JSON.stringify([
            {
              id: 201,
              listed_at: '2025-01-26T07:45:16.000Z',
              season: { ids: { tmdb: 3573 }, number: 2 },
              show: { ids: { tmdb: 1396 }, title: 'Breaking Bad', year: 2008 },
              type: 'season',
            },
            {
              id: 202,
              listed_at: '2025-01-28T02:26:17.000Z',
              movie: { ids: { tmdb: 426063 }, title: 'Nosferatu', year: 2024 },
              type: 'movie',
            },
          ])
        )
      );

      // Favorites
      zip.addFile(
        'lists-favorites.json',
        Buffer.from(
          JSON.stringify([
            {
              id: 301,
              listed_at: '2025-12-22T16:36:52.000Z',
              movie: { ids: { tmdb: 812583 }, title: 'Wake Up Dead Man', year: 2025 },
              type: 'movie',
            },
          ])
        )
      );

      // Custom Lists (metadata + split item files)
      zip.addFile(
        'lists-lists.json',
        Buffer.from(
          JSON.stringify([
            {
              created_at: '2025-01-26T07:45:07.000Z',
              ids: { slug: 'trakt-shows', trakt: 30504620 },
              name: 'trakt Shows',
              privacy: 'public',
              updated_at: '2025-12-25T14:30:52.000Z',
            },
            {
              created_at: '2025-01-28T02:26:42.000Z',
              ids: { slug: 'empty-list', trakt: 99999999 },
              name: 'Empty List',
              privacy: 'private',
              updated_at: '2025-01-28T02:26:42.000Z',
            },
          ])
        )
      );

      zip.addFile(
        'lists-list-30504620-trakt-shows.json',
        Buffer.from(
          JSON.stringify([
            {
              id: 401,
              listed_at: '2025-01-28T02:27:31.000Z',
              show: { ids: { tmdb: 1429 }, title: 'Attack on Titan', year: 2013 },
              type: 'show',
            },
          ])
        )
      );

      const zipBuffer = zip.toBuffer();
      const result = parseTraktZipBuffer(zipBuffer);

      // 1 movie with 2 plays
      expect(result.watchedMovies).toHaveLength(1);
      expect(result.watchedMovies[0].movie.ids.tmdb).toBe(493922);
      expect(result.watchedMovies[0].plays).toBe(2);
      expect(result.watchedMovieEvents).toHaveLength(2);

      // 1 show with 1 episode
      expect(result.watchedShows).toHaveLength(1);
      expect(result.watchedShows[0].show.ids.tmdb).toBe(124364);
      expect(result.watchedShows[0].seasons?.[0].episodes).toHaveLength(1);

      // 1 rating
      expect(result.ratings).toHaveLength(1);
      expect(result.ratings[0].rating).toBe(6);

      // 2 watchlist items (movie + folded show)
      expect(result.watchlist).toHaveLength(2);
      expect(result.watchlist.some((item) => item.show?.ids.tmdb === 1396)).toBe(true);
      expect(result.watchlist.some((item) => item.movie?.ids.tmdb === 426063)).toBe(true);

      // 1 favorite
      expect(result.favorites).toHaveLength(1);
      expect(result.favorites[0].movie?.ids.tmdb).toBe(812583);

      // 2 custom lists (1 with items, 1 empty list handled gracefully)
      expect(result.customLists).toHaveLength(2);
      const traktShows = result.customLists.find((l) => l.list.ids.trakt === 30504620);
      expect(traktShows?.items).toHaveLength(1);
      expect(traktShows?.items[0].show?.ids.tmdb).toBe(1429);
      const emptyList = result.customLists.find((l) => l.list.ids.trakt === 99999999);
      expect(emptyList?.items).toHaveLength(0);
    });

    it('falls back to summary files when granular history events are absent', () => {
      const zip = new SafeAdmZip();

      zip.addFile(
        'watched-movies.json',
        Buffer.from(
          JSON.stringify([
            {
              last_watched_at: '2026-03-22T22:27:00.000Z',
              movie: { ids: { tmdb: 493922 }, title: 'Hereditary', year: 2018 },
              plays: 3,
            },
          ])
        )
      );

      zip.addFile(
        'watched-shows.json',
        Buffer.from(
          JSON.stringify([
            {
              last_watched_at: '2026-02-06T19:37:00.000Z',
              plays: 28,
              show: { ids: { tmdb: 124364 }, title: 'FROM', year: 2022 },
            },
          ])
        )
      );

      const zipBuffer = zip.toBuffer();
      const result = parseTraktZipBuffer(zipBuffer);

      expect(result.watchedMovies).toHaveLength(1);
      expect(result.watchedMovies[0].plays).toBe(3);
      expect(result.watchedShows).toHaveLength(1);
      expect(result.watchedShows[0].plays).toBe(28);
    });

    it('throws descriptive integrity check errors when populated files produce 0 items', () => {
      const zip = new SafeAdmZip();

      // Add watchlist with invalid items (no valid TMDB id or recognizable media)
      zip.addFile(
        'lists-watchlist.json',
        Buffer.from(
          JSON.stringify([
            { id: 999, movie: { ids: { imdb: 'unknown' } }, type: 'movie' },
          ])
        )
      );

      const zipBuffer = zip.toBuffer();
      expect(() => parseTraktZipBuffer(zipBuffer)).toThrow(
        /Trakt zip parsing integrity check failed: watchlist contained 1 items but produced 0 valid watchlist entries/
      );
    });

    const exportDir = path.resolve(__dirname, '../../trakt-export');
    const hasExportDir = fs.existsSync(exportDir);

    // Manual prerequisite: requires unzipped export JSON files located in <repo-root>/trakt-export/
    (hasExportDir ? it : it.skip)(
      'correctly extracts and aggregates real Trakt export files from trakt-export folder',
      () => {
        const zip = new SafeAdmZip();
        const files = fs.readdirSync(exportDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(exportDir, file);
          const content = fs.readFileSync(filePath);
          zip.addFile(file, content);
        }
      }

      const zipBuffer = zip.toBuffer();
      const result = parseTraktZipBuffer(zipBuffer);

      // Verify exact numbers matching OAuth mirror sync baseline:
      // 3 Movies: Nosferatu (426063), Hereditary (493922), September 5 (1211472)
      expect(result.stats.movies).toBe(3);
      expect(result.watchedMovies).toHaveLength(3);
      const movieIds = result.watchedMovies.map((m) => m.movie.ids.tmdb).sort((a, b) => (a ?? 0) - (b ?? 0));
      expect(movieIds).toEqual([426063, 493922, 1211472]);

      // 4 TV Shows: Naruto (306684), FROM (124364), Day of the Jackal (222766), Loki (84958)
      expect(result.stats.shows).toBe(4);
      expect(result.watchedShows).toHaveLength(4);
      const showIds = result.watchedShows.map((s) => s.show.ids.tmdb).sort((a, b) => (a ?? 0) - (b ?? 0));
      expect(showIds).toEqual([84958, 124364, 222766, 306684]);

      // 62 Episodes: 12 Naruto + 28 FROM + 10 Day of the Jackal + 12 Loki
      expect(result.stats.episodes).toBe(62);

      // 4 Parsed Ratings: The Housemaid (1 movie) + Breaking Bad (3 episode ratings)
      // Note: During sync to Firestore, reconcileRatings folds the 3 episode ratings onto tv-1396, resulting in 2 ratings records
      expect(result.stats.ratings).toBe(4);
      expect(result.ratings).toHaveLength(4);

      // 7 Watchlist Items:
      // Movies (4): Moana 2, Star Trek Section 31, Gladiator II, The Substance
      // Shows (3): Breaking Bad (folded from season/episode entries), Attack on Titan, IT: Welcome to Derry
      expect(result.stats.watchlistItems).toBe(7);
      expect(result.watchlist).toHaveLength(7);

      // 1 Favorite: Wake Up Dead Man (movie: 812583)
      expect(result.stats.favorites).toBe(1);
      expect(result.favorites[0].movie?.ids.tmdb).toBe(812583);

      // 2 Custom Lists: trakt Shows (30504620), Follow me (30520152)
      expect(result.stats.customLists).toBe(2);
      expect(result.customLists).toHaveLength(2);
      const listSlugs = result.customLists.map((l) => l.list.ids.slug).sort();
      expect(listSlugs).toEqual(['follow-me', 'trakt-shows']);

      // Check items in custom lists
      const traktShowsList = result.customLists.find((l) => l.list.ids.slug === 'trakt-shows');
      expect(traktShowsList?.items.length).toBeGreaterThan(0);
      const followMeList = result.customLists.find((l) => l.list.ids.slug === 'follow-me');
      expect(followMeList?.items.length).toBeGreaterThan(0);

      // Granular movie watches (7 watches: 3 for Nosferatu, 3 for Hereditary, 1 for September 5)
      expect(result.stats.movieWatches).toBe(7);
      expect(result.watchedMovieEvents).toHaveLength(7);
    });

    describe('decompressed size limits', () => {
      it('throws an error when a single zip entry exceeds maxEntrySizeBytes', () => {
        const zip = new SafeAdmZip();
        const moviePayload = JSON.stringify([
          {
            action: 'watch',
            movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption', year: 1994 },
            watched_at: '2023-01-01T12:00:00.000Z',
          },
        ]);
        zip.addFile('history-movies-1.json', Buffer.from(moviePayload));
        const zipBuffer = zip.toBuffer();

        expect(() =>
          parseTraktZipBuffer(zipBuffer, {
            maxEntrySizeBytes: 20, // artificially small limit
          })
        ).toThrow(/decompressed size.*exceeds the maximum allowed limit/i);
      });

      it('throws an error when aggregate uncompressed bytes exceed maxTotalUncompressedSizeBytes', () => {
        const zip = new SafeAdmZip();
        const moviePayload = JSON.stringify([
          {
            action: 'watch',
            movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption', year: 1994 },
            watched_at: '2023-01-01T12:00:00.000Z',
          },
        ]);
        const ratingsPayload = JSON.stringify([
          {
            movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption', year: 1994 },
            rated_at: '2023-01-01T12:00:00.000Z',
            rating: 10,
            type: 'movie',
          },
        ]);
        zip.addFile('history-movies-1.json', Buffer.from(moviePayload));
        zip.addFile('ratings-movies-1.json', Buffer.from(ratingsPayload));
        const zipBuffer = zip.toBuffer();

        expect(() =>
          parseTraktZipBuffer(zipBuffer, {
            maxEntrySizeBytes: 10 * 1024,
            maxTotalUncompressedSizeBytes: 50, // artificially small aggregate limit
          })
        ).toThrow(/aggregate decompressed size.*exceeds the maximum allowed limit/i);
      });
    });
  });
});
