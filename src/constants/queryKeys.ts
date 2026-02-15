/**
 * Centralized React Query cache keys.
 *
 * Keeping query keys in one place prevents silent cache-invalidation bugs
 * that arise when the same string literal is duplicated across files.
 */

/** Key for the list-membership-index query (maps media → list IDs). */
export const LIST_MEMBERSHIP_INDEX_QUERY_KEY = 'list-membership-index';
