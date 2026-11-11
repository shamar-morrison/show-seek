import type { Video } from '@/src/api/tmdb';
import {
  buildIncludeVideoLanguage,
  groupVideosByType,
  organizeVideos,
} from '@/src/utils/mediaVideos';

const video = (key: string, overrides: Partial<Video> = {}): Video => ({
  id: key,
  key,
  name: key,
  site: 'YouTube',
  type: 'Trailer',
  iso_639_1: 'en',
  ...overrides,
});

describe('buildIncludeVideoLanguage', () => {
  it('asks for the app language, English and videos with no language', () => {
    expect(buildIncludeVideoLanguage('fr-FR')).toBe('fr,en,null');
    expect(buildIncludeVideoLanguage('en-US')).toBe('en,null');
  });
});

describe('organizeVideos', () => {
  it('puts the app language first, then English, then others', () => {
    const videos = [
      video('en'),
      video('de', { iso_639_1: 'de' }),
      video('fr', { iso_639_1: 'fr' }),
    ];
    expect(organizeVideos(videos, 'fr-FR').map((v) => v.key)).toEqual(['fr', 'en', 'de']);
  });

  it('puts official videos first, then the newest', () => {
    const videos = [
      video('old', { published_at: '2020-01-01T00:00:00.000Z' }),
      video('new', { published_at: '2024-01-01T00:00:00.000Z' }),
      video('official', { official: true, published_at: '2019-01-01T00:00:00.000Z' }),
    ];
    expect(organizeVideos(videos, 'en-US').map((v) => v.key)).toEqual(['official', 'new', 'old']);
  });

  it('drops videos the player cannot play and repeats', () => {
    const videos = [video('a'), video('b', { site: 'Vimeo' }), video('a')];
    expect(organizeVideos(videos, 'en-US').map((v) => v.key)).toEqual(['a']);
  });
});

describe('groupVideosByType', () => {
  it('groups by type in tab order, leaving out empty types and keeping unknown ones last', () => {
    const groups = groupVideosByType([
      video('c1', { type: 'Clip' }),
      video('x', { type: 'Recap' }),
      video('t1'),
      video('b1', { type: 'Behind the Scenes' }),
      video('t2'),
    ]);
    expect(groups.map((group) => [group.type, group.videos.map((v) => v.key)])).toEqual([
      ['Trailer', ['t1', 't2']],
      ['Clip', ['c1']],
      ['Behind the Scenes', ['b1']],
      ['Recap', ['x']],
    ]);
  });
});
