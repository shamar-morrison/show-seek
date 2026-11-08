import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { LIST_PAGE_CAPACITY } from '@/functions/src/shared/listPages';

jest.mock('@/src/firebase/config', () => ({
  auth: { currentUser: { uid: 'test-user-id' } },
  db: {},
}));

jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

jest.mock('@/src/services/analytics', () => ({
  normalizeListKind: () => 'custom',
  trackAddToList: jest.fn(),
  trackCreateList: jest.fn(),
}));

import { listService, type UserList } from '@/src/services/ListService';

const USER = 'test-user-id';
const LISTS = `users/${USER}/lists`;

const movie = (id: number) => ({
  id,
  title: `Movie ${id}`,
  poster_path: null,
  media_type: 'movie' as const,
  vote_average: 7,
  release_date: '2020-01-01',
});

const itemsOf = (ids: number[]) =>
  Object.fromEntries(ids.map((id) => [`movie-${id}`, { ...movie(id), addedAt: id }]));

const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => from + i);

const snapshotDoc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
  ref: { path: id },
});

interface MockBatch {
  set: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  commit: jest.Mock;
}

let batches: MockBatch[];

beforeEach(() => {
  jest.clearAllMocks();
  listService.clearListLayouts();
  batches = [];
  (doc as jest.Mock).mockImplementation((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }));
  (collection as jest.Mock).mockImplementation((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }));
  (writeBatch as jest.Mock).mockImplementation(() => {
    const batch: MockBatch = {
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    };
    batches.push(batch);
    return batch;
  });
});

const pagedList = (overrides: Partial<UserList>): UserList => ({
  id: 'already-watched',
  name: 'Already Watched',
  items: {},
  createdAt: 0,
  ...overrides,
});

describe('ListService overflow pages', () => {
  it('merges overflow pages into the list, reading pages only for lists that have them', async () => {
    (getDocs as jest.Mock).mockImplementation(async (ref: { path: string }) => {
      if (ref.path === LISTS) {
        return {
          size: 2,
          docs: [
            snapshotDoc('already-watched', {
              name: 'Already Watched',
              items: itemsOf([1, 2]),
              pageCount: 2,
            }),
            snapshotDoc('favorites', { name: 'Favorites', items: itemsOf([9]) }),
          ],
        };
      }
      if (ref.path === `${LISTS}/already-watched/item_pages`) {
        return {
          size: 2,
          docs: [snapshotDoc('2', { items: itemsOf([5]) }), snapshotDoc('1', { items: itemsOf([3, 4]) })],
        };
      }
      throw new Error(`Unexpected read ${ref.path}`);
    });

    const lists = await listService.getUserLists(USER);
    const alreadyWatched = lists.find((list) => list.id === 'already-watched')!;
    const favorites = lists.find((list) => list.id === 'favorites')!;

    expect(Object.keys(alreadyWatched.items).sort()).toEqual(
      ['movie-1', 'movie-2', 'movie-3', 'movie-4', 'movie-5'].sort()
    );
    expect(alreadyWatched.pageCount).toBe(2);
    expect(alreadyWatched.pageSizes).toEqual([2, 2, 1]);
    expect(alreadyWatched.overflowItemPages).toEqual({ 'movie-3': 1, 'movie-4': 1, 'movie-5': 2 });
    expect(favorites.pageCount).toBeUndefined();
    // One read for the lists, one for the only list with pages.
    expect(getDocs).toHaveBeenCalledTimes(2);
  });

  it('adds to the last overflow page when the list document is full', async () => {
    listService.rememberListLayouts(USER, [
      pagedList({
        items: itemsOf([1, 2]),
        pageCount: 1,
        pageSizes: [LIST_PAGE_CAPACITY, 1],
        overflowItemPages: { 'movie-2': 1 },
      }),
    ]);

    await listService.addToList('already-watched', movie(77));

    expect(updateDoc).not.toHaveBeenCalled();
    expect(batches).toHaveLength(1);
    expect(batches[0].set).toHaveBeenCalledWith(
      { path: `${LISTS}/already-watched/item_pages/1` },
      { items: { 'movie-77': expect.objectContaining({ id: 77 }) }, updatedAt: expect.any(Number) },
      { merge: true }
    );
    expect(batches[0].update).toHaveBeenCalledWith(
      { path: `${LISTS}/already-watched` },
      expect.objectContaining({ 'items.77': '__deleteField__', name: 'Already Watched' })
    );
  });

  it('updates an existing item on the page that holds it', async () => {
    listService.rememberListLayouts(USER, [
      pagedList({
        items: itemsOf([1, 2]),
        pageCount: 2,
        pageSizes: [1, LIST_PAGE_CAPACITY, 1],
        overflowItemPages: { 'movie-2': 1 },
      }),
    ]);

    await listService.addToList('already-watched', movie(2));

    expect(batches[0].set.mock.calls[0][0]).toEqual({
      path: `${LISTS}/already-watched/item_pages/1`,
    });
  });

  it('creates a new page in a transaction that never lowers pageCount', async () => {
    listService.rememberListLayouts(USER, [
      pagedList({
        items: itemsOf([1]),
        pageCount: 1,
        pageSizes: [LIST_PAGE_CAPACITY, LIST_PAGE_CAPACITY],
        overflowItemPages: {},
      }),
    ]);
    const transaction = {
      // Another device already created page 3.
      get: jest.fn().mockResolvedValue({ data: () => ({ pageCount: 3 }) }),
      set: jest.fn(),
      update: jest.fn(),
    };
    (runTransaction as jest.Mock).mockImplementation(async (_db, run) => run(transaction));

    await listService.addToList('already-watched', movie(42));

    expect(transaction.set).toHaveBeenCalledWith(
      { path: `${LISTS}/already-watched/item_pages/2` },
      { items: { 'movie-42': expect.objectContaining({ id: 42 }) }, updatedAt: expect.any(Number) },
      { merge: true }
    );
    expect(transaction.update).toHaveBeenCalledWith(
      { path: `${LISTS}/already-watched` },
      expect.objectContaining({ pageCount: 3 })
    );
  });

  it('moves to an overflow page when an unknown list turns out to be too large', async () => {
    (updateDoc as jest.Mock).mockRejectedValueOnce({
      code: 'invalid-argument',
      message:
        "Document 'users/x/lists/already-watched' cannot be written because its size (1,048,600 bytes) exceeds the maximum allowed size of 1,048,576 bytes.",
    });
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({ name: 'Already Watched', items: itemsOf(range(1, 3)) }),
    });
    const transaction = {
      get: jest.fn().mockResolvedValue({ data: () => ({}) }),
      set: jest.fn(),
      update: jest.fn(),
    };
    (runTransaction as jest.Mock).mockImplementation(async (_db, run) => run(transaction));

    await listService.addToList('already-watched', movie(500));

    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).not.toHaveBeenCalled();
    expect(transaction.set.mock.calls[0][0]).toEqual({
      path: `${LISTS}/already-watched/item_pages/1`,
    });
    expect(transaction.update).toHaveBeenCalledWith(
      { path: `${LISTS}/already-watched` },
      expect.objectContaining({ pageCount: 1 })
    );
  });

  it('removes an item from the list document and every overflow page in one batch', async () => {
    listService.rememberListLayouts(USER, [
      pagedList({
        items: itemsOf([1, 2]),
        pageCount: 2,
        pageSizes: [LIST_PAGE_CAPACITY, LIST_PAGE_CAPACITY, 1],
        overflowItemPages: { 'movie-2': 2 },
      }),
    ]);

    await listService.removeFromList('already-watched', 2, 'movie');

    expect(updateDoc).not.toHaveBeenCalled();
    expect(batches[0].update).toHaveBeenCalledWith(
      { path: `${LISTS}/already-watched` },
      { 'items.movie-2': '__deleteField__', 'items.2': '__deleteField__', updatedAt: expect.any(Number) }
    );
    expect(batches[0].set.mock.calls.map(([ref]) => ref.path)).toEqual([
      `${LISTS}/already-watched/item_pages/1`,
      `${LISTS}/already-watched/item_pages/2`,
    ]);
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
  });

  it('reads pageCount before removing from a list it has not loaded', async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({ pageCount: 1 }),
    });

    await listService.removeFromList('watchlist', 5, 'movie');

    expect(getDoc).toHaveBeenCalledTimes(1);
    expect(batches[0].set.mock.calls.map(([ref]) => ref.path)).toEqual([
      `${LISTS}/watchlist/item_pages/1`,
    ]);
  });

  it('deletes a list together with its overflow pages', async () => {
    (getDocs as jest.Mock).mockResolvedValue({
      size: 2,
      docs: [
        { id: '1', ref: { path: 'page-1' } },
        { id: '2', ref: { path: 'page-2' } },
      ],
    });

    await listService.deleteList('my-list');

    expect(deleteDoc).not.toHaveBeenCalled();
    expect(batches[0].delete.mock.calls.map(([ref]) => ref.path)).toEqual([
      'page-1',
      'page-2',
      `${LISTS}/my-list`,
    ]);
  });

  it('does not forget a page when older cached data is remembered', async () => {
    listService.rememberListLayouts(USER, [
      pagedList({ items: itemsOf([1]), pageCount: 1, pageSizes: [1, 1], overflowItemPages: {} }),
    ]);
    // Cached data from before the page existed.
    listService.rememberListLayouts(USER, [pagedList({ items: itemsOf([1]) })]);

    await listService.removeFromList('already-watched', 1, 'movie');

    expect(getDoc).not.toHaveBeenCalled();
    expect(batches[0].set.mock.calls.map(([ref]) => ref.path)).toEqual([
      `${LISTS}/already-watched/item_pages/1`,
    ]);
  });

  it('keeps item pages it wrote when cached data without them is remembered', async () => {
    const layout = {
      items: itemsOf([1]),
      pageCount: 1,
      pageSizes: [LIST_PAGE_CAPACITY, 1],
      overflowItemPages: {},
    };
    listService.rememberListLayouts(USER, [pagedList(layout)]);
    await listService.addToList('already-watched', movie(9)); // goes to page 1

    // The optimistic cache update has the item, but not its page.
    listService.rememberListLayouts(USER, [
      pagedList({ ...layout, items: { ...itemsOf([1]), ...itemsOf([9]) } }),
    ]);
    await listService.addToList('already-watched', movie(9));

    expect(updateDoc).not.toHaveBeenCalled();
    expect(batches[1].set.mock.calls[0][0]).toEqual({
      path: `${LISTS}/already-watched/item_pages/1`,
    });
  });

  it('moves one existing item onto the first page so pageCount fits a byte-full list', async () => {
    listService.rememberListLayouts(USER, [pagedList({ items: itemsOf([1, 2]) })]);
    // Treat the list document as full, so the next item opens page 1.
    const known = (listService as any).knownLayouts.get(`${USER}/already-watched`);
    known.layout.pageSizes[0] = LIST_PAGE_CAPACITY;
    const transaction = {
      get: jest.fn().mockResolvedValue({ data: () => ({ items: itemsOf([1, 2]) }) }),
      set: jest.fn(),
      update: jest.fn(),
    };
    (runTransaction as jest.Mock).mockImplementation(async (_db, run) => run(transaction));

    await listService.addToList('already-watched', movie(3));

    const [pageRef, pageData] = transaction.set.mock.calls[0];
    expect(pageRef).toEqual({ path: `${LISTS}/already-watched/item_pages/1` });
    expect(Object.keys(pageData.items).sort()).toEqual(['movie-1', 'movie-3']);
    expect(transaction.update).toHaveBeenCalledWith(
      { path: `${LISTS}/already-watched` },
      expect.objectContaining({ pageCount: 1, 'items.movie-1': '__deleteField__' })
    );
    // The moved item is remembered on page 1, so removing it reaches that page.
    expect(known.layout.overflowItemPages['movie-1']).toBe(1);
  });

  it("doesn't let a read that was in flight during a write replace the newer layout", async () => {
    listService.rememberListLayouts(USER, [
      pagedList({ items: itemsOf([1]), pageCount: 1, pageSizes: [1, 0], overflowItemPages: {} }),
    ]);
    let resolveRead!: (value: unknown) => void;
    (getDoc as jest.Mock)
      .mockReturnValueOnce(new Promise((resolve) => (resolveRead = resolve)))
      .mockResolvedValue({ exists: () => true, data: () => ({ pageCount: 1 }) });

    // A slow read starts (it will return data from before the page existed)...
    const slowRead = listService.getUserList(USER, 'already-watched', {
      queryKey: 'test',
      callsite: 'test',
    });
    // ...a write lands meanwhile...
    await listService.removeFromList('already-watched', 9, 'movie');
    // ...then the read completes with stale data.
    resolveRead({ exists: () => true, data: () => ({ name: 'Already Watched', items: itemsOf([1]) }) });
    await slowRead;

    batches = [];
    await listService.removeFromList('already-watched', 1, 'movie');
    expect(batches[0].set.mock.calls.map(([ref]) => ref.path)).toEqual([
      `${LISTS}/already-watched/item_pages/1`,
    ]);
  });

  it('still remembers a list read while a different list was written', async () => {
    listService.rememberListLayouts(USER, [
      pagedList({ id: 'favorites', name: 'Favorites', items: itemsOf([7]) }),
    ]);
    let resolveRead!: (value: unknown) => void;
    (getDoc as jest.Mock)
      .mockReturnValueOnce(new Promise((resolve) => (resolveRead = resolve)))
      .mockResolvedValue({ exists: () => true, data: () => ({}) });
    (getDocs as jest.Mock).mockResolvedValue({
      size: 1,
      docs: [snapshotDoc('1', { items: itemsOf([2]) })],
    });

    const read = listService.getUserList(USER, 'already-watched', {
      queryKey: 'test',
      callsite: 'test',
    });
    await listService.removeFromList('favorites', 7, 'movie');
    resolveRead({
      exists: () => true,
      data: () => ({ name: 'Already Watched', items: itemsOf([1]), pageCount: 1 }),
    });
    await read;

    // The layout it read (with page 1) was kept, so the removal reaches page 1 without a read.
    (getDoc as jest.Mock).mockClear();
    batches = [];
    await listService.removeFromList('already-watched', 2, 'movie');
    expect(getDoc).not.toHaveBeenCalled();
    expect(batches[0].set.mock.calls.map(([ref]) => ref.path)).toEqual([
      `${LISTS}/already-watched/item_pages/1`,
    ]);
  });

  it('recounts page sizes so a removal frees room on the last page', async () => {
    const mainKeys = Array.from({ length: LIST_PAGE_CAPACITY }, (_, i) => i + 1);
    const pageKeys = Array.from({ length: LIST_PAGE_CAPACITY }, (_, i) => 10_000 + i);
    const overflowItemPages = Object.fromEntries(pageKeys.map((id) => [`movie-${id}`, 1]));
    const full = pagedList({
      items: { ...itemsOf(mainKeys), ...itemsOf(pageKeys) },
      pageCount: 1,
      pageSizes: [LIST_PAGE_CAPACITY, LIST_PAGE_CAPACITY],
      overflowItemPages,
    });
    listService.rememberListLayouts(USER, [full]);
    await listService.removeFromList('already-watched', 10_000, 'movie');

    // Cached data after the optimistic removal: the item is gone, the sizes are stale.
    const { 'movie-10000': _removed, ...remaining } = full.items;
    listService.rememberListLayouts(USER, [{ ...full, items: remaining }]);
    batches = [];
    await listService.addToList('already-watched', movie(99_999));

    expect(runTransaction).not.toHaveBeenCalled();
    expect(batches[0].set.mock.calls[0][0]).toEqual({
      path: `${LISTS}/already-watched/item_pages/1`,
    });
  });

  it('deletes more pages than one batch allows in chunks, with the list document last', async () => {
    (getDocs as jest.Mock).mockResolvedValue({
      size: 900,
      docs: Array.from({ length: 900 }, (_, i) => ({ id: String(i + 1), ref: { path: `page-${i + 1}` } })),
    });

    await listService.deleteList('huge-list');

    expect(batches.map((batch) => batch.delete.mock.calls.length)).toEqual([450, 450, 1]);
    expect(batches[2].delete.mock.calls[0][0]).toEqual({ path: `${LISTS}/huge-list` });
  });
});
