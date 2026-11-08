/**
 * Server-side reads and writes for a show's watched episodes, which spill into overflow pages
 * (`episode_pages`) for very long shows. See shared/episodePages.ts. Every server writer of
 * `episode_tracking` episodes goes through here.
 */
import {
  commitPagedDocWrites,
  emptyPagedDoc,
  planPagedDocWrites,
  readPagedDoc,
  stagePagedDocWrites,
  withDocPages,
  type PagedDoc,
  type PagedDocChanges,
  type PagedDocWritePlan,
  type PagedDocConfig,
} from './pagedDocAdmin';
import { EPISODE_PAGES_COLLECTION } from './shared/episodePages';

const EPISODE_PAGES: PagedDocConfig = { field: 'episodes', pagesCollection: EPISODE_PAGES_COLLECTION };

/** A show's tracking document; `items` holds every watched episode, keyed `${season}_${episode}`. */
export type PagedEpisodeTracking = PagedDoc;
export type EpisodeChanges = PagedDocChanges;

export const readEpisodeTracking = (
  trackingRef: FirebaseFirestore.DocumentReference,
  transaction?: FirebaseFirestore.Transaction
): Promise<PagedEpisodeTracking> => readPagedDoc(EPISODE_PAGES, trackingRef, transaction);

export const withEpisodePages = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
  transaction?: FirebaseFirestore.Transaction
): Promise<PagedEpisodeTracking> => withDocPages(EPISODE_PAGES, snapshot, transaction);

export const planEpisodeWrites = planPagedDocWrites;

export const stageEpisodeWrites = (
  transaction: FirebaseFirestore.Transaction,
  tracking: PagedEpisodeTracking,
  plan: PagedDocWritePlan,
  fields?: Record<string, unknown>,
  now?: number
): void => stagePagedDocWrites(EPISODE_PAGES, transaction, tracking, plan, fields, now);

export const commitEpisodeWrites = (
  db: FirebaseFirestore.Firestore,
  tracking: PagedEpisodeTracking,
  plan: PagedDocWritePlan,
  fields?: Record<string, unknown>,
  now?: number
): Promise<void> => commitPagedDocWrites(EPISODE_PAGES, db, tracking, plan, fields, now);

export const emptyEpisodeTracking = emptyPagedDoc;
