/**
 * Server-side reads and writes for a document map that spills into overflow pages
 * (list items, watched episodes). See shared/pagedMap.ts for the layout.
 */
import { FieldValue } from 'firebase-admin/firestore';
import {
  cloneLayout,
  createSinglePageLayout,
  PAGE_CAPACITY,
  getPageCount,
  getPageDocId,
  mergePages,
  parsePageDocId,
  planPagedMapWrites,
  type PageLayout,
  type PagedMapChanges,
} from './shared/pagedMap';

type Entries = Record<string, Record<string, unknown>>;

export interface PagedDocConfig {
  /** The map field, on the document and on every page (`items`, `episodes`). */
  field: string;
  /** The pages subcollection (`item_pages`, `episode_pages`). */
  pagesCollection: string;
}

export interface PagedDoc {
  ref: FirebaseFirestore.DocumentReference;
  exists: boolean;
  /** The document's fields as stored (its map holds page 0 only). */
  data: FirebaseFirestore.DocumentData;
  /** Every map entry, merged across the document and its pages. */
  items: Entries;
  layout: PageLayout;
}

export type PagedDocChanges = PagedMapChanges<Record<string, unknown>>;

export interface PagedDocWritePlan {
  /** Entry writes per page (0 = the document); `FieldValue.delete()` removes a key. */
  pageItems: Map<number, Record<string, unknown>>;
  /** `pageCount` after the writes. */
  pageCount: number;
  /** Whether new pages are created, so `pageCount` must be raised before writing entries. */
  createsPages: boolean;
  /** The layout once the plan is applied. */
  layout: PageLayout;
}

function pagesCollection(config: PagedDocConfig, ref: FirebaseFirestore.DocumentReference) {
  return ref.collection(config.pagesCollection);
}

function pageRef(config: PagedDocConfig, ref: FirebaseFirestore.DocumentReference, page: number) {
  return pagesCollection(config, ref).doc(getPageDocId(page));
}

function toPagedDoc(
  config: PagedDocConfig,
  ref: FirebaseFirestore.DocumentReference,
  snapshot: FirebaseFirestore.DocumentSnapshot,
  pageDocs: FirebaseFirestore.QueryDocumentSnapshot[]
): PagedDoc {
  const data = snapshot.data() ?? {};
  const mainItems = isPlainObject(data[config.field]) ? (data[config.field] as Entries) : {};
  const pageCount = getPageCount(data);
  const merged =
    pageCount > 0 || pageDocs.length > 0
      ? mergePages<Record<string, unknown>>(
          mainItems,
          pageCount,
          pageDocs
            .map((pageDoc) => ({
              items: (pageDoc.data()[config.field] ?? {}) as Entries,
              page: parsePageDocId(pageDoc.id) ?? -1,
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

/** Reads a document and its overflow pages, optionally inside a transaction. */
export async function readPagedDoc(
  config: PagedDocConfig,
  ref: FirebaseFirestore.DocumentReference,
  transaction?: FirebaseFirestore.Transaction
): Promise<PagedDoc> {
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  return withDocPages(config, snapshot, transaction, ref);
}

/**
 * Adds overflow pages to a document that was already read (e.g. from a collection query).
 * Documents without pages cost no extra reads.
 */
export async function withDocPages(
  config: PagedDocConfig,
  snapshot: FirebaseFirestore.DocumentSnapshot,
  transaction?: FirebaseFirestore.Transaction,
  ref: FirebaseFirestore.DocumentReference = snapshot.ref
): Promise<PagedDoc> {
  if (getPageCount(snapshot.data()) === 0) {
    return toPagedDoc(config, ref, snapshot, []);
  }
  const pages = transaction
    ? await transaction.get(pagesCollection(config, ref))
    : await pagesCollection(config, ref).get();
  return toPagedDoc(config, ref, snapshot, pages.docs);
}

/** Decides which page each change goes to; see `planPagedMapWrites`. */
export function planPagedDocWrites(doc: PagedDoc, changes: PagedDocChanges): PagedDocWritePlan {
  return planPagedMapWrites(
    doc.layout,
    Object.keys(doc.items),
    changes,
    FieldValue.delete()
  ) as PagedDocWritePlan;
}

/**
 * Stages a plan inside a transaction that already read the document with `readPagedDoc(..., tx)`.
 * `fields` are merged into the document (e.g. `updatedAt`, `name`, `metadata`).
 */
export function stagePagedDocWrites(
  config: PagedDocConfig,
  transaction: FirebaseFirestore.Transaction,
  doc: PagedDoc,
  plan: PagedDocWritePlan,
  fields: Record<string, unknown> = {},
  now: number = Date.now()
): void {
  const mainItems = plan.pageItems.get(0);
  transaction.set(
    doc.ref,
    {
      ...fields,
      ...(mainItems ? { [config.field]: mainItems } : {}),
      ...(plan.createsPages ? { pageCount: Math.max(plan.pageCount, doc.layout.pageCount) } : {}),
    },
    { merge: true }
  );
  plan.pageItems.forEach((items, page) => {
    if (page === 0) {
      return;
    }
    transaction.set(
      pageRef(config, doc.ref, page),
      {
        [config.field]: items,
        updatedAt: now,
        ...(page > doc.layout.pageCount ? { createdAt: now } : {}),
      },
      { merge: true }
    );
  });
}

/**
 * Commits a plan outside a transaction. New pages are first registered by raising `pageCount`
 * in a transaction (it never goes down), then each page is written. If a later write fails,
 * `pageCount` points at an empty page, which reads as nothing; items are never left in a page
 * the document doesn't know about. Re-running the same writes is safe.
 */
export async function commitPagedDocWrites(
  config: PagedDocConfig,
  db: FirebaseFirestore.Firestore,
  doc: PagedDoc,
  plan: PagedDocWritePlan,
  fields: Record<string, unknown> = {},
  now: number = Date.now()
): Promise<void> {
  if (plan.createsPages) {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(doc.ref);
      const current = getPageCount(snapshot.data());
      if (current < plan.pageCount) {
        transaction.set(doc.ref, { pageCount: plan.pageCount }, { merge: true });
      }
    });
  }

  const writes: Promise<unknown>[] = [];
  const mainItems = plan.pageItems.get(0);
  if (mainItems || Object.keys(fields).length > 0) {
    writes.push(
      doc.ref.set({ ...fields, ...(mainItems ? { [config.field]: mainItems } : {}) }, { merge: true })
    );
  }
  plan.pageItems.forEach((items, page) => {
    if (page === 0) {
      return;
    }
    writes.push(
      pageRef(config, doc.ref, page).set(
        {
          [config.field]: items,
          updatedAt: now,
          ...(page > doc.layout.pageCount ? { createdAt: now } : {}),
        },
        { merge: true }
      )
    );
  });
  await Promise.all(writes);
}

/** The document as it is after a plan is written, so a caller writing again needn't re-read it. */
export function applyPlanToPagedDoc(
  doc: PagedDoc,
  changes: PagedDocChanges,
  plan: PagedDocWritePlan
): PagedDoc {
  const items: Entries = { ...doc.items };
  (changes.delete ?? []).forEach((key) => {
    delete items[key];
  });
  Object.entries(changes.set ?? {}).forEach(([key, value]) => {
    items[key] = value;
  });
  return { ...doc, exists: true, items, layout: plan.layout };
}

/**
 * Moves entries off the document (page 0) onto overflow pages, e.g. when a legacy document
 * already holds more than PAGE_CAPACITY entries and updating them in place would push it past
 * 1 MiB. The pages are written first and the document's copies removed after, so an
 * interruption leaves a duplicate (the page copy wins on read), never a lost entry.
 */
export async function relocateToOverflowPages(
  config: PagedDocConfig,
  db: FirebaseFirestore.Firestore,
  doc: PagedDoc,
  entries: Entries,
  /** Keys to remove from the document once the pages are written (defaults to the moved keys). */
  removeFromDocKeys: string[] = Object.keys(entries),
  now: number = Date.now()
): Promise<void> {
  if (Object.keys(entries).length === 0 && removeFromDocKeys.length === 0) {
    return;
  }

  // Plan them as new entries with the document treated as full, so they land on pages.
  const layout = cloneLayout(doc.layout);
  layout.pageSizes[0] = Math.max(layout.pageSizes[0] ?? 0, PAGE_CAPACITY);
  const remainingKeys = Object.keys(doc.items).filter((key) => !(key in entries));
  const plan = planPagedMapWrites(
    layout,
    remainingKeys,
    { set: entries },
    FieldValue.delete()
  ) as PagedDocWritePlan;
  if (Object.keys(entries).length > 0) {
    await commitPagedDocWrites(config, db, doc, plan, {}, now);
  }

  if (removeFromDocKeys.length > 0) {
    await doc.ref.set(
      {
        [config.field]: Object.fromEntries(
          removeFromDocKeys.map((key) => [key, FieldValue.delete()])
        ),
      },
      { merge: true }
    );
  }
}

/** A document that doesn't exist yet, for writers that create it. */
export function emptyPagedDoc(ref: FirebaseFirestore.DocumentReference): PagedDoc {
  return { data: {}, exists: false, items: {}, layout: createSinglePageLayout(0), ref };
}

/** Deletes a document together with its overflow pages (and any other subcollections). */
export async function deletePagedDoc(
  db: FirebaseFirestore.Firestore,
  ref: FirebaseFirestore.DocumentReference
): Promise<void> {
  await db.recursiveDelete(ref);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
