import type { ListMediaItem } from '@/src/services/ListService';
import { getEpisodeEntryDisplay } from '@/src/utils/episodeListItem';
import { getListEntryDisplay } from '@/src/utils/listEntryDisplay';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  filterMediaItems,
  getListItemMediaKey,
  getStoredListItemRuntime,
  getUnstampedListItemRuntimeKey,
} from '@/src/utils/listFilters';
import { getListItemRoute } from '@/src/utils/listItemRoutes';
import { collapseSeasonsToShows } from '@/src/utils/listItemShows';
import { compareListItemTitles, getItemRuntime, getItemUserRating } from '@/src/utils/listSort';
import type { TFunction } from 'i18next';

const item = (overrides: Partial<ListMediaItem>): ListMediaItem =>
  ({
    title: '',
    poster_path: null,
    vote_average: 0,
    release_date: '',
    addedAt: 0,
    ...overrides,
  }) as ListMediaItem;

const movie = item({ id: 1, media_type: 'movie', title: 'Alien', runtimeMinutes: 117 });
const show = item({ id: 1396, media_type: 'tv', title: 'Breaking Bad', genre_ids: [18] });
const season = (n: number) =>
  item({
    id: 1396,
    media_type: 'season',
    season_number: n,
    show_name: 'Breaking Bad',
    title: `Breaking Bad · Season ${n}`,
    genre_ids: [18],
  });
const episode = (s: number, e: number, overrides: Partial<ListMediaItem> = {}) =>
  item({
    id: 1396,
    media_type: 'episode',
    season_number: s,
    episode_number: e,
    show_name: 'Breaking Bad',
    episode_name: `Episode ${e}`,
    title: `Breaking Bad · S${s}E${e} · Episode ${e}`,
    genre_ids: [18],
    ...overrides,
  });

const t = ((key: string, options?: Record<string, unknown>) => {
  if (key === 'media.seasonNumber') return `Season ${options?.number}`;
  if (key === 'media.seasonEpisode') return `S${options?.season}E${options?.episode}`;
  return key;
}) as unknown as TFunction;

describe('episode entry display', () => {
  it("shows the show's name, then the episode code and name", () => {
    expect(getListEntryDisplay(episode(2, 12, { episode_name: 'Phoenix' }), t)).toEqual({
      title: 'Breaking Bad',
      label: 'S2E12 · Phoenix',
    });
  });

  it('shows the code alone when the episode name is not known', () => {
    expect(
      getEpisodeEntryDisplay(
        { show_name: 'Breaking Bad', season_number: 0, episode_number: 3, episode_name: ' ' },
        (s, e) => `S${s}E${e}`
      )
    ).toEqual({ title: 'Breaking Bad', episodeLabel: 'S0E3' });
  });

  it('falls back to the combined title when the show name is missing', () => {
    const display = getListEntryDisplay(
      episode(1, 1, { show_name: undefined, title: 'Breaking Bad · S1E1' }),
      t
    );
    expect(display?.title).toBe('Breaking Bad · S1E1');
  });

  it('labels seasons too, and gives movies and shows no entry display', () => {
    expect(getListEntryDisplay(season(2), t)).toEqual({
      title: 'Breaking Bad',
      label: 'Season 2',
    });
    expect(getListEntryDisplay(movie, t)).toBeNull();
    expect(getListEntryDisplay(show, t)).toBeNull();
  });
});

describe('episode entry routes', () => {
  it('opens the episode screen', () => {
    expect(getListItemRoute('/(tabs)/library', episode(2, 12))).toBe(
      '/(tabs)/library/tv/1396/season/2/episode/12'
    );
    expect(getListItemRoute('/(tabs)/home', episode(0, 0))).toBe(
      '/(tabs)/home/tv/1396/season/0/episode/0'
    );
  });

  it("opens the show's seasons when the episode has no usable numbers", () => {
    expect(getListItemRoute('/(tabs)/library', episode(2, 12, { episode_number: undefined }))).toBe(
      '/(tabs)/library/tv/1396/seasons'
    );
  });
});

describe('episode list entries in filters and sort', () => {
  it('keys each episode apart from its show and season', () => {
    expect(getListItemMediaKey(episode(2, 12))).toBe('episode:1396:2:12');
    expect(getListItemMediaKey(season(2))).toBe('season:1396:2');
    expect(
      getUnstampedListItemRuntimeKey({
        mediaType: 'episode',
        mediaId: 1396,
        seasonNumber: 2,
        episodeNumber: 12,
      })
    ).toBe('episode:1396:2:12');
  });

  it("only trusts an episode's own runtime field", () => {
    expect(getStoredListItemRuntime(episode(1, 1, { runtimeMinutes: 58 }))).toBeUndefined();
    expect(
      getStoredListItemRuntime(episode(1, 1, { runtimeMinutes: 47, episodeRuntimeMinutes: 47 }))
    ).toBe(47);
    expect(getItemRuntime(episode(1, 2), new Map([['episode:1396:1:2', 48]]))).toBe(48);
  });

  it('uses the episode rating for rating sort and filters', () => {
    const ratings = new Map([
      ['episode:1396:2:12', 10],
      ['tv:1396', 6],
    ]);
    expect(getItemUserRating(episode(2, 12), ratings)).toBe(10);
    expect(
      filterMediaItems(
        [show, episode(2, 12), episode(2, 13)],
        { ...DEFAULT_WATCH_STATUS_FILTERS, userRating: 8 },
        { userRatings: ratings }
      )
    ).toEqual([episode(2, 12)]);
  });

  it('filters by the Episodes type, and genre filters keep episodes', () => {
    const items = [movie, show, season(1), episode(1, 1)];
    expect(
      filterMediaItems(items, { ...DEFAULT_WATCH_STATUS_FILTERS, mediaType: 'episode' })
    ).toEqual([episode(1, 1)]);
    expect(filterMediaItems(items, { ...DEFAULT_WATCH_STATUS_FILTERS, genres: [18] })).toEqual([
      show,
      season(1),
      episode(1, 1),
    ]);
  });

  it('sorts the show first, then each season followed by its episodes in order', () => {
    const sorted = [
      episode(2, 10),
      season(2),
      movie,
      episode(1, 3),
      episode(2, 9),
      show,
      season(1),
    ].sort((a, b) => compareListItemTitles(a, b, 1));
    expect(sorted.map((entry) => entry.title)).toEqual([
      'Alien',
      'Breaking Bad',
      'Breaking Bad · Season 1',
      'Breaking Bad · S1E3 · Episode 3',
      'Breaking Bad · Season 2',
      'Breaking Bad · S2E9 · Episode 9',
      'Breaking Bad · S2E10 · Episode 10',
    ]);
  });
});

describe('collapseSeasonsToShows with episodes', () => {
  it('counts episodes as their show, once, without episode fields', () => {
    const collapsed = collapseSeasonsToShows([
      movie,
      episode(1, 1, { episodeRuntimeMinutes: 47, still_path: '/still.jpg' }),
      season(2),
      episode(2, 12),
    ]);

    expect(collapsed).toHaveLength(2);
    expect(collapsed[1]).toMatchObject({ id: 1396, media_type: 'tv', title: 'Breaking Bad' });
    expect(collapsed[1].episode_number).toBeUndefined();
    expect(collapsed[1].episode_name).toBeUndefined();
    expect(collapsed[1].still_path).toBeUndefined();
    expect(collapsed[1].episodeRuntimeMinutes).toBeUndefined();
    expect(collapsed[1].release_date).toBe('');
  });

  it('keeps the listed show and drops its episodes', () => {
    expect(collapseSeasonsToShows([episode(1, 1), show])).toEqual([show]);
  });
});
