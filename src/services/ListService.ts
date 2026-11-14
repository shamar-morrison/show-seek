import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { normalizeListKind, trackAddToList, trackCreateList } from '@/src/services/analytics';
import { auditedGetDoc, auditedGetDocs } from '@/src/services/firestoreReadAudit';
import { deleteDocWithPages } from '@/src/services/firestoreHelpers';
import { LayoutReadToken, LayoutWriteTracker } from '@/src/services/layoutWriteTracker';
import { requireSignedInUser, toFirestoreError } from '@/src/services/serviceSupport';
import {
  getLegacyListItemKey,
  getLegacyListItemKeyForRef,
  getListItemKey,
  getListItemRefCandidateKeys,
  getListMembershipKey,
  getStoredListItemKeys,
  isRuntimeStampLeftover,
  normalizeListItemsMap,
  type ListEntryMediaType,
  type ListItemRef,
} from '@/src/utils/listItemKeys';
import {
  chooseListItemPage,
  createSinglePageLayout,
  getAllListPages,
  getListItemPageDocId,
  getListPageCount,
  LIST_ITEM_PAGES_COLLECTION,
  mergeListPages,
  parseListItemPageDocId,
  recordListItemPlacement,
  LIST_PAGE_CAPACITY,
  recordListItemRemoval,
  type ListItemPlacement,
  type ListPageLayout,
} from '@/functions/src/shared/listPages';
import { isCanonicalListItemKey, pickEntryToMakeRoom } from '@/functions/src/shared/pagedMap';
import {
  getListRatingUpdate,
  toDisplayedRating,
  type RatedListMediaType,
} from '@/src/utils/listItemRatings';
import { createTimeoutWithCleanup } from '@/src/utils/timeout';
import {
  collection,
  deleteField,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export interface ListMediaItem {
  /**
   * TMDB ID of the movie or show. For a season or an episode, the show's ID (see
   * `season_number` and `episode_number`).
   */
  id: number;
  /**
   * Display title. For a season, a combined "Show · Season" title; for an episode, a combined
   * "Show · S1E2 · Name" title, so app versions that predate them still show something sensible.
   */
  title: string;
  poster_path: string | null;
  media_type: ListEntryMediaType;
  vote_average: number;
  release_date: string;
  addedAt: number;
  genre_ids?: number[];
  /** Runtime in minutes, stamped at write time from TMDB (optional for legacy items) */
  runtimeMinutes?: number;
  // TV show fields (optional, used when media_type is 'tv', 'season' or 'episode')
  name?: string;
  first_air_date?: string;
  // Season fields (set when media_type is 'season' or 'episode')
  /** Season number within the show; 0 is specials. */
  season_number?: number;
  /** TMDB's name for the season, e.g. "Season 2" or "Specials". */
  season_name?: string;
  /** The show's own name (seasons and episodes), kept apart from the combined display title. */
  show_name?: string;
  /**
   * A season's total runtime (sum of its episodes), written only by app versions that know
   * seasons. Season code reads this rather than `runtimeMinutes`, which an older app version
   * may have filled with a wrong value (it looks seasons up as movies).
   */
  seasonRuntimeMinutes?: number;
  // Episode fields (set when media_type is 'episode')
  /** Episode number within its season. */
  episode_number?: number;
  /** TMDB's name for the episode, e.g. "Phoenix". */
  episode_name?: string;
  /** The episode's still (16:9). Cards show `poster_path`, the season's or show's poster. */
  still_path?: string | null;
  /**
   * The episode's runtime, written only by app versions that know episodes. Episode code reads
   * this rather than `runtimeMinutes`, which an older app version may fill with a wrong value.
   */
  episodeRuntimeMinutes?: number;
}

export interface UserList {
  id: string;
  name: string;
  description?: string;
  /** Every item, merged across the list document and its overflow pages. */
  items: Record<string, ListMediaItem>;
  createdAt: number;
  updatedAt?: number;
  /**
   * Overflow pages (`item_pages/1..pageCount`) holding items beyond the list document's
   * capacity. Absent for lists that fit in their document. See functions/src/shared/listPages.ts.
   */
  pageCount?: number;
  /** Item count per page (index 0 = the list document). Only set when `pageCount` > 0. */
  pageSizes?: number[];
  /** Item key → overflow page holding it. Only set when `pageCount` > 0. */
  overflowItemPages?: Record<string, number>;
  /**
   * Normalized item key → the key the item is stored under, where they differ (legacy numeric
   * keys). Set on every list loaded with normalized keys, so writes by field path can target
   * the real entry. Absent on lists cached before this field existed.
   */
  storedItemKeys?: Record<string, string>;
}

/** Firestore's error when a write would push a document past 1 MiB. */
const DOCUMENT_TOO_LARGE_PATTERN = /exceeds the maximum allowed size/i;

interface ListAuditInfo {
  queryKey: string;
  callsite: string;
}

/** A list's page layout plus its item keys, remembered between loads to route writes. */
interface KnownListLayout {
  layout: ListPageLayout;
  keys: Set<string>;
}

export type ListMembershipIndex = Record<string, string[]>;

/** A fresh TMDB rating for the entry stored under some key of a list document or page. */
export interface ListItemRatingUpdate {
  mediaType: RatedListMediaType;
  mediaId: number;
  rating: number;
}

export interface ListItemRatingsResult {
  /** Stored keys whose rating was saved. */
  updated: string[];
  /**
   * Stored keys whose stored rating already shows as the fresh one (e.g. saved meanwhile from
   * another device), so nothing was written for them.
   */
  current: string[];
  /** Stored keys whose entry isn't in the document any more (removed or moved meanwhile). */
  missing: string[];
}

export const DEFAULT_LISTS = [
  { id: 'watchlist', name: 'Should Watch' },
  { id: 'currently-watching', name: 'Watching' },
  { id: 'already-watched', name: 'Already Watched' },
  { id: 'favorites', name: 'Favorites' },
  { id: 'dropped', name: 'Dropped' },
];

class ListService {
  private getUserListRef(userId: string, listId: string) {
    return doc(db, 'users', userId, 'lists', listId);
  }

  private getUserListsCollection(userId: string) {
    return collection(db, 'users', userId, 'lists');
  }

  private getListItemPagesCollection(userId: string, listId: string) {
    return collection(db, 'users', userId, 'lists', listId, LIST_ITEM_PAGES_COLLECTION);
  }

  private getListItemPageRef(userId: string, listId: string, page: number) {
    return doc(
      db,
      'users',
      userId,
      'lists',
      listId,
      LIST_ITEM_PAGES_COLLECTION,
      getListItemPageDocId(page)
    );
  }

  /** Page layouts from the last load or write, keyed `${userId}/${listId}`. */
  private readonly knownLayouts = new Map<string, KnownListLayout>();

  /** Writes per list, so a slow read can't replace a layout a newer write recorded. */
  private readonly layoutWrites = new LayoutWriteTracker();

  private layoutKey(userId: string, listId: string) {
    return `${userId}/${listId}`;
  }

  /** Forgets every remembered layout (tests; also safe to call on sign-out). */
  clearListLayouts() {
    this.knownLayouts.clear();
  }

  /**
   * Remembers where each list's items live, so adds and removes go to the right page without
   * extra reads. `useLists` calls this with cached data, including data restored from disk.
   */
  rememberListLayouts(userId: string, lists: UserList[]) {
    lists.forEach((list) => {
      const key = this.layoutKey(userId, list.id);
      const layout = getUserListLayout(list);
      // Cached data can predate a page this device just created; never forget a page,
      // or a later removal would skip it.
      const existing = this.knownLayouts.get(key);
      if (existing && existing.layout.pageCount > layout.pageCount) {
        return;
      }
      const keys = new Set(Object.keys(list.items ?? {}));
      if (existing && existing.layout.pageCount === layout.pageCount) {
        // Optimistic cache updates don't carry page positions; keep the ones this service
        // recorded when it wrote those items, or a later update would land on page 0.
        Object.entries(existing.layout.overflowItemPages).forEach(([itemKey, page]) => {
          if (keys.has(itemKey) && layout.overflowItemPages[itemKey] === undefined) {
            layout.overflowItemPages[itemKey] = page;
          }
        });
        // Recount from the item positions, so sizes reflect both those writes and any removals.
        const sizes = new Array<number>(layout.pageCount + 1).fill(0);
        keys.forEach((itemKey) => {
          const page = layout.overflowItemPages[itemKey] ?? 0;
          sizes[page] = (sizes[page] ?? 0) + 1;
        });
        layout.pageSizes = sizes;
      }
      this.knownLayouts.set(key, { keys, layout });
    });
  }

  /**
   * Reads every list document, plus the overflow pages of lists that have them, and merges
   * each list's items. Lists without overflow pages cost no extra reads.
   */
  private async loadMergedListDocs(
    userId: string,
    audit: ListAuditInfo
  ): Promise<
    {
      id: string;
      data: DocumentData;
      items: Record<string, ListMediaItem>;
      layout: ListPageLayout;
    }[]
  > {
    const readStartedAt = this.layoutWrites.startRead();
    const snapshot = await auditedGetDocs(this.getUserListsCollection(userId), {
      path: `users/${userId}/lists`,
      queryKey: audit.queryKey,
      callsite: audit.callsite,
    });

    return Promise.all(
      snapshot.docs.map((listDoc) =>
        this.mergeListDoc(userId, listDoc.id, listDoc.data(), audit, readStartedAt)
      )
    );
  }

  private async mergeListDoc(
    userId: string,
    listId: string,
    data: DocumentData,
    audit: ListAuditInfo,
    readStartedAt: LayoutReadToken
  ) {
    const pageCount = getListPageCount(data);
    const mainItems = (data.items ?? {}) as Record<string, ListMediaItem>;
    let merged = {
      items: mainItems,
      layout: createSinglePageLayout(Object.keys(mainItems).length),
    };

    if (pageCount > 0) {
      const pagesSnapshot = await auditedGetDocs(this.getListItemPagesCollection(userId, listId), {
        path: `users/${userId}/lists/${listId}/${LIST_ITEM_PAGES_COLLECTION}`,
        queryKey: `${audit.queryKey}-pages`,
        callsite: audit.callsite,
      });
      merged = mergeListPages(
        mainItems,
        pageCount,
        pagesSnapshot.docs
          .map((pageDoc: QueryDocumentSnapshot<DocumentData>) => ({
            items: (pageDoc.data().items ?? {}) as Record<string, ListMediaItem>,
            page: parseListItemPageDocId(pageDoc.id) ?? -1,
          }))
          .filter((source) => source.page >= 1)
      );
    }

    if (this.layoutWrites.isCurrent(this.layoutKey(userId, listId), readStartedAt)) {
      this.knownLayouts.set(this.layoutKey(userId, listId), {
        keys: new Set(Object.keys(merged.items)),
        layout: merged.layout,
      });
    }

    return { data, id: listId, items: merged.items, layout: merged.layout };
  }

  private toUserList(
    record: {
      id: string;
      data: DocumentData;
      items: Record<string, ListMediaItem>;
      layout: ListPageLayout;
    },
    { normalizeKeys = true }: { normalizeKeys?: boolean } = {}
  ): UserList {
    const { items: _rawItems, pageCount: _pageCount, ...rest } = record.data;
    const rawList = {
      ...rest,
      id: record.id,
      items: record.items,
    } as UserList;
    const list = normalizeKeys ? this.normalizeList(rawList) : rawList;

    if (record.layout.pageCount > 0) {
      list.pageCount = record.layout.pageCount;
      list.pageSizes = record.layout.pageSizes;
      list.overflowItemPages = record.layout.overflowItemPages;
    }

    return list;
  }

  /**
   * Loads every list with its items merged across overflow pages. Unlike `getUserLists`,
   * default lists that don't exist yet are not added, and item keys are kept exactly as
   * stored (legacy numeric keys are not normalized), so callers can write back by key path.
   */
  async fetchListsWithItems(userId: string, audit: ListAuditInfo): Promise<UserList[]> {
    const records = await this.loadMergedListDocs(userId, audit);
    return records.map((record) => this.toUserList(record, { normalizeKeys: false }));
  }

  /**
   * Adds a list's overflow-page items to a list document that was already read. Item keys are
   * kept as stored. Lists without pages are returned as they are, at no cost.
   */
  async withOverflowPages(userId: string, list: UserList, audit: ListAuditInfo): Promise<UserList> {
    if (getListPageCount(list) === 0) {
      return list;
    }
    const { id, ...data } = list;
    const record = await this.mergeListDoc(userId, id, data, audit, this.layoutWrites.startRead());
    return this.toUserList(record, { normalizeKeys: false });
  }

  /** Loads one list with its items merged across overflow pages; null if it doesn't exist. */
  async getUserList(
    userId: string,
    listId: string,
    audit: ListAuditInfo
  ): Promise<UserList | null> {
    const readStartedAt = this.layoutWrites.startRead();
    const snapshot = await auditedGetDoc(this.getUserListRef(userId, listId), {
      path: `users/${userId}/lists/${listId}`,
      queryKey: audit.queryKey,
      callsite: audit.callsite,
    });
    if (!snapshot.exists()) {
      return null;
    }
    return this.toUserList(
      await this.mergeListDoc(userId, listId, snapshot.data(), audit, readStartedAt)
    );
  }

  /** The list's layout: remembered, or read from Firestore (list document + pages). */
  private async resolveLayout(userId: string, listId: string): Promise<KnownListLayout> {
    const known = this.knownLayouts.get(this.layoutKey(userId, listId));
    if (known) {
      return known;
    }

    const list = await this.getUserList(userId, listId, {
      queryKey: 'listById',
      callsite: 'ListService.resolveLayout',
    });
    // getUserList saved what it read unless a write to this list happened meanwhile (e.g. one
    // that created a page); either way, what's remembered now is the newest layout.
    const current = this.knownLayouts.get(this.layoutKey(userId, listId));
    if (current) {
      return current;
    }
    if (!list) {
      const empty: KnownListLayout = { keys: new Set(), layout: createSinglePageLayout(0) };
      this.knownLayouts.set(this.layoutKey(userId, listId), empty);
      return empty;
    }
    // Superseded by a write that had no layout to update: use it once, but don't remember it.
    return { keys: new Set(Object.keys(list.items)), layout: getUserListLayout(list) };
  }

  /**
   * Remove undefined values from an object to make it Firestore-compatible
   * Firestore doesn't accept undefined values - they must be omitted entirely
   */
  private sanitizeForFirestore<T extends Record<string, any>>(obj: T): Partial<T> {
    const sanitized: any = {};

    Object.keys(obj).forEach((key) => {
      if (obj[key] !== undefined) {
        sanitized[key] = obj[key];
      }
    });

    return sanitized;
  }

  private normalizeList<T extends Partial<UserList>>(list: T): T {
    const rawItems = list.items as Record<string, ListMediaItem> | undefined;
    return {
      ...list,
      items: normalizeListItemsMap(rawItems),
      storedItemKeys: getStoredListItemKeys(rawItems),
    };
  }

  /**
   * Removes entries left by an earlier runtime save that wrote under an item's new-style key
   * (`movie-123`) while the item was stored under its legacy key (`123`), creating an entry
   * holding only `runtimeMinutes`. Such entries sit in the list document. The runtime moves
   * onto the real item when it is in the same document. Runs only when one is found, without
   * blocking the load.
   */
  private repairRuntimeStampLeftovers(
    userId: string,
    records: { id: string; items: Record<string, ListMediaItem>; layout: ListPageLayout }[]
  ): void {
    records.forEach((record) => {
      const updates: Record<string, unknown> = {};
      Object.entries(record.items).forEach(([key, value]) => {
        if (!isRuntimeStampLeftover(value)) return;
        if ((record.layout.overflowItemPages[key] ?? 0) !== 0) return;
        const match = /^(movie|tv)-(\d+)$/.exec(key);
        if (!match) return;
        const legacyKey = getLegacyListItemKey(Number(match[2]));
        const realItem = record.items[legacyKey];
        // Only clean up when the real item is there to keep; never remove anything else.
        if (!realItem || realItem.media_type !== match[1] || realItem.id !== Number(match[2])) {
          return;
        }
        updates[`items.${key}`] = deleteField();
        const minutes = value.runtimeMinutes;
        const realItemInDocument = (record.layout.overflowItemPages[legacyKey] ?? 0) === 0;
        if (
          realItemInDocument &&
          !(realItem.runtimeMinutes != null && realItem.runtimeMinutes > 0) &&
          minutes != null &&
          minutes > 0
        ) {
          updates[`items.${legacyKey}.runtimeMinutes`] = minutes;
        }
      });
      if (Object.keys(updates).length === 0) return;
      console.warn('[ListService] Removing stray runtime entries', {
        listId: record.id,
        count: Object.keys(updates).filter((path) => !path.endsWith('.runtimeMinutes')).length,
      });
      void updateDoc(this.getUserListRef(userId, record.id), updates).catch((error) => {
        console.warn('[ListService] Stray runtime cleanup failed:', error);
      });
    });
  }

  private isCreateFallbackEligibleError(error: unknown): boolean {
    const code = (error as { code?: string })?.code;
    // Intentional: updateDoc on a missing document can surface as permission-denied when
    // rules evaluate resource.data, so we allow fallback from updateDoc to setDoc(..., { merge: true }).
    // This is first-write recovery logic, not a generic auth retry.
    return (
      code === 'not-found' ||
      code === 'firestore/not-found' ||
      code === 'permission-denied' ||
      code === 'firestore/permission-denied'
    );
  }

  async getUserLists(userId: string): Promise<UserList[]> {
    const timeout = createTimeoutWithCleanup(10000);
    const debugLogsEnabled = __DEV__ && READ_OPTIMIZATION_FLAGS.enableServiceQueryDebugLogs;

    try {
      if (debugLogsEnabled) {
        console.log('[ListService.getUserLists:start]', {
          userId,
          path: `users/${userId}/lists`,
        });
      }

      const records = await Promise.race([
        this.loadMergedListDocs(userId, {
          queryKey: 'lists',
          callsite: 'ListService.getUserLists',
        }),
        timeout.promise,
      ]).finally(() => {
        timeout.cancel();
      });

      this.repairRuntimeStampLeftovers(userId, records);
      const lists: UserList[] = records.map((record) => this.toUserList(record));

      const mergedLists = [...lists];

      DEFAULT_LISTS.forEach((defaultList) => {
        if (!mergedLists.find((list) => list.id === defaultList.id)) {
          mergedLists.push({
            id: defaultList.id,
            name: defaultList.name,
            items: {},
            createdAt: Date.now(),
          });
        }
      });

      const defaultListIds = DEFAULT_LISTS.map((list) => list.id);
      mergedLists.sort((a, b) => {
        const aDefaultIndex = defaultListIds.indexOf(a.id);
        const bDefaultIndex = defaultListIds.indexOf(b.id);

        if (aDefaultIndex !== -1 && bDefaultIndex !== -1) {
          return aDefaultIndex - bDefaultIndex;
        }

        if (aDefaultIndex !== -1) return -1;
        if (bDefaultIndex !== -1) return 1;

        return (a.createdAt || 0) - (b.createdAt || 0);
      });

      if (debugLogsEnabled) {
        console.log('[ListService.getUserLists:result]', {
          userId,
          rawDocCount: records.length,
          mergedListCount: mergedLists.length,
          defaultListCount: DEFAULT_LISTS.length,
        });
      }

      return mergedLists;
    } catch (error) {
      if (debugLogsEnabled) {
        console.error('[ListService.getUserLists:error]', {
          userId,
          error,
        });
      }
      throw toFirestoreError(error);
    }
  }

  /**
   * Build a cached membership index for list indicators.
   * Key format: "${mediaId}-${mediaType}" => array of list IDs containing the media item.
   */
  async getListMembershipIndex(userId: string): Promise<ListMembershipIndex> {
    const timeout = createTimeoutWithCleanup(10000);
    const debugLogsEnabled = __DEV__ && READ_OPTIMIZATION_FLAGS.enableServiceQueryDebugLogs;

    try {
      if (debugLogsEnabled) {
        console.log('[ListService.getListMembershipIndex:start]', {
          userId,
          path: `users/${userId}/lists`,
        });
      }

      const records = await Promise.race([
        this.loadMergedListDocs(userId, {
          queryKey: 'list-membership-index',
          callsite: 'ListService.getListMembershipIndex',
        }),
        timeout.promise,
      ]).finally(() => {
        timeout.cancel();
      });

      const index: ListMembershipIndex = {};

      records.forEach((record) => {
        const listId = record.id;
        const listItems = normalizeListItemsMap(record.items);

        Object.values(listItems).forEach((item) => {
          const key = getListMembershipKey(item);
          if (!key) {
            return;
          }

          const existingListIds = index[key] || [];
          if (!existingListIds.includes(listId)) {
            existingListIds.push(listId);
            index[key] = existingListIds;
          }
        });
      });

      if (debugLogsEnabled) {
        console.log('[ListService.getListMembershipIndex:result]', {
          userId,
          rawDocCount: records.length,
          indexedMediaCount: Object.keys(index).length,
        });
      }

      return index;
    } catch (error) {
      if (debugLogsEnabled) {
        console.error('[ListService.getListMembershipIndex:error]', {
          userId,
          error,
        });
      }
      throw toFirestoreError(error);
    }
  }

  /**
   * Add a media item to a specific list
   */
  async addToList(listId: string, mediaItem: Omit<ListMediaItem, 'addedAt'>, listName?: string) {
    let failureStage: 'update' | 'fallback-create' | 'overflow-page' | null = null;

    try {
      const user = requireSignedInUser();

      // Sanitize to remove any undefined values (Firestore doesn't accept undefined)
      const sanitizedItem = this.sanitizeForFirestore(mediaItem);

      const itemToAdd: ListMediaItem = {
        ...sanitizedItem,
        addedAt: Date.now(),
      } as ListMediaItem;
      const itemKey = getListItemKey(mediaItem);
      if (!itemKey) {
        throw new Error('This item cannot be added to a list');
      }
      const candidateKeys = getListItemRefCandidateKeys(mediaItem);
      // Seasons never have a legacy numeric key; clearing one would hit the show or a movie.
      const legacyKey = getLegacyListItemKeyForRef(mediaItem);
      const now = Date.now();

      // Resolve the display name without clobbering stored custom names:
      // an explicit listName wins, then the canonical default-list name.
      // A custom list ID (slug) is never used as a name on update, since
      // that would erase spaces from the stored display name.
      const defaultList = DEFAULT_LISTS.find((l) => l.id === listId);
      const resolvedName = listName || defaultList?.name;

      // Large lists spill into overflow pages. Without a known layout, write to the list
      // document as before (no read); a "document too large" error routes to a page instead.
      const known = this.knownLayouts.get(this.layoutKey(user.uid, listId));
      let placement: ListItemPlacement = known
        ? chooseListItemPage(known.layout, (key) => known.keys.has(key), candidateKeys)
        : { createsPage: false, page: 0 };

      if (placement.page === 0) {
        try {
          await this.writeItemToListDocument(
            user.uid,
            listId,
            itemKey,
            itemToAdd,
            legacyKey,
            resolvedName,
            now,
            (stage) => {
              failureStage = stage;
            }
          );
        } catch (error) {
          if (!isDocumentTooLargeError(error)) {
            throw error;
          }
          // The list document is full (possibly filled from another device): use a page.
          this.knownLayouts.delete(this.layoutKey(user.uid, listId));
          const resolved = await this.resolveLayout(user.uid, listId);
          resolved.layout.pageSizes[0] = Math.max(
            resolved.layout.pageSizes[0] ?? 0,
            LIST_PAGE_CAPACITY
          );
          placement = chooseListItemPage(
            resolved.layout,
            (key) => resolved.keys.has(key),
            candidateKeys
          );
          if (placement.page === 0) {
            // The item itself lives in the full document; there is nowhere else to update it.
            throw error;
          }
          failureStage = 'overflow-page';
          await this.writeItemToOverflowPage(
            user.uid,
            listId,
            placement,
            itemKey,
            itemToAdd,
            legacyKey,
            resolvedName,
            now
          );
        }
      } else {
        failureStage = 'overflow-page';
        await this.writeItemToOverflowPage(
          user.uid,
          listId,
          placement,
          itemKey,
          itemToAdd,
          legacyKey,
          resolvedName,
          now
        );
      }

      this.layoutWrites.recordWrite(this.layoutKey(user.uid, listId));
      const knownAfterWrite = this.knownLayouts.get(this.layoutKey(user.uid, listId));
      if (knownAfterWrite) {
        const isNewItem = !candidateKeys.some((key) => knownAfterWrite.keys.has(key));
        recordListItemPlacement(knownAfterWrite.layout, itemKey, placement, isNewItem);
        knownAfterWrite.keys.add(itemKey);
      }

      void trackAddToList({
        listKind: normalizeListKind(listId),
        mediaType: mediaItem.media_type,
      });
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      const firebaseCode = (error as { code?: string })?.code;
      const currentUserId = auth.currentUser?.uid ?? null;
      console.error('[ListService] addToList error:', {
        error,
        code: firebaseCode,
        userId: currentUserId,
        listId,
        mediaId: mediaItem.id,
        stage: failureStage,
      });
      throw new Error(message);
    }
  }

  /** Writes an item into the list document itself (page 0), creating the document if needed. */
  private async writeItemToListDocument(
    userId: string,
    listId: string,
    itemKey: string,
    itemToAdd: ListMediaItem,
    legacyKey: string | null,
    resolvedName: string | undefined,
    now: number,
    setStage: (stage: 'update' | 'fallback-create') => void
  ): Promise<void> {
    const listRef = this.getUserListRef(userId, listId);
    const updateTimeout = createTimeoutWithCleanup(10000);

    // Fast path for existing lists: update without a read.
    const updateData: Record<string, unknown> = {
      [`items.${itemKey}`]: itemToAdd,
      ...(legacyKey ? { [`items.${legacyKey}`]: deleteField() } : {}),
      updatedAt: now,
    };
    if (resolvedName) {
      updateData.name = resolvedName;
    }
    try {
      await Promise.race([updateDoc(listRef, updateData), updateTimeout.promise]);
      return;
    } catch (error) {
      setStage('update');
      if (!this.isCreateFallbackEligibleError(error)) {
        throw error;
      }
    } finally {
      updateTimeout.cancel();
    }

    // Fallback for first write to a missing list doc with a fresh timeout budget.
    // A first-time doc still needs a name; prefer the explicit/default name
    // and only fall back to the slug ID when neither is available.
    const createTimeout = createTimeoutWithCleanup(10000);
    try {
      await Promise.race([
        setDoc(
          listRef,
          {
            name: resolvedName || listId,
            items: {
              [itemKey]: itemToAdd,
            },
            updatedAt: now,
            createdAt: now,
          },
          { merge: true }
        ),
        createTimeout.promise,
      ]);
    } catch (error) {
      setStage('fallback-create');
      throw error;
    } finally {
      createTimeout.cancel();
    }
  }

  /**
   * Writes an item into an overflow page. A new page is created in a transaction that only ever
   * raises the list's `pageCount`, so a device with a stale layout can't hide another's page.
   */
  private async writeItemToOverflowPage(
    userId: string,
    listId: string,
    placement: ListItemPlacement,
    itemKey: string,
    itemToAdd: ListMediaItem,
    legacyKey: string | null,
    resolvedName: string | undefined,
    now: number
  ): Promise<void> {
    const listRef = this.getUserListRef(userId, listId);
    const pageRef = this.getListItemPageRef(userId, listId, placement.page);
    const listUpdate: Record<string, unknown> = {
      ...(legacyKey ? { [`items.${legacyKey}`]: deleteField() } : {}),
      updatedAt: now,
    };
    if (resolvedName) {
      listUpdate.name = resolvedName;
    }

    const timeout = createTimeoutWithCleanup(10000);
    try {
      if (!placement.createsPage) {
        const batch = writeBatch(db);
        batch.set(pageRef, { items: { [itemKey]: itemToAdd }, updatedAt: now }, { merge: true });
        batch.update(listRef, listUpdate);
        await Promise.race([batch.commit(), timeout.promise]);
        return;
      }

      // Set by the transaction (which may run more than once) when an item moves to make room.
      let movedKey: string | null = null;
      await Promise.race([
        runTransaction(db, async (transaction) => {
          movedKey = null;
          const listSnapshot = await transaction.get(listRef);
          const listData = listSnapshot.data();
          const currentPageCount = getListPageCount(listData);
          const pageItems: Record<string, ListMediaItem> = { [itemKey]: itemToAdd };
          const update: Record<string, unknown> = {
            ...listUpdate,
            pageCount: Math.max(currentPageCount, placement.page),
          };

          if (currentPageCount === 0 && placement.page === 1) {
            // Adding `pageCount` grows the list document; one that's full to the byte couldn't
            // take it. Move one existing item onto the new page in this same write.
            const entry = pickEntryToMakeRoom(
              listData?.items as Record<string, ListMediaItem> | undefined,
              isCanonicalListItemKey,
              [itemKey]
            );
            if (entry) {
              const [entryKey, movedItem] = entry;
              pageItems[entryKey] = movedItem;
              update[`items.${entryKey}`] = deleteField();
              movedKey = entryKey;
            }
          }

          transaction.set(
            pageRef,
            {
              items: pageItems,
              updatedAt: now,
              ...(currentPageCount < placement.page ? { createdAt: now } : {}),
            },
            { merge: true }
          );
          transaction.update(listRef, update);
        }),
        timeout.promise,
      ]);

      const known = this.knownLayouts.get(this.layoutKey(userId, listId));
      if (movedKey && known) {
        known.layout.overflowItemPages[movedKey] = 1;
        known.layout.pageSizes[0] = Math.max(0, (known.layout.pageSizes[0] ?? 0) - 1);
        known.layout.pageSizes[1] = (known.layout.pageSizes[1] ?? 0) + 1;
      }
    } finally {
      timeout.cancel();
    }
  }

  /**
   * Remove an entry from a specific list (from the list document and every overflow page).
   * A season needs its `season_number`; an episode its `season_number` and `episode_number`.
   */
  async removeFromList(listId: string, item: ListItemRef) {
    return this.removeManyFromList(listId, [item]);
  }

  /**
   * Remove several entries from one list in a single write (the list document plus every
   * overflow page). Throws without writing anything if any entry can't be keyed.
   */
  async removeManyFromList(listId: string, items: ListItemRef[]) {
    if (items.length === 0) {
      return;
    }

    const timeout = createTimeoutWithCleanup(10000);

    try {
      const user = requireSignedInUser();

      const listRef = this.getUserListRef(user.uid, listId);
      const itemKeys = new Set<string>();
      // Seasons and episodes never have a legacy numeric key; clearing one would hit the show
      // or a movie with the same number.
      const legacyKeys = new Set<string>();
      items.forEach((item) => {
        const itemKey = getListItemKey(item);
        if (!itemKey) {
          throw new Error('This item cannot be removed from a list');
        }
        itemKeys.add(itemKey);
        const legacyKey = getLegacyListItemKeyForRef(item);
        if (legacyKey) {
          legacyKeys.add(legacyKey);
        }
      });
      const removedKeys = [...itemKeys, ...legacyKeys];
      const now = Date.now();
      const known = this.knownLayouts.get(this.layoutKey(user.uid, listId));

      let pageCount = known?.layout.pageCount;
      if (pageCount === undefined) {
        const snapshot = await Promise.race([
          auditedGetDoc(listRef, {
            path: `users/${user.uid}/lists/${listId}`,
            queryKey: 'listById',
            callsite: 'ListService.removeManyFromList',
          }),
          timeout.promise,
        ]);
        pageCount = getListPageCount(snapshot.exists() ? snapshot.data() : undefined);
      }

      const removal: Record<string, unknown> = { updatedAt: now };
      removedKeys.forEach((key) => {
        removal[`items.${key}`] = deleteField();
      });

      if (pageCount === 0) {
        await Promise.race([updateDoc(listRef, removal), timeout.promise]);
      } else {
        const batch = writeBatch(db);
        batch.update(listRef, removal);
        getAllListPages({ pageCount })
          .filter((page) => page > 0)
          .forEach((page) => {
            batch.set(
              this.getListItemPageRef(user.uid, listId, page),
              {
                items: Object.fromEntries([...itemKeys].map((key) => [key, deleteField()])),
                updatedAt: now,
              },
              { merge: true }
            );
          });
        await Promise.race([batch.commit(), timeout.promise]);
      }

      this.layoutWrites.recordWrite(this.layoutKey(user.uid, listId));
      if (known) {
        recordListItemRemoval(known.layout, (key) => known.keys.has(key), removedKeys);
        removedKeys.forEach((key) => known.keys.delete(key));
      }
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      const firebaseCode = (error as { code?: string })?.code;
      const currentUserId = auth.currentUser?.uid ?? null;
      console.error('[ListService] removeManyFromList error:', {
        error,
        code: firebaseCode,
        userId: currentUserId,
        listId,
        items,
      });
      throw new Error(message);
    } finally {
      timeout.cancel();
    }
  }

  /**
   * Update some fields of an entry already in a list, in the document that holds it (the list
   * document, or overflow page `page`), without touching its `addedAt` or the list's
   * `updatedAt`. The entry is read in the same transaction and nothing is written when it isn't
   * there (removed meanwhile, e.g. by a Stremio watch or another device, or held by another
   * page): a field-path update would otherwise create a partial entry with no id or type.
   *
   * @returns Whether the entry was found and updated.
   */
  async updateListItemFields(
    listId: string,
    item: ListItemRef,
    page: number,
    fields: Partial<Omit<ListMediaItem, 'id' | 'media_type' | 'addedAt'>>
  ): Promise<boolean> {
    const timeout = createTimeoutWithCleanup(10000);

    try {
      const user = requireSignedInUser();
      const itemKey = getListItemKey(item);
      if (!itemKey) {
        throw new Error('This item cannot be updated');
      }
      const updates: Record<string, unknown> = {};
      Object.entries(fields).forEach(([field, value]) => {
        if (value !== undefined) {
          updates[`items.${itemKey}.${field}`] = value;
        }
      });
      if (Object.keys(updates).length === 0) {
        return false;
      }
      const ref =
        page > 0
          ? this.getListItemPageRef(user.uid, listId, page)
          : this.getUserListRef(user.uid, listId);
      return await Promise.race([
        runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(ref);
          const items = snapshot.exists()
            ? (snapshot.data()?.items as Record<string, unknown> | undefined)
            : undefined;
          const savedItem = items?.[itemKey] as Partial<ListItemRef> | undefined;
          if (!savedItem || typeof savedItem.id !== 'number') {
            return false;
          }
          transaction.update(ref, updates);
          return true;
        }),
        timeout.promise,
      ]);
    } catch (error) {
      console.error('[ListService] updateListItemFields error:', { error, listId, item });
      throw new Error(getFirestoreErrorMessage(error));
    } finally {
      timeout.cancel();
    }
  }

  /**
   * Save fresh TMDB ratings onto entries of one list document (page 0) or overflow page, in one
   * transaction: 1 read, and 1 write only when a rating changed. `ratings` is keyed by the key
   * each entry is stored under (a legacy entry's numeric id).
   *
   * Each entry is checked against the stored document, not the cache: it must still be there,
   * as the same title, with a stored rating the app would show differently (see
   * `getListRatingUpdate`). Nothing is written for an entry removed meanwhile, since a field-path
   * update would leave a partial entry. `addedAt` and the list's `updatedAt` are left alone, so a
   * refresh doesn't make a list look recently changed.
   */
  async updateListItemRatings(
    listId: string,
    page: number,
    ratings: Record<string, ListItemRatingUpdate>
  ): Promise<ListItemRatingsResult> {
    const storedKeys = Object.keys(ratings);
    if (storedKeys.length === 0) {
      return { updated: [], current: [], missing: [] };
    }
    const timeout = createTimeoutWithCleanup(10000);

    try {
      const user = requireSignedInUser();
      const ref =
        page > 0
          ? this.getListItemPageRef(user.uid, listId, page)
          : this.getUserListRef(user.uid, listId);
      return await Promise.race([
        runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(ref);
          const items = snapshot.exists()
            ? (snapshot.data()?.items as Record<string, Partial<ListMediaItem>> | undefined)
            : undefined;
          const updates: Record<string, number> = {};
          const result: ListItemRatingsResult = { updated: [], current: [], missing: [] };

          storedKeys.forEach((storedKey) => {
            const { mediaType, mediaId, rating } = ratings[storedKey];
            const savedItem = items?.[storedKey];
            if (!savedItem || savedItem.id !== mediaId || savedItem.media_type !== mediaType) {
              result.missing.push(storedKey);
              return;
            }
            const update = getListRatingUpdate(savedItem.vote_average, rating);
            if (update !== null) {
              updates[`items.${storedKey}.vote_average`] = update;
              result.updated.push(storedKey);
            } else if (
              typeof savedItem.vote_average === 'number' &&
              toDisplayedRating(savedItem.vote_average) === toDisplayedRating(rating)
            ) {
              result.current.push(storedKey);
            }
          });

          if (result.updated.length > 0) {
            transaction.update(ref, updates);
          }
          return result;
        }),
        timeout.promise,
      ]);
    } catch (error) {
      console.error('[ListService] updateListItemRatings error:', { error, listId, page });
      throw new Error(getFirestoreErrorMessage(error));
    } finally {
      timeout.cancel();
    }
  }

  /**
   * Create a new custom list
   */
  async createList(listName: string, description?: string) {
    try {
      const user = requireSignedInUser();

      // Generate a URL-friendly ID from the name
      const baseId = listName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let listId = baseId;
      let attempts = 0;
      const maxAttempts = 5;
      const collisionCheckTimeoutMessage = 'List creation collision check timed out';
      const collisionCheckTimeout = createTimeoutWithCleanup(10000, collisionCheckTimeoutMessage);

      try {
        // Check for collisions and generate unique ID
        while (attempts < maxAttempts) {
          const listRef = this.getUserListRef(user.uid, listId);
          const docSnap = await Promise.race([
            auditedGetDoc(listRef, {
              path: `users/${user.uid}/lists/${listId}`,
              queryKey: 'listById',
              callsite: 'ListService.createList',
            }),
            collisionCheckTimeout.promise,
          ]);

          if (!docSnap.exists()) {
            // ID is unique, proceed with creation
            const timeout = createTimeoutWithCleanup(10000);

            const trimmedDescription = description?.trim();
            const listData = this.sanitizeForFirestore({
              name: listName,
              description: trimmedDescription ? trimmedDescription : undefined,
              items: {},
              createdAt: Date.now(),
              isCustom: true,
            });

            try {
              await Promise.race([setDoc(listRef, listData), timeout.promise]);
            } finally {
              timeout.cancel();
            }

            void trackCreateList({
              hasDescription: Boolean(trimmedDescription),
            });
            return listId;
          }

          // ID collision, append random suffix and try again
          attempts++;
          const suffix = Math.random().toString(36).substring(2, 6);
          listId = `${baseId}-${suffix}`;
        }
      } finally {
        collisionCheckTimeout.cancel();
      }

      throw new Error('Could not generate a unique list ID after multiple attempts');
    } catch (error) {
      if (error instanceof Error && error.message === 'List creation collision check timed out') {
        throw new Error('Unable to create list right now, please try again');
      }
      console.error('[ListService] createList error:', error);
      throw toFirestoreError(error);
    }
  }

  /**
   * Delete a custom list
   */
  async deleteList(listId: string) {
    const timeout = createTimeoutWithCleanup(10000);

    try {
      const user = requireSignedInUser();

      // Prevent deleting default lists
      if (DEFAULT_LISTS.some((l) => l.id === listId)) {
        throw new Error('Cannot delete default lists');
      }

      const listRef = this.getUserListRef(user.uid, listId);

      // Always look for overflow pages (another device may have added some since this one
      // last loaded the list) and delete them with the list in one batch, so a list later
      // created with the same id never inherits old items. Deleting is rare; one read is fine.
      const pages = await Promise.race([
        auditedGetDocs(this.getListItemPagesCollection(user.uid, listId), {
          path: `users/${user.uid}/lists/${listId}/${LIST_ITEM_PAGES_COLLECTION}`,
          queryKey: 'list-pages',
          callsite: 'ListService.deleteList',
        }),
        timeout.promise,
      ]);
      await deleteDocWithPages(
        pages.docs.map((pageDoc: QueryDocumentSnapshot<DocumentData>) => pageDoc.ref),
        listRef,
        (operation) => Promise.race([operation, timeout.promise])
      );

      this.layoutWrites.recordWrite(this.layoutKey(user.uid, listId));
      this.knownLayouts.delete(this.layoutKey(user.uid, listId));
    } catch (error) {
      console.error('[ListService] deleteList error:', error);
      throw toFirestoreError(error);
    } finally {
      timeout.cancel();
    }
  }

  /**
   * Rename a custom list
   */
  async renameList(listId: string, newName: string, newDescription?: string) {
    const timeout = createTimeoutWithCleanup(10000);

    try {
      const user = requireSignedInUser();

      // Prevent renaming default lists
      if (DEFAULT_LISTS.some((l) => l.id === listId)) {
        throw new Error('Cannot rename default lists');
      }

      const trimmedName = newName.trim();
      if (!trimmedName) {
        throw new Error('List name cannot be empty');
      }

      const listRef = this.getUserListRef(user.uid, listId);

      // Verify the list exists
      const docSnap = await Promise.race([
        auditedGetDoc(listRef, {
          path: `users/${user.uid}/lists/${listId}`,
          queryKey: 'listById',
          callsite: 'ListService.renameList',
        }),
        timeout.promise,
      ]);
      if (!docSnap.exists()) {
        throw new Error('List not found');
      }

      const trimmedDescription = newDescription?.trim();
      const updateData: Record<string, any> = {
        name: trimmedName,
        updatedAt: Date.now(),
      };

      if (trimmedDescription) {
        updateData.description = trimmedDescription;
      } else {
        updateData.description = deleteField();
      }

      await Promise.race([updateDoc(listRef, updateData), timeout.promise]);
    } catch (error) {
      console.error('[ListService] renameList error:', error);
      throw toFirestoreError(error);
    } finally {
      timeout.cancel();
    }
  }
}

export const listService = new ListService();

/** A list's page layout, from the fields `getUserLists` sets. */
export function getUserListLayout(list: UserList): ListPageLayout {
  if (!list.pageCount || list.pageCount <= 0) {
    return createSinglePageLayout(Object.keys(list.items ?? {}).length);
  }
  return {
    overflowItemPages: { ...(list.overflowItemPages ?? {}) },
    pageCount: list.pageCount,
    pageSizes: [...(list.pageSizes ?? [])],
  };
}

function isDocumentTooLargeError(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && DOCUMENT_TOO_LARGE_PATTERN.test(message);
}
