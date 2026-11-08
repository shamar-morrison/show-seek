/**
 * Server-side reads and writes for lists whose items spill into overflow pages.
 * See shared/listPages.ts for the layout. Every server writer of list items goes through here.
 */
import { FieldValue } from 'firebase-admin/firestore';
import {
  chooseListItemPage,
  createSinglePageLayout,
  getListItemPageDocId,
  getListPageCount,
  LIST_ITEM_PAGES_COLLECTION,
  mergeListPages,
  parseListItemPageDocId,
  recordListItemPlacement,
  recordListItemRemoval,
  type ListPageLayout,
} from './shared/listPages';

type ListItems = Record<string, Record<string, unknown>>;

export interface PagedList {
  ref: FirebaseFirestore.DocumentReference;
  exists: boolean;
  /** The list document's fields as stored (its `items` are page 0 only). */
  data: FirebaseFirestore.DocumentData;
  /** Every item, merged across the list document and its overflow pages. */
  items: ListItems;
  layout: ListPageLayout;
}

export interface ListItemChanges {
  /** Items to write, by key. An existing item is updated on the page that holds it. */
  set?: ListItems;
  /** Keys to remove from the list document and every overflow page. */
  delete?: string[];
}

export interface PagedListWritePlan {
  /** Item writes per page (0 = the list document); `FieldValue.delete()` removes a key. */
  pageItems: Map<number, Record<string, unknown>>;
  /** `pageCount` after the writes. */
  pageCount: number;
  /** Whether new pages are created, so `pageCount` must be raised before writing items. */
  createsPages: boolean;
  /** The list's layout once the plan is applied. */
  layout: ListPageLayout;
}

function pagesCollection(listRef: FirebaseFirestore.DocumentReference) {
  return listRef.collection(LIST_ITEM_PAGES_COLLECTION);
}

function pageRef(listRef: FirebaseFirestore.DocumentReference, page: number) {
  return pagesCollection(listRef).doc(getListItemPageDocId(page));
}

function toPagedList(
  ref: FirebaseFirestore.DocumentReference,
  snapshot: FirebaseFirestore.DocumentSnapshot,
  pageDocs: FirebaseFirestore.QueryDocumentSnapshot[]
): PagedList {
  const data = snapshot.data() ?? {};
  const mainItems = isPlainObject(data.items) ? (data.items as ListItems) : {};
  const pageCount = getListPageCount(data);
  const merged =
    pageCount > 0 || pageDocs.length > 0
      ? mergeListPages<Record<string, unknown>>(
          mainItems,
          pageCount,
          pageDocs
            .map((pageDoc) => ({
              items: (pageDoc.data().items ?? {}) as ListItems,
              page: parseListItemPageDocId(pageDoc.id) ?? -1,
            }))
            .filter((source) => source.page >= 1)
        )
      : { items: mainItems, layout: createSinglePageLayout(Object.keys(mainItems).length) };

  return {
    data,
    exists: snapshot.exists,
    items: merged.items,
    layout: merged.layout,
    ref,
  };
}

/** Reads a list and its overflow pages, optionally inside a transaction. */
export async function readPagedList(
  listRef: FirebaseFirestore.DocumentReference,
  transaction?: FirebaseFirestore.Transaction
): Promise<PagedList> {
  const snapshot = transaction ? await transaction.get(listRef) : await listRef.get();
  return withPages(snapshot, transaction, listRef);
}

/**
 * Adds overflow pages to a list document that was already read (e.g. from a collection query).
 * Lists without pages cost no extra reads.
 */
export async function withPages(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  transaction?: FirebaseFirestore.Transaction,
  listRef: FirebaseFirestore.DocumentReference = snapshot.ref
): Promise<PagedList> {
  if (getListPageCount(snapshot.data()) === 0) {
    return toPagedList(listRef, snapshot, []);
  }
  const pages = transaction
    ? await transaction.get(pagesCollection(listRef))
    : await pagesCollection(listRef).get();
  return toPagedList(listRef, snapshot, pages.docs);
}

/**
 * Decides which page each change goes to. Existing items are updated where they are, new items
 * fill the last page and then new ones, and deletes go to every page (an item can only be
 * duplicated across pages by concurrent writers, and this removes every copy).
 */
export function planPagedListWrites(list: PagedList, changes: ListItemChanges): PagedListWritePlan {
  const layout: ListPageLayout = {
    overflowItemPages: { ...list.layout.overflowItemPages },
    pageCount: list.layout.pageCount,
    pageSizes: [...list.layout.pageSizes],
  };
  const present = new Set(Object.keys(list.items));
  const pageItems = new Map<number, Record<string, unknown>>();
  const stage = (page: number, key: string, value: unknown) => {
    const payload = pageItems.get(page) ?? {};
    payload[key] = value;
    pageItems.set(page, payload);
  };

  (changes.delete ?? []).forEach((key) => {
    for (let page = 0; page <= layout.pageCount; page += 1) {
      stage(page, key, FieldValue.delete());
    }
    recordListItemRemoval(layout, (candidate) => present.has(candidate), [key]);
    present.delete(key);
  });

  Object.entries(changes.set ?? {}).forEach(([key, value]) => {
    const placement = chooseListItemPage(layout, (candidate) => present.has(candidate), [key]);
    recordListItemPlacement(layout, key, placement, !present.has(key));
    present.add(key);
    stage(placement.page, key, value);
  });

  return {
    createsPages: layout.pageCount > list.layout.pageCount,
    layout,
    pageCount: layout.pageCount,
    pageItems,
  };
}

/**
 * Stages a plan inside a transaction that already read the list with `readPagedList(ref, tx)`.
 * `listFields` are merged into the list document (e.g. `updatedAt`, `name`).
 */
export function stagePagedListWrites(
  transaction: FirebaseFirestore.Transaction,
  list: PagedList,
  plan: PagedListWritePlan,
  listFields: Record<string, unknown> = {},
  now: number = Date.now()
): void {
  const mainItems = plan.pageItems.get(0);
  transaction.set(
    list.ref,
    {
      ...listFields,
      ...(mainItems ? { items: mainItems } : {}),
      ...(plan.createsPages ? { pageCount: Math.max(plan.pageCount, list.layout.pageCount) } : {}),
    },
    { merge: true }
  );
  plan.pageItems.forEach((items, page) => {
    if (page === 0) {
      return;
    }
    transaction.set(
      pageRef(list.ref, page),
      {
        items,
        updatedAt: now,
        ...(page > list.layout.pageCount ? { createdAt: now } : {}),
      },
      { merge: true }
    );
  });
}

/**
 * Commits a plan outside a transaction. New pages are first registered by raising `pageCount`
 * in a transaction (it never goes down), then each page is written. If a later write fails,
 * `pageCount` points at an empty page, which reads as nothing; items are never left in a page
 * the list doesn't know about. Re-running the same writes is safe.
 */
export async function commitPagedListWrites(
  db: FirebaseFirestore.Firestore,
  list: PagedList,
  plan: PagedListWritePlan,
  listFields: Record<string, unknown> = {},
  now: number = Date.now()
): Promise<void> {
  if (plan.createsPages) {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(list.ref);
      const current = getListPageCount(snapshot.data());
      if (current < plan.pageCount) {
        transaction.set(list.ref, { pageCount: plan.pageCount }, { merge: true });
      }
    });
  }

  const writes: Promise<unknown>[] = [];
  const mainItems = plan.pageItems.get(0);
  if (mainItems || Object.keys(listFields).length > 0) {
    writes.push(
      list.ref.set({ ...listFields, ...(mainItems ? { items: mainItems } : {}) }, { merge: true })
    );
  }
  plan.pageItems.forEach((items, page) => {
    if (page === 0) {
      return;
    }
    writes.push(
      pageRef(list.ref, page).set(
        {
          items,
          updatedAt: now,
          ...(page > list.layout.pageCount ? { createdAt: now } : {}),
        },
        { merge: true }
      )
    );
  });
  await Promise.all(writes);
}

/** The list as it is after a plan is written, so a caller writing again needn't re-read it. */
export function applyPlanToPagedList(
  list: PagedList,
  changes: ListItemChanges,
  plan: PagedListWritePlan
): PagedList {
  const items: ListItems = { ...list.items };
  (changes.delete ?? []).forEach((key) => {
    delete items[key];
  });
  Object.entries(changes.set ?? {}).forEach(([key, value]) => {
    items[key] = value;
  });
  return { ...list, exists: true, items, layout: plan.layout };
}

/** Deletes a list together with its overflow pages. */
export async function deletePagedList(
  db: FirebaseFirestore.Firestore,
  listRef: FirebaseFirestore.DocumentReference
): Promise<void> {
  await db.recursiveDelete(listRef);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
