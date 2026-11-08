/**
 * Server-side reads and writes for lists whose items spill into overflow pages
 * (`item_pages`). See shared/listPages.ts. Every server writer of list items goes through here.
 */
import {
  applyPlanToPagedDoc,
  commitPagedDocWrites,
  deletePagedDoc,
  planPagedDocWrites,
  readPagedDoc,
  stagePagedDocWrites,
  withDocPages,
  type PagedDoc,
  type PagedDocChanges,
  type PagedDocConfig,
  type PagedDocWritePlan,
} from './pagedDocAdmin';
import { LIST_ITEM_PAGES_COLLECTION } from './shared/listPages';

const LIST_PAGES: PagedDocConfig = { field: 'items', pagesCollection: LIST_ITEM_PAGES_COLLECTION };

export type PagedList = PagedDoc;
export type ListItemChanges = PagedDocChanges;
export type PagedListWritePlan = PagedDocWritePlan;

export const readPagedList = (
  listRef: FirebaseFirestore.DocumentReference,
  transaction?: FirebaseFirestore.Transaction
): Promise<PagedList> => readPagedDoc(LIST_PAGES, listRef, transaction);

export const withPages = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
  transaction?: FirebaseFirestore.Transaction,
  listRef?: FirebaseFirestore.DocumentReference
): Promise<PagedList> => withDocPages(LIST_PAGES, snapshot, transaction, listRef);

export const planPagedListWrites = planPagedDocWrites;
export const applyPlanToPagedList = applyPlanToPagedDoc;
export const deletePagedList = deletePagedDoc;

export const stagePagedListWrites = (
  transaction: FirebaseFirestore.Transaction,
  list: PagedList,
  plan: PagedListWritePlan,
  listFields?: Record<string, unknown>,
  now?: number
): void => stagePagedDocWrites(LIST_PAGES, transaction, list, plan, listFields, now);

export const commitPagedListWrites = (
  db: FirebaseFirestore.Firestore,
  list: PagedList,
  plan: PagedListWritePlan,
  listFields?: Record<string, unknown>,
  now?: number
): Promise<void> => commitPagedDocWrites(LIST_PAGES, db, list, plan, listFields, now);
