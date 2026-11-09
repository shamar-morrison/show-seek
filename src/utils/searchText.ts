/**
 * Unicode combining accent marks (U+0300–U+036F) left behind by NFD normalization. Built from
 * an escaped string so formatters keep the range readable instead of inlining invisible marks.
 */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * Lowercases text and strips accents, so a search for "penelope" finds "Penélope" and
 * "zoe" finds "Zoë". Use on both the query and the text being searched.
 */
export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase().trim();
}
