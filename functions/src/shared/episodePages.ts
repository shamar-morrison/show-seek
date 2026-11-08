/**
 * Overflow pages for a show's watched episodes. Imported by the app and the functions.
 *
 * A show's watched episodes live in `users/{uid}/episode_tracking/{showId}.episodes`, capped at
 * 1 MiB (~5,000 episodes — reachable for daily soaps and long-running game or talk shows).
 * Episodes beyond the document's capacity spill into pages:
 *
 *   users/{uid}/episode_tracking/{showId}                       page 0, also holds `metadata`
 *   users/{uid}/episode_tracking/{showId}/episode_pages/{n}     `{ episodes, createdAt, updatedAt }`
 *
 * The mechanics are shared with list items; see pagedMap.ts.
 */
export const EPISODE_PAGES_COLLECTION = 'episode_pages';
