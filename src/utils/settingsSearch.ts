import { foldForSearch } from '@/src/utils/searchText';

/** Other names people type for a region (its list shows English names only). */
const REGION_ALIASES: Record<string, string[]> = {
  GB: ['UK', 'Britain', 'Great Britain', 'England', 'Scotland', 'Wales'],
  US: ['USA', 'America', 'United States of America'],
  NL: ['Holland'],
  KR: ['Korea'],
  CZ: ['Czechia'],
  TR: ['Türkiye'],
};

/** Whether any of `texts` contains `query`, ignoring case and accents. An empty query matches. */
export function matchesSearch(query: string, texts: (string | undefined)[]): boolean {
  const folded = foldForSearch(query);
  if (!folded) return true;
  return texts.some((text) => !!text && foldForSearch(text).includes(folded));
}

export function regionMatches(query: string, region: { code: string; name: string }): boolean {
  return matchesSearch(query, [region.name, region.code, ...(REGION_ALIASES[region.code] ?? [])]);
}

export function languageMatches(
  query: string,
  language: { code: string; nativeName: string; englishName: string }
): boolean {
  return matchesSearch(query, [language.nativeName, language.englishName, language.code]);
}
