/**
 * Sort utilities for media titles.
 */

/**
 * Leading articles to strip from titles when sorting alphabetically.
 * This ensures "The Matrix" is sorted under M, not T.
 */
const LEADING_ARTICLES = ['the ', 'a ', 'an '];

/**
 * Strips leading articles ("A", "An", "The") from a title for alphabetical sorting.
 * This matches how people naturally think of titles - e.g., "The Matrix" should
 * be sorted under "M", not "T".
 *
 * @param title - The title to process
 * @returns The title with leading articles removed (lowercased)
 *
 * @example
 * getSortableTitle("The Matrix") // returns "matrix"
 * getSortableTitle("A Quiet Place") // returns "quiet place"
 * getSortableTitle("An American Werewolf") // returns "american werewolf"
 * getSortableTitle("Avatar") // returns "avatar"
 */
export function getSortableTitle(title: string): string {
  const lowerTitle = title.toLowerCase();

  for (const article of LEADING_ARTICLES) {
    if (lowerTitle.startsWith(article)) {
      return lowerTitle.slice(article.length);
    }
  }

  return lowerTitle;
}
