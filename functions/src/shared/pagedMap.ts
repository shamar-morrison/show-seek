/**
 * Overflow pages for a document map that can outgrow Firestore's 1 MiB document limit.
 * Imported by the app and the functions — keep it dependency-free.
 *
 * The map stays in its document (page 0) and spills into a subcollection of page documents
 * (pages 1..pageCount), each holding the same map field:
 *
 *   {doc}                     page 0: the original document, unchanged
 *   {doc}/{pages}/{n}         pages 1..pageCount: `{ [field]: { ... }, createdAt, updatedAt }`
 *
 * The document's `pageCount` says how many pages exist (absent = 0), so a document that fits
 * costs no extra reads. A page takes new entries until it holds PAGE_CAPACITY; an entry that
 * already exists is always updated where it is. Documents already above the capacity keep their
 * entries in place: only new entries go to pages.
 *
 * Used for list items (listPages.ts) and watched episodes (episodePages.ts).
 */

/**
 * New entries stop going into a page once it holds this many. List items and episode entries
 * are ~200–260 bytes, so a full page is ~0.5 MB — well under 1 MiB even with long titles or
 * several devices writing at once.
 */
export const PAGE_CAPACITY = 2000;

/** Upper bound on pages (also enforced by the security rules); guards against corrupt values. */
export const MAX_PAGE_COUNT = 1000;

/** Where a map's entries live. Page 0 is the document itself. */
export interface PageLayout {
  /** Number of overflow pages (1..pageCount). */
  pageCount: number;
  /** Entry count per page, index 0 = the document. Length is `pageCount + 1`. */
  pageSizes: number[];
  /** Entry key → overflow page (≥ 1) holding it. Entries not listed are on page 0. */
  overflowItemPages: Record<string, number>;
}

export interface PageSource<T> {
  /** 1-based overflow page number (the page document id). */
  page: number;
  items: Record<string, T> | undefined | null;
}

export interface MergedPages<T> {
  /** Every entry across the document and its pages. A page entry wins over a duplicate key. */
  items: Record<string, T>;
  layout: PageLayout;
}

export interface PagePlacement {
  page: number;
  /** True when the page doesn't exist yet and `pageCount` must grow to `page`. */
  createsPage: boolean;
}

export const getPageDocId = (page: number): string => String(page);

/** Reads `pageCount` from a document, tolerating absent or malformed values. */
export function getPageCount(data: { pageCount?: unknown } | null | undefined): number {
  const value = data?.pageCount;
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? Math.min(value, MAX_PAGE_COUNT)
    : 0;
}

/** Parses a page document id; null for anything that isn't a page number ≥ 1. */
export function parsePageDocId(id: string): number | null {
  if (!/^[1-9]\d*$/.test(id)) {
    return null;
  }
  const page = Number(id);
  return page <= MAX_PAGE_COUNT ? page : null;
}

/** A layout for a document without overflow pages. */
export function createSinglePageLayout(entryCount: number): PageLayout {
  return { overflowItemPages: {}, pageCount: 0, pageSizes: [entryCount] };
}

/** Copies a layout so a planner can mutate it freely. */
export function cloneLayout(layout: PageLayout): PageLayout {
  return {
    overflowItemPages: { ...layout.overflowItemPages },
    pageCount: layout.pageCount,
    pageSizes: [...layout.pageSizes],
  };
}

/**
 * Merges the document's map with its pages. `pageCount` is the document's value; pages above
 * it (left over from a concurrent writer) are still read so no entry is lost.
 */
export function mergePages<T>(
  mainItems: Record<string, T> | undefined | null,
  pageCount: number,
  pages: PageSource<T>[]
): MergedPages<T> {
  const items: Record<string, T> = { ...(mainItems ?? {}) };
  const sortedPages = [...pages]
    .filter((source) => Number.isInteger(source.page) && source.page >= 1)
    .sort((a, b) => a.page - b.page);
  const effectivePageCount = Math.max(
    pageCount,
    sortedPages.length > 0 ? sortedPages[sortedPages.length - 1].page : 0
  );
  const pageSizes = new Array<number>(effectivePageCount + 1).fill(0);
  pageSizes[0] = Object.keys(mainItems ?? {}).length;
  const overflowItemPages: Record<string, number> = {};

  sortedPages.forEach(({ items: pageItems, page }) => {
    const entries = Object.entries(pageItems ?? {});
    pageSizes[page] = entries.length;
    entries.forEach(([key, value]) => {
      items[key] = value;
      overflowItemPages[key] = page;
    });
  });

  return {
    items,
    layout: { overflowItemPages, pageCount: effectivePageCount, pageSizes },
  };
}

/**
 * Where to write an entry. An entry that already exists (under any of `candidateKeys`, e.g.
 * canonical and legacy keys; `hasItem` answers for the merged entries) stays on its page; a new
 * entry goes to the last page, or to a new page once the last one holds PAGE_CAPACITY entries.
 */
export function choosePage(
  layout: PageLayout,
  hasItem: (key: string) => boolean,
  candidateKeys: string[]
): PagePlacement {
  for (const key of candidateKeys) {
    const overflowPage = layout.overflowItemPages[key];
    if (overflowPage !== undefined) {
      return { createsPage: false, page: overflowPage };
    }
  }
  for (const key of candidateKeys) {
    if (hasItem(key)) {
      return { createsPage: false, page: 0 };
    }
  }

  const lastPage = layout.pageCount;
  if ((layout.pageSizes[lastPage] ?? 0) < PAGE_CAPACITY) {
    return { createsPage: false, page: lastPage };
  }
  if (lastPage + 1 > MAX_PAGE_COUNT) {
    // Readers ignore pages past the limit; refuse before anything is written or removed.
    throw new Error('This list has reached its maximum size.');
  }
  return { createsPage: true, page: lastPage + 1 };
}

/**
 * Records a placement in the layout (mutates it), so a run of writes keeps filling pages
 * in order without re-reading.
 */
export function recordPlacement(
  layout: PageLayout,
  key: string,
  placement: PagePlacement,
  isNewItem: boolean
): void {
  if (placement.page > layout.pageCount) {
    for (let page = layout.pageCount + 1; page <= placement.page; page += 1) {
      layout.pageSizes[page] = 0;
    }
    layout.pageCount = placement.page;
  }
  if (isNewItem) {
    layout.pageSizes[placement.page] = (layout.pageSizes[placement.page] ?? 0) + 1;
  }
  if (placement.page > 0) {
    layout.overflowItemPages[key] = placement.page;
  }
}

/**
 * Records that an entry (under any of `keys`) was removed from every page (mutates the layout).
 * `hasItem` answers for the merged entries from before the removal.
 */
export function recordRemoval(
  layout: PageLayout,
  hasItem: (key: string) => boolean,
  keys: string[]
): void {
  keys.forEach((key) => {
    const page = layout.overflowItemPages[key];
    if (page !== undefined) {
      layout.pageSizes[page] = Math.max(0, (layout.pageSizes[page] ?? 0) - 1);
      delete layout.overflowItemPages[key];
    } else if (hasItem(key)) {
      layout.pageSizes[0] = Math.max(0, (layout.pageSizes[0] ?? 0) - 1);
    }
  });
}

export interface PagedMapChanges<T> {
  /** Entries to write, by key. An existing entry is updated on the page that holds it. */
  set?: Record<string, T>;
  /** Keys to remove from the document and every page. */
  delete?: string[];
}

export interface PagedMapWritePlan<T, D> {
  /** Entry writes per page (0 = the document); `deleteValue` removes a key. */
  pageItems: Map<number, Record<string, T | D>>;
  /** `pageCount` after the writes. */
  pageCount: number;
  /** Whether new pages are created, so `pageCount` must be raised before writing entries. */
  createsPages: boolean;
  /** The layout once the plan is applied. */
  layout: PageLayout;
}

/**
 * Decides which page each change goes to. Existing entries are updated where they are, new
 * entries fill the last page and then new ones, and deletes go to every page (an entry is only
 * duplicated across pages by concurrent writers; this removes every copy). `deleteValue` is the
 * SDK's delete sentinel (`deleteField()` / `FieldValue.delete()`).
 */
export function planPagedMapWrites<T, D>(
  layout: PageLayout,
  existingKeys: Iterable<string>,
  changes: PagedMapChanges<T>,
  deleteValue: D
): PagedMapWritePlan<T, D> {
  const nextLayout = cloneLayout(layout);
  const present = new Set(existingKeys);
  const pageItems = new Map<number, Record<string, T | D>>();
  const stage = (page: number, key: string, value: T | D) => {
    const payload = pageItems.get(page) ?? {};
    payload[key] = value;
    pageItems.set(page, payload);
  };

  (changes.delete ?? []).forEach((key) => {
    for (let page = 0; page <= nextLayout.pageCount; page += 1) {
      stage(page, key, deleteValue);
    }
    recordRemoval(nextLayout, (candidate) => present.has(candidate), [key]);
    present.delete(key);
  });

  Object.entries(changes.set ?? {}).forEach(([key, value]) => {
    const placement = choosePage(nextLayout, (candidate) => present.has(candidate), [key]);
    recordPlacement(nextLayout, key, placement, !present.has(key));
    present.add(key);
    stage(placement.page, key, value);
  });

  return {
    createsPages: nextLayout.pageCount > layout.pageCount,
    layout: nextLayout,
    pageCount: nextLayout.pageCount,
    pageItems,
  };
}

/**
 * Rough size of map entries in bytes (their JSON length). Slightly above Firestore's own storage
 * size for the same data, so it errs on the safe side when guarding the 1 MiB limit.
 */
export function estimateEntriesSize(entries: Record<string, unknown>): number {
  return Object.entries(entries).reduce(
    (total, [key, value]) => total + key.length + JSON.stringify(value ?? null).length,
    0
  );
}

/**
 * Registering the first page adds `pageCount` (~18 bytes) to the document, which fails for a
 * document within those bytes of 1 MiB — exactly the documents that need pages. Writers move
 * one existing entry onto page 1 in the same write, so the document shrinks overall.
 * Returns that entry, or null when none qualifies.
 */
export function pickEntryToMakeRoom<T>(
  entries: Record<string, T> | undefined | null,
  isMovableKey: (key: string) => boolean,
  excludedKeys: Iterable<string> = []
): [string, T] | null {
  const excluded = new Set(excludedKeys);
  for (const [key, value] of Object.entries(entries ?? {})) {
    if (!excluded.has(key) && isMovableKey(key)) {
      return [key, value];
    }
  }
  return null;
}

/** Keys pages may hold: canonical list item keys (never legacy numeric ones), episode keys. */
export const isCanonicalListItemKey = (key: string): boolean =>
  /^(?:(?:movie|tv)-\d+|season-\d+-\d+|episode-\d+-\d+-\d+)$/.test(key);
export const isEpisodeKey = (key: string): boolean => /^\d+_\d+$/.test(key);

/** Every page number a document has, including the document itself (0). */
export function getAllPages(layout: Pick<PageLayout, 'pageCount'>): number[] {
  return Array.from({ length: layout.pageCount + 1 }, (_, page) => page);
}
