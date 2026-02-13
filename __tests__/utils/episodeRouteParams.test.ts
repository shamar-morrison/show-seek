import { parseEpisodeRouteParams } from '@/src/utils/episodeRouteParams';

describe('episodeRouteParams', () => {
  it('returns valid flags for a regular episode route', () => {
    const result = parseEpisodeRouteParams({
      id: '1399',
      seasonNum: '1',
      episodeNum: '1',
    });

    expect(result.tvId).toBe(1399);
    expect(result.seasonNumber).toBe(1);
    expect(result.episodeNumber).toBe(1);
    expect(result.hasValidTvId).toBe(true);
    expect(result.hasValidSeasonNumber).toBe(true);
    expect(result.hasValidEpisodeNumber).toBe(true);
    expect(result.hasValidEpisodeRoute).toBe(true);
  });

  it('treats season 0 as valid for specials', () => {
    const result = parseEpisodeRouteParams({
      id: '1399',
      seasonNum: '0',
      episodeNum: '1',
    });

    expect(result.seasonNumber).toBe(0);
    expect(result.hasValidSeasonNumber).toBe(true);
    expect(result.hasValidEpisodeRoute).toBe(true);
  });

  it('marks negative season numbers as invalid', () => {
    const result = parseEpisodeRouteParams({
      id: '1399',
      seasonNum: '-1',
      episodeNum: '1',
    });

    expect(result.hasValidSeasonNumber).toBe(false);
    expect(result.hasValidEpisodeRoute).toBe(false);
  });

  it('marks episode 0 as invalid', () => {
    const result = parseEpisodeRouteParams({
      id: '1399',
      seasonNum: '0',
      episodeNum: '0',
    });

    expect(result.hasValidEpisodeNumber).toBe(false);
    expect(result.hasValidEpisodeRoute).toBe(false);
  });

  it('marks non-numeric params as invalid', () => {
    const result = parseEpisodeRouteParams({
      id: 'show',
      seasonNum: 'specials',
      episodeNum: 'pilot',
    });

    expect(result.hasValidTvId).toBe(false);
    expect(result.hasValidSeasonNumber).toBe(false);
    expect(result.hasValidEpisodeNumber).toBe(false);
    expect(result.hasValidEpisodeRoute).toBe(false);
  });
});
