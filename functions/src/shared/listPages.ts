/**
 * Overflow pages for list items. Imported by the app and the functions — keep it dependency-free.
 *
 * A list's items used to live only in its document (`users/{uid}/lists/{listId}.items`), which
 * Firestore caps at 1 MiB (~4,000–4,800 items). Lists now spill into overflow pages:
 *
 *   users/{uid}/lists/{listId}                     page 0: the original document, unchanged
 *   users/{uid}/lists/{listId}/item_pages/{n}      pages 1..pageCount: `{ items, createdAt, updatedAt }`
 *
 * The mechanics are shared with watched episodes; see pagedMap.ts.
 */
export {
  PAGE_CAPACITY as LIST_PAGE_CAPACITY,
  choosePage as chooseListItemPage,
  createSinglePageLayout,
  getAllPages as getAllListPages,
  getPageCount as getListPageCount,
  getPageDocId as getListItemPageDocId,
  mergePages as mergeListPages,
  parsePageDocId as parseListItemPageDocId,
  recordPlacement as recordListItemPlacement,
  recordRemoval as recordListItemRemoval,
  type MergedPages as MergedListPages,
  type PageLayout as ListPageLayout,
  type PagePlacement as ListItemPlacement,
  type PageSource as ListPageSource,
} from './pagedMap';

export const LIST_ITEM_PAGES_COLLECTION = 'item_pages';
