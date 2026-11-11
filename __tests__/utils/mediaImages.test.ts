import type { ImageData } from '@/src/api/tmdb';
import { buildIncludeImageLanguage, organizeMediaImages } from '@/src/utils/mediaImages';

const image = (file_path: string, iso_639_1: string | null, iso_3166_1: string | null = null) =>
  ({ file_path, iso_639_1, iso_3166_1 }) as ImageData;

describe('buildIncludeImageLanguage', () => {
  it('asks for the app language, English and images with no text', () => {
    expect(buildIncludeImageLanguage('pt-BR')).toBe('pt,en,null');
    expect(buildIncludeImageLanguage('fr-FR')).toBe('fr,en,null');
  });

  it('does not repeat English', () => {
    expect(buildIncludeImageLanguage('en-US')).toBe('en,null');
  });
});

describe('organizeMediaImages', () => {
  const images = {
    backdrops: [
      image('/b-en.jpg', 'en', 'US'),
      image('/b-none.jpg', null),
      image('/b-pt.jpg', 'pt', 'PT'),
      image('/b-none.jpg', null),
    ],
    posters: [
      image('/p-en.jpg', 'en', 'US'),
      image('/p-none.jpg', null),
      image('/p-pt-pt.jpg', 'pt', 'PT'),
      image('/p-ru.jpg', 'ru', 'RU'),
      image('/p-pt-br.jpg', 'pt', 'BR'),
      image('/p-en-2.jpg', 'en', 'US'),
    ],
  };

  it('keeps text-free backdrops and ones in the app language, in TMDB order, once each', () => {
    expect(organizeMediaImages(images, 'pt-BR').backdrops.map((b) => b.file_path)).toEqual([
      '/b-none.jpg',
      '/b-pt.jpg',
    ]);
  });

  it('keeps English title backdrops for English', () => {
    expect(organizeMediaImages(images, 'en-US').backdrops.map((b) => b.file_path)).toEqual([
      '/b-en.jpg',
      '/b-none.jpg',
    ]);
  });

  it('orders posters by language and country, then language, then English, then no text', () => {
    expect(organizeMediaImages(images, 'pt-BR').posters.map((p) => p.file_path)).toEqual([
      '/p-pt-br.jpg',
      '/p-pt-pt.jpg',
      '/p-en.jpg',
      '/p-en-2.jpg',
      '/p-none.jpg',
    ]);
  });

  it('leaves out posters in other languages', () => {
    const paths = organizeMediaImages(images, 'en-US').posters.map((p) => p.file_path);
    expect(paths).toEqual(['/p-en.jpg', '/p-en-2.jpg', '/p-none.jpg']);
  });

  it('copes with missing lists', () => {
    expect(organizeMediaImages({} as never, 'en-US')).toEqual({ backdrops: [], posters: [] });
  });
});
