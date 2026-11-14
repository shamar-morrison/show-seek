import { getListEntrySummary } from '@/src/utils/listEntryDisplay';
import type { TFunction } from 'i18next';

const t = ((key: string, params?: Record<string, unknown>) => {
  if (key === 'media.seasonNumber') return `Season ${params?.number}`;
  if (key === 'media.seasonEpisode') return `S${params?.season}E${params?.episode}`;
  return key;
}) as unknown as TFunction;

describe('getListEntrySummary', () => {
  it('uses the title for a movie or a show', () => {
    expect(getListEntrySummary({ media_type: 'movie', title: 'Inception' }, t)).toBe('Inception');
    expect(getListEntrySummary({ media_type: 'tv', title: '', name: 'Dark' }, t)).toBe('Dark');
  });

  it('puts the season before the show', () => {
    expect(
      getListEntrySummary(
        {
          media_type: 'season',
          show_name: 'Breaking Bad',
          title: 'Breaking Bad · Season 2',
          season_number: 2,
          season_name: 'Season 2',
        },
        t
      )
    ).toBe('Season 2 · Breaking Bad');
  });

  it("uses TMDB's name for specials", () => {
    expect(
      getListEntrySummary(
        {
          media_type: 'season',
          show_name: 'Doctor Who',
          season_number: 0,
          season_name: 'Specials',
        },
        t
      )
    ).toBe('Specials · Doctor Who');
  });

  it('puts the episode code before the show, without the episode name', () => {
    expect(
      getListEntrySummary(
        {
          media_type: 'episode',
          show_name: 'Breaking Bad',
          title: 'Breaking Bad · S2E12 · Phoenix',
          season_number: 2,
          episode_number: 12,
        },
        t
      )
    ).toBe('S2E12 · Breaking Bad');
  });

  it("falls back to the combined title when the show's name wasn't saved", () => {
    expect(
      getListEntrySummary(
        {
          media_type: 'episode',
          title: 'Breaking Bad · S2E12 · Phoenix',
          season_number: 2,
          episode_number: 12,
        },
        t
      )
    ).toBe('Breaking Bad · S2E12 · Phoenix');
  });
});
