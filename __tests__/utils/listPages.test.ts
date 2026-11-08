import {
  chooseListItemPage,
  createSinglePageLayout,
  getListPageCount,
  LIST_PAGE_CAPACITY,
  mergeListPages,
  parseListItemPageDocId,
  recordListItemPlacement,
  recordListItemRemoval,
} from '@/functions/src/shared/listPages';

const has = (keys: string[]) => (key: string) => keys.includes(key);

describe('list overflow pages', () => {
  it('merges pages in order, letting a page entry win over a duplicate key', () => {
    const merged = mergeListPages(
      { a: 'main-a', b: 'main-b' },
      2,
      [
        { page: 2, items: { d: 'p2-d' } },
        { page: 1, items: { b: 'p1-b', c: 'p1-c' } },
      ]
    );

    expect(merged.items).toEqual({ a: 'main-a', b: 'p1-b', c: 'p1-c', d: 'p2-d' });
    expect(merged.layout).toEqual({
      overflowItemPages: { b: 1, c: 1, d: 2 },
      pageCount: 2,
      pageSizes: [2, 2, 1],
    });
  });

  it('still reads a page above pageCount (left by a concurrent writer)', () => {
    const merged = mergeListPages({}, 1, [{ page: 2, items: { x: 1 } }]);
    expect(merged.items).toEqual({ x: 1 });
    expect(merged.layout.pageCount).toBe(2);
    expect(merged.layout.pageSizes).toEqual([0, 0, 1]);
  });

  it('keeps an existing item on its page', () => {
    const layout = { overflowItemPages: { b: 2 }, pageCount: 2, pageSizes: [LIST_PAGE_CAPACITY, 5, 1] };
    expect(chooseListItemPage(layout, has(['a', 'b']), ['b'])).toEqual({ createsPage: false, page: 2 });
    expect(chooseListItemPage(layout, has(['a', 'b']), ['a'])).toEqual({ createsPage: false, page: 0 });
    // Legacy key match counts as existing.
    expect(chooseListItemPage(layout, has(['123']), ['movie-123', '123'])).toEqual({
      createsPage: false,
      page: 0,
    });
  });

  it('puts new items on the last page until it is full, then on a new page', () => {
    expect(chooseListItemPage(createSinglePageLayout(10), has([]), ['n'])).toEqual({
      createsPage: false,
      page: 0,
    });
    // A legacy list above capacity keeps its items, but new ones go to page 1.
    expect(chooseListItemPage(createSinglePageLayout(4500), has([]), ['n'])).toEqual({
      createsPage: true,
      page: 1,
    });
    expect(
      chooseListItemPage(
        { overflowItemPages: {}, pageCount: 1, pageSizes: [LIST_PAGE_CAPACITY, LIST_PAGE_CAPACITY - 1] },
        has([]),
        ['n']
      )
    ).toEqual({ createsPage: false, page: 1 });
  });

  it('refuses to allocate a page past the limit instead of writing one readers ignore', () => {
    const full = {
      overflowItemPages: {},
      pageCount: 1000,
      pageSizes: new Array(1001).fill(LIST_PAGE_CAPACITY),
    };
    expect(() => chooseListItemPage(full, has([]), ['n'])).toThrow('maximum size');
  });

  it('tracks placements and removals so consecutive writes keep filling pages', () => {
    const layout = createSinglePageLayout(LIST_PAGE_CAPACITY - 1);
    const placed: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const key = `k${i}`;
      const placement = chooseListItemPage(layout, has(placed), [key]);
      recordListItemPlacement(layout, key, placement, true);
      placed.push(key);
    }
    expect(layout.pageSizes).toEqual([LIST_PAGE_CAPACITY, 2]);
    expect(layout.overflowItemPages).toEqual({ k1: 1, k2: 1 });

    recordListItemRemoval(layout, has(placed), ['k1', 'k0']);
    expect(layout.pageSizes).toEqual([LIST_PAGE_CAPACITY - 1, 1]);
    expect(layout.overflowItemPages).toEqual({ k2: 1 });
  });

  it('parses pageCount and page ids defensively', () => {
    expect(getListPageCount({ pageCount: 3 })).toBe(3);
    expect(getListPageCount({ pageCount: -1 })).toBe(0);
    expect(getListPageCount({ pageCount: '2' })).toBe(0);
    expect(getListPageCount(undefined)).toBe(0);
    // A corrupt value can't make readers allocate billions of pages.
    expect(getListPageCount({ pageCount: 4294967295 })).toBe(1000);
    expect(parseListItemPageDocId('99999999')).toBeNull();
    expect(parseListItemPageDocId('4')).toBe(4);
    expect(parseListItemPageDocId('0')).toBeNull();
    expect(parseListItemPageDocId('01')).toBeNull();
    expect(parseListItemPageDocId('abc')).toBeNull();
  });
});
