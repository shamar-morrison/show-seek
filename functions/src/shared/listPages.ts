/**
 * Overflow pages for list items. Imported by the app and the functions — keep it dependency-free.
 *
 * A list's items used to live only in its document (`users/{uid}/lists/{listId}.items`), which
 * Firestore caps at 1 MiB (~4,000–4,800 items). Lists now spill into overflow pages:
 *
 *   users/{uid}/lists/{listId}                     page 0: the original document, unchanged
 *   users/{uid}/lists/{listId}/item_pages/{n}      pages 1..pageCount: `{ items, createdAt, updatedAt }`
 *
 * The list document's `pageCount` says how many overflow pages exist (absent = 0), so a list
 * without overflow costs no extra reads. A page takes new items until it holds
 * LIST_PAGE_CAPACITY; an item that already exists is always updated where it is. Existing lists
 * above the capacity keep their items in place: only new items go to the overflow pages.
 */

export const LIST_ITEM_PAGES_COLLECTION = 'item_pages';

/**
 * New items stop going into a page once it holds this many. A typical item is ~220–260 bytes,
 * so a full page is ~0.5 MB — well under 1 MiB even with long titles or several devices
 * adding at once.
 */
export const LIST_PAGE_CAPACITY = 2000;

/** Where a list's items live. Page 0 is the list document itself. */
export interface ListPageLayout {
  /** Number of overflow pages (`item_pages/1..pageCount`). */
  pageCount: number;
  /** Item count per page, index 0 = the list document. Length is `pageCount + 1`. */
  pageSizes: number[];
  /** Canonical or raw item key → overflow page (≥ 1) holding it. Items not listed are on page 0. */
  overflowItemPages: Record<string, number>;
}

export interface ListPageSource<T> {
  /** 1-based overflow page number (the `item_pages` document id). */
  page: number;
  items: Record<string, T> | undefined | null;
}

export interface MergedListPages<T> {
  /** Every item across the list document and its pages. A page entry wins over a duplicate key. */
  items: Record<string, T>;
  layout: ListPageLayout;
}

export const getListItemPageDocId = (page: number): string => String(page);

/** Reads `pageCount` from a list document, tolerating absent or malformed values. */
export function getListPageCount(listData: { pageCount?: unknown } | null | undefined): number {
  const value = listData?.pageCount;
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

/** Parses an `item_pages` document id; null for anything that isn't a page number ≥ 1. */
export function parseListItemPageDocId(id: string): number | null {
  if (!/^[1-9]\d*$/.test(id)) {
    return null;
  }
  return Number(id);
}

/** A layout for a list that only has its document (no overflow pages). */
export function createSinglePageLayout(itemCount: number): ListPageLayout {
  return { overflowItemPages: {}, pageCount: 0, pageSizes: [itemCount] };
}

/**
 * Merges the list document's items with its overflow pages.
 * `pageCount` is the list document's value; pages above it (left over from a
 * concurrent writer) are still read so no item is lost.
 */
export function mergeListPages<T>(
  mainItems: Record<string, T> | undefined | null,
  pageCount: number,
  pages: ListPageSource<T>[]
): MergedListPages<T> {
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

export interface ListItemPlacement {
  page: number;
  /** True when the page doesn't exist yet and `pageCount` must grow to `page`. */
  createsPage: boolean;
}

/**
 * Where to write an item. An item that already exists (under any of `candidateKeys`, e.g.
 * canonical and legacy keys; `hasItem` answers for the merged items) stays on its page; a new
 * item goes to the last page,
 * or to a new page once the last one holds LIST_PAGE_CAPACITY items.
 */
export function chooseListItemPage(
  layout: ListPageLayout,
  hasItem: (key: string) => boolean,
  candidateKeys: string[]
): ListItemPlacement {
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
  if ((layout.pageSizes[lastPage] ?? 0) < LIST_PAGE_CAPACITY) {
    return { createsPage: false, page: lastPage };
  }
  return { createsPage: true, page: lastPage + 1 };
}

/**
 * Records a placement in the layout (mutates it), so a run of writes keeps filling pages
 * in order without re-reading.
 */
export function recordListItemPlacement(
  layout: ListPageLayout,
  key: string,
  placement: ListItemPlacement,
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
 * Records that an item (under any of `keys`) was removed from every page (mutates the layout).
 * `hasItem` answers for the merged items from before the removal.
 */
export function recordListItemRemoval(
  layout: ListPageLayout,
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

/** Every page number a list has, including the list document (0). */
export function getAllListPages(layout: Pick<ListPageLayout, 'pageCount'>): number[] {
  return Array.from({ length: layout.pageCount + 1 }, (_, page) => page);
}
