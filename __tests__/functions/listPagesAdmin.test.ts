const DELETE = '__deleteField__';

jest.mock(
  'firebase-admin/firestore',
  () => ({
    FieldValue: { delete: jest.fn(() => '__deleteField__') },
  }),
  { virtual: true }
);

import {
  commitPagedListWrites,
  planPagedListWrites,
  readPagedList,
  type PagedList,
} from '@/functions/src/listPagesAdmin';
import { LIST_PAGE_CAPACITY } from '@/functions/src/shared/listPages';

type Store = Map<string, Record<string, unknown>>;

/** Minimal Firestore double: docs keyed by path, set() with shallow-deep merge of `items`. */
function createDb(store: Store) {
  const events: string[] = [];
  const ref = (path: string): any => ({
    path,
    id: path.split('/').at(-1),
    get: async () => snapshot(path),
    set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
      events.push(`set ${path}`);
      write(path, data, options?.merge);
    },
    collection: (name: string) => collection(`${path}/${name}`),
  });
  const collection = (path: string): any => ({
    path,
    doc: (id: string) => ref(`${path}/${id}`),
    get: async () => ({
      docs: [...store.keys()]
        .filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
        .map((key) => snapshot(key)),
    }),
  });
  const snapshot = (path: string) => ({
    data: () => store.get(path),
    exists: store.has(path),
    id: path.split('/').at(-1),
    ref: ref(path),
  });
  const write = (path: string, data: Record<string, unknown>, merge?: boolean) => {
    const current = merge ? { ...(store.get(path) ?? {}) } : {};
    Object.entries(data).forEach(([key, value]) => {
      if (key === 'items' && merge) {
        const items = { ...((current.items as Record<string, unknown>) ?? {}) };
        Object.entries(value as Record<string, unknown>).forEach(([itemKey, itemValue]) => {
          if (itemValue === DELETE) delete items[itemKey];
          else items[itemKey] = itemValue;
        });
        current.items = items;
      } else {
        current[key] = value;
      }
    });
    store.set(path, current);
  };
  const db: any = {
    runTransaction: async (run: (tx: any) => Promise<void>) => {
      events.push('transaction');
      await run({
        get: async (target: any) => target.get(),
        set: (target: any, data: Record<string, unknown>, options?: { merge?: boolean }) => {
          events.push(`tx-set ${target.path}`);
          write(target.path, data, options?.merge);
        },
      });
    },
  };
  return { db, events, ref };
}

const LIST = 'users/u/lists/already-watched';
const items = (from: number, count: number) =>
  Object.fromEntries(
    Array.from({ length: count }, (_, i) => [`movie-${from + i}`, { id: from + i, media_type: 'movie' }])
  );

describe('paged list writes (server)', () => {
  it('fills the list document to capacity, then spills new items into new pages', async () => {
    const store: Store = new Map([[LIST, { name: 'Already Watched', items: items(1, LIST_PAGE_CAPACITY - 2) }]]);
    const { db, events, ref } = createDb(store);
    const list = await readPagedList(ref(LIST));

    const plan = planPagedListWrites(list, { set: items(100_000, LIST_PAGE_CAPACITY + 5) });
    expect(plan.createsPages).toBe(true);
    expect(plan.pageCount).toBe(2);
    expect(Object.keys(plan.pageItems.get(0)!)).toHaveLength(2);
    expect(Object.keys(plan.pageItems.get(1)!)).toHaveLength(LIST_PAGE_CAPACITY);
    expect(Object.keys(plan.pageItems.get(2)!)).toHaveLength(3);

    await commitPagedListWrites(db, list, plan, { updatedAt: 1 }, 1);

    // pageCount is registered before any page is written.
    expect(events[0]).toBe('transaction');
    expect(events[1]).toBe(`tx-set ${LIST}`);
    expect(store.get(LIST)!.pageCount).toBe(2);

    const reread = await readPagedList(ref(LIST));
    expect(Object.keys(reread.items)).toHaveLength(2 * LIST_PAGE_CAPACITY + 3);
    expect(reread.layout.pageSizes).toEqual([LIST_PAGE_CAPACITY, LIST_PAGE_CAPACITY, 3]);
  });

  it('updates an existing item where it is and deletes from every page', async () => {
    const store: Store = new Map<string, Record<string, unknown>>([
      [LIST, { items: items(1, 1), pageCount: 1 }],
      [`${LIST}/item_pages/1`, { items: items(2, 2) }],
    ]);
    const { db, ref } = createDb(store);
    const list: PagedList = await readPagedList(ref(LIST));

    const plan = planPagedListWrites(list, {
      delete: ['movie-1'],
      set: { 'movie-3': { id: 3, media_type: 'movie', title: 'Updated' } },
    });
    expect(plan.createsPages).toBe(false);
    expect(plan.pageItems.get(0)).toEqual({ 'movie-1': DELETE });
    expect(plan.pageItems.get(1)).toEqual({
      'movie-1': DELETE,
      'movie-3': { id: 3, media_type: 'movie', title: 'Updated' },
    });

    await commitPagedListWrites(db, list, plan);
    const reread = await readPagedList(ref(LIST));
    expect(Object.keys(reread.items).sort()).toEqual(['movie-2', 'movie-3']);
    expect(reread.items['movie-3']).toMatchObject({ title: 'Updated' });
  });

  it('never lowers a pageCount another writer already raised', async () => {
    const store: Store = new Map([[LIST, { items: items(1, LIST_PAGE_CAPACITY) }]]);
    const { db, ref } = createDb(store);
    const list = await readPagedList(ref(LIST));
    const plan = planPagedListWrites(list, { set: items(9000, 1) });
    // Meanwhile another device created pages 1–3.
    store.set(LIST, { ...store.get(LIST)!, pageCount: 3 });

    await commitPagedListWrites(db, list, plan);

    expect(store.get(LIST)!.pageCount).toBe(3);
  });

  it('reads no pages for a list without overflow', async () => {
    const store: Store = new Map([[LIST, { items: items(1, 3) }]]);
    const { ref } = createDb(store);
    const listRef = ref(LIST);
    const collectionSpy = jest.spyOn(listRef, 'collection');

    const list = await readPagedList(listRef);

    expect(Object.keys(list.items)).toHaveLength(3);
    expect(collectionSpy).not.toHaveBeenCalled();
  });
});
