import {
  AWARD_NAME_PATTERNS,
  normalizeTalkShowTitle,
  TALK_AWARDS_BLOCKLIST_IDS,
  TALK_AWARDS_TITLE_SET,
  TALK_SHOW_GENRE_IDS,
} from '@/src/constants/talkShowsBlocklist';

interface TalkShowCandidate {
  id?: number;
  /** TV items carry `name`; movie/search items may carry `title`. */
  name?: string | null;
  title?: string | null;
  media_type?: string | null;
  genre_ids?: number[] | null;
}

/**
 * Synchronous predicate: true when the item is a talk show, late-night /
 * daytime talk, news-talk program, aftershow or award ceremony that the
 * `hideTalkShowsAndAwards` preference should remove from browse surfaces.
 *
 * Precision rules (scripted shows must never match):
 * - Movies are never matched: explicit `media_type === 'movie'` short-circuits,
 *   and untyped items without a TV `name` resolve to movie (same convention as
 *   `useContentFilter`) so a movie `title` alone can never match.
 * - Genre layer matches only Talk (10767) / News (10763). Reality and
 *   War & Politics are intentionally excluded.
 * - Title layer uses exact normalized full-title matches plus ceremony
 *   regexes tested against the title only, never overviews.
 * - Fail-open: missing id/genres/title never matches.
 *
 * Zero-cost design: `Set.has` lookups, pre-compiled regexes with
 * short-circuit, no allocations on the hot path (the normalized title is
 * only built when genre and ID both miss).
 */
export const isTalkOrAwardsShow = (item: TalkShowCandidate | null | undefined): boolean => {
  if (!item) return false;
  // Movies (Oscar winners included) are never talk shows. List items without
  // an explicit `media_type` resolve the same way `useContentFilter` does:
  // only items carrying a TV `name` are candidates.
  if (item.media_type === 'movie') return false;
  if (item.media_type !== 'tv' && typeof item.name !== 'string') return false;

  const genreIds = item.genre_ids;
  if (genreIds) {
    for (let i = 0; i < genreIds.length; i += 1) {
      const genreId = genreIds[i];
      // Linear scan over 2 entries avoids Set allocation/lookup overhead.
      if (genreId === TALK_SHOW_GENRE_IDS[0] || genreId === TALK_SHOW_GENRE_IDS[1]) {
        return true;
      }
    }
  }

  if (typeof item.id === 'number' && TALK_AWARDS_BLOCKLIST_IDS.has(item.id)) {
    return true;
  }

  const rawTitle = item.name ?? item.title;
  if (typeof rawTitle !== 'string' || rawTitle.length === 0) return false;

  if (TALK_AWARDS_TITLE_SET.has(normalizeTalkShowTitle(rawTitle))) return true;

  for (let i = 0; i < AWARD_NAME_PATTERNS.length; i += 1) {
    if (AWARD_NAME_PATTERNS[i].test(rawTitle)) return true;
  }

  return false;
};

/**
 * Filter helper for browse-surface lists. Returns the original array
 * reference when `enabled` is false or nothing was removed, so memoized
 * `FlashList` props stay referentially stable (zero extra renders).
 */
export const filterNonScriptedTV = <T extends TalkShowCandidate>(
  items: T[],
  enabled: boolean
): T[] => {
  if (!enabled || items.length === 0) return items;
  const filtered = items.filter((item) => !isTalkOrAwardsShow(item));
  return filtered.length === items.length ? items : filtered;
};
