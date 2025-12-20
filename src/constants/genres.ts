/**
 * Genre IDs for non-scripted TV content that should be excluded from credits lists.
 * These are filtered out because actors appearing on talk shows, news, or reality TV
 * are typically guests rather than cast members of those shows.
 */
export const EXCLUDED_TV_GENRE_IDS = [
  10767, // Talk shows (The Tonight Show, Jimmy Kimmel, etc.)
  10763, // News (news programs)
  10764, // Reality (reality TV shows, awards shows)
];
