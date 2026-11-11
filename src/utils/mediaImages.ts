import type { ImageData } from '@/src/api/tmdb';

export interface MediaImages {
  backdrops: ImageData[];
  posters: ImageData[];
}

const splitLanguage = (appLanguage: string) => {
  const [language = 'en', country] = appLanguage.split('-');
  return { language: language.toLowerCase(), country: country?.toUpperCase() };
};

/**
 * The `include_image_language` value for a TMDB `/images` request. On its own, the `language`
 * param returns only images tagged with that exact language and country, which leaves out the
 * text-free backdrops (almost all of them) and every poster tagged with another country. This asks
 * for the app language, English as a fallback, and images with no language.
 */
export function buildIncludeImageLanguage(appLanguage: string): string {
  const { language } = splitLanguage(appLanguage);
  return Array.from(new Set([language, 'en', 'null'])).join(',');
}

const dedupe = (images: ImageData[]) => {
  const seen = new Set<string>();
  return images.filter((image) => {
    if (!image.file_path || seen.has(image.file_path)) return false;
    seen.add(image.file_path);
    return true;
  });
};

/**
 * Sorts a title's images for the app language:
 * - Backdrops: those with no text plus those in the app language, in TMDB's order (highest rated
 *   first). English title-text backdrops are dropped for other languages.
 * - Posters: the app language and country first (pt-BR before pt-PT for Brazilian Portuguese),
 *   then the app language, then English, then posters with no text. TMDB's order is kept within
 *   each group.
 */
export function organizeMediaImages(images: MediaImages, appLanguage: string): MediaImages {
  const { language, country } = splitLanguage(appLanguage);

  const backdrops = dedupe(images.backdrops ?? []).filter(
    (image) => !image.iso_639_1 || image.iso_639_1 === language
  );

  const posterRank = (image: ImageData) => {
    if (image.iso_639_1 === language) {
      return country && image.iso_3166_1 === country ? 0 : 1;
    }
    if (image.iso_639_1 === 'en') return 2;
    if (!image.iso_639_1) return 3;
    return 4;
  };
  const posters = dedupe(images.posters ?? [])
    .map((image, index) => ({ image, index, rank: posterRank(image) }))
    .filter(({ rank }) => rank < 4)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ image }) => image);

  return { backdrops, posters };
}
