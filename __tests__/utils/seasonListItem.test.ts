import { getListItemRoute } from '@/src/utils/listItemRoutes';
import {
  buildSeasonListItem,
  getSeasonEntryDisplay,
  getSeasonRuntimeMinutes,
} from '@/src/utils/seasonListItem';

const show = { id: 1396, name: 'Breaking Bad', poster_path: '/show.jpg', genres: [{ id: 18 }] };

describe('buildSeasonListItem', () => {
  it("falls back to the show's poster and the given season name", () => {
    const item = buildSeasonListItem(
      show,
      { season_number: 0, name: '', poster_path: null, air_date: null },
      'Season 0'
    );

    expect(item).toMatchObject({
      id: 1396,
      media_type: 'season',
      season_number: 0,
      season_name: 'Season 0',
      title: 'Breaking Bad · Season 0',
      poster_path: '/show.jpg',
      release_date: '',
      genre_ids: [18],
    });
    expect(item).not.toHaveProperty('runtimeMinutes');
    expect(item).not.toHaveProperty('seasonRuntimeMinutes');
  });

  it('uses the season poster, rating and the sum of known episode runtimes', () => {
    const item = buildSeasonListItem(
      show,
      {
        season_number: 3,
        name: 'Season 3',
        poster_path: '/s3.jpg',
        air_date: '2010-03-21',
        vote_average: 8.4,
        episodes: [{ runtime: 47 }, { runtime: null }, { runtime: 48 }],
      },
      'unused'
    );

    expect(item).toMatchObject({
      poster_path: '/s3.jpg',
      vote_average: 8.4,
      runtimeMinutes: 95,
      seasonRuntimeMinutes: 95,
    });
  });
});

describe('getSeasonRuntimeMinutes', () => {
  it('is undefined when no episode has a runtime yet', () => {
    expect(getSeasonRuntimeMinutes([{ runtime: null }, { runtime: 0 }])).toBeUndefined();
    expect(getSeasonRuntimeMinutes(undefined)).toBeUndefined();
  });
});

describe('getListItemRoute', () => {
  it('opens movies, shows and seasons on the right screen', () => {
    expect(getListItemRoute('/(tabs)/library', { id: 1, media_type: 'movie' })).toBe(
      '/(tabs)/library/movie/1'
    );
    expect(getListItemRoute('/(tabs)/home', { id: 2, media_type: 'tv' })).toBe('/(tabs)/home/tv/2');
    expect(
      getListItemRoute('/(tabs)/home', { id: 2, media_type: 'season', season_number: 0 })
    ).toBe('/(tabs)/home/tv/2/seasons?season=0');
    expect(getListItemRoute('/(tabs)/home', { id: 2, media_type: 'season' })).toBe(
      '/(tabs)/home/tv/2/seasons'
    );
  });
});

describe('getSeasonEntryDisplay', () => {
  const format = (n: number) => `Season ${n}`;

  it("shows the show's name with Season X under it", () => {
    expect(
      getSeasonEntryDisplay(
        {
          show_name: 'Avatar',
          title: 'Avatar · Book One: Water',
          season_number: 1,
          season_name: 'Book One: Water',
        },
        format
      )
    ).toEqual({ title: 'Avatar', seasonLabel: 'Season 1' });
  });

  it("uses TMDB's name for specials", () => {
    expect(
      getSeasonEntryDisplay(
        { show_name: 'Avatar', season_number: 0, season_name: 'Specials' },
        format
      )
    ).toEqual({ title: 'Avatar', seasonLabel: 'Specials' });
  });
});
