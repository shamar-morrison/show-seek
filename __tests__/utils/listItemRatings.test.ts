import {
  applySavedListRatings,
  getFreshRating,
  getListRatingCandidates,
  getListRatingTargets,
  getListRatingUpdate,
  LIST_RATING_RECENT_WINDOW_DAYS,
  MAX_LIST_RATING_LOOKUPS,
  rememberFreshRating,
  resetFreshRatingsForTests,
  toDisplayedRating,
} from '@/src/utils/listItemRatings';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-11-13T12:00:00.000Z');
const daysFromNow = (days: number) => new Date(NOW + days * DAY_MS).toISOString().slice(0, 10);

const movie = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  media_type: 'movie',
  title: `Movie ${id}`,
  poster_path: null,
  vote_average: 7.3,
  release_date: daysFromNow(-10),
  addedAt: 1,
  ...extra,
});

const show = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  media_type: 'tv',
  title: `Show ${id}`,
  name: `Show ${id}`,
  poster_path: null,
  vote_average: 8.1,
  release_date: '',
  first_air_date: daysFromNow(-20),
  addedAt: 1,
  ...extra,
});

const list = (id: string, items: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id, name: id, createdAt: 1, items, storedItemKeys: {}, ...extra }) as any;

describe('getListRatingUpdate', () => {
  it('returns the fresh rating only when the shown value changes', () => {
    expect(getListRatingUpdate(7.3, 6.3)).toBe(6.3);
    expect(getListRatingUpdate(7.31, 7.34)).toBeNull();
    expect(getListRatingUpdate(7.34, 7.36)).toBe(7.36);
    expect(toDisplayedRating(7.36)).toBe('7.4');
  });

  it('replaces "no votes yet" once a title is rated, but never a rating with 0', () => {
    expect(getListRatingUpdate(0, 6.5)).toBe(6.5);
    expect(getListRatingUpdate(6.5, 0)).toBeNull();
    expect(getListRatingUpdate(0, 0)).toBeNull();
  });

  it('leaves entries without a stored rating to the server, and ignores bad values', () => {
    expect(getListRatingUpdate(undefined, 6.5)).toBeNull();
    expect(getListRatingUpdate(null, 6.5)).toBeNull();
    expect(getListRatingUpdate(7, Number.NaN)).toBeNull();
    expect(getListRatingUpdate(7, undefined)).toBeNull();
    expect(getListRatingUpdate(7, -1)).toBeNull();
  });
});

describe('getListRatingTargets', () => {
  it('finds every saved copy of a title, where each is stored', () => {
    const lists = [
      list('watchlist', { 'movie-1': movie(1) }),
      list(
        'big',
        { 'movie-1': movie(1, { vote_average: 6 }) },
        { overflowItemPages: { 'movie-1': 2 } }
      ),
      list(
        'legacy',
        { 'movie-1': movie(1) },
        { storedItemKeys: { 'movie-1': '1' }, overflowItemPages: { '1': 1 } }
      ),
      list('other', { 'movie-2': movie(2), 'tv-1': show(1) }),
    ];

    expect(getListRatingTargets(lists, 'movie', 1)).toEqual([
      {
        listId: 'watchlist',
        itemKey: 'movie-1',
        storedKey: 'movie-1',
        page: 0,
        mediaType: 'movie',
        mediaId: 1,
        storedRating: 7.3,
      },
      {
        listId: 'big',
        itemKey: 'movie-1',
        storedKey: 'movie-1',
        page: 2,
        mediaType: 'movie',
        mediaId: 1,
        storedRating: 6,
      },
      {
        listId: 'legacy',
        itemKey: 'movie-1',
        storedKey: '1',
        page: 1,
        mediaType: 'movie',
        mediaId: 1,
        storedRating: 7.3,
      },
    ]);
  });

  it('skips lists that cannot say where entries are stored, and entries without a rating', () => {
    const lists = [
      list('old-cache', { 'movie-1': movie(1) }, { storedItemKeys: undefined }),
      list('unenriched', { 'movie-1': movie(1, { vote_average: undefined }) }),
      list('broken', { 'movie-1': { media_type: 'movie' } }),
    ];

    expect(getListRatingTargets(lists, 'movie', 1)).toEqual([]);
  });

  it('does not mix up a movie and a show with the same id', () => {
    const lists = [list('watchlist', { 'movie-1': movie(1), 'tv-1': show(1) })];

    expect(getListRatingTargets(lists, 'tv', 1)).toEqual([
      expect.objectContaining({ itemKey: 'tv-1', mediaType: 'tv', storedRating: 8.1 }),
    ]);
  });
});

describe('getListRatingCandidates', () => {
  it('picks recent and upcoming movies and shows, closest to today first', () => {
    const items = {
      'movie-1': movie(1, { release_date: daysFromNow(-100) }),
      'movie-2': movie(2, { release_date: daysFromNow(-3) }),
      'movie-3': movie(3, { release_date: daysFromNow(30) }),
      'tv-4': show(4, { first_air_date: daysFromNow(-10) }),
      'movie-5': movie(5, { release_date: daysFromNow(-(LIST_RATING_RECENT_WINDOW_DAYS + 1)) }),
      'movie-6': movie(6, { release_date: '' }),
      'movie-7': movie(7, { release_date: 'not a date' }),
      'movie-8': movie(8, { vote_average: undefined }),
      'season-4-1': {
        id: 4,
        media_type: 'season',
        season_number: 1,
        vote_average: 7,
        release_date: daysFromNow(-1),
      },
      'episode-4-1-1': {
        id: 4,
        media_type: 'episode',
        season_number: 1,
        episode_number: 1,
        vote_average: 7,
        release_date: daysFromNow(-1),
      },
    };

    const candidates = getListRatingCandidates(list('watchlist', items), NOW);

    expect(candidates.map((candidate) => candidate.itemKey)).toEqual([
      'movie-2',
      'tv-4',
      'movie-3',
      'movie-1',
    ]);
  });

  it('dates a show by its first air date, falling back to its release date', () => {
    const items = {
      'tv-1': show(1, { first_air_date: '', release_date: daysFromNow(-5) }),
      'tv-2': show(2, { first_air_date: daysFromNow(-400), release_date: daysFromNow(-5) }),
    };

    expect(getListRatingCandidates(list('watchlist', items), NOW).map((c) => c.itemKey)).toEqual([
      'tv-1',
    ]);
  });

  it(`checks at most ${MAX_LIST_RATING_LOOKUPS} titles, the ones closest to today`, () => {
    const items = Object.fromEntries(
      Array.from({ length: MAX_LIST_RATING_LOOKUPS + 5 }, (_, index) => [
        `movie-${index}`,
        movie(index, { release_date: daysFromNow(-index) }),
      ])
    );

    const candidates = getListRatingCandidates(list('watchlist', items), NOW);

    expect(candidates).toHaveLength(MAX_LIST_RATING_LOOKUPS);
    expect(candidates[0].itemKey).toBe('movie-0');
    expect(candidates.at(-1)?.itemKey).toBe(`movie-${MAX_LIST_RATING_LOOKUPS - 1}`);
  });

  it('locates legacy and overflow entries, and checks nothing for a list cached without stored keys', () => {
    const legacy = list(
      'watchlist',
      { 'movie-1': movie(1) },
      { storedItemKeys: { 'movie-1': '1' }, overflowItemPages: { '1': 3 } }
    );

    expect(getListRatingCandidates(legacy, NOW)).toEqual([
      expect.objectContaining({ itemKey: 'movie-1', storedKey: '1', page: 3 }),
    ]);
    expect(
      getListRatingCandidates(
        list('watchlist', { 'movie-1': movie(1) }, { storedItemKeys: undefined }),
        NOW
      )
    ).toEqual([]);
  });
});

describe('session ratings', () => {
  beforeEach(() => resetFreshRatingsForTests());

  it('remembers fresh ratings per movie or show', () => {
    rememberFreshRating('movie', 1, 6.3);
    rememberFreshRating('tv', 2, Number.NaN);

    expect(getFreshRating('movie', 1)).toBe(6.3);
    expect(getFreshRating('tv', 1)).toBeUndefined();
    expect(getFreshRating('tv', 2)).toBeUndefined();
  });
});

describe('applySavedListRatings', () => {
  it('updates only the saved entries, keeping everything else as it was', () => {
    const watchlist = list('watchlist', { 'movie-1': movie(1), 'movie-2': movie(2) });
    const other = list('other', { 'movie-1': movie(1) });
    const lists = [watchlist, other];

    const updated = applySavedListRatings(
      lists,
      new Map([
        [
          'watchlist',
          new Map([
            ['movie-1', 6.3],
            ['movie-9', 5],
          ]),
        ],
      ])
    )!;

    expect(updated[0].items['movie-1']).toEqual({ ...movie(1), vote_average: 6.3 });
    expect(updated[0].items['movie-2']).toBe(watchlist.items['movie-2']);
    expect(updated[0].items['movie-9']).toBeUndefined();
    expect(updated[1]).toBe(other);
  });

  it('keeps a list as it was when nothing in it changes', () => {
    const watchlist = list('watchlist', { 'movie-1': movie(1) });

    const updated = applySavedListRatings(
      [watchlist],
      new Map([['watchlist', new Map([['movie-1', 7.3]])]])
    )!;

    expect(updated[0]).toBe(watchlist);
    expect(applySavedListRatings(undefined, new Map())).toBeUndefined();
  });
});
