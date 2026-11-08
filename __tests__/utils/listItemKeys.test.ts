import { getStoredListItemKeys, normalizeListItemsMap } from '@/src/utils/listItemKeys';

describe('listItemKeys utilities', () => {
  it('normalizes valid integer ids into composite keys', () => {
    const normalized = normalizeListItemsMap({
      original: {
        id: 42,
        media_type: 'movie',
        title: 'Example Movie',
      },
    });

    expect(normalized).toEqual({
      'movie-42': {
        id: 42,
        media_type: 'movie',
        title: 'Example Movie',
      },
    });
  });

  it('preserves NaN ids on their original keys', () => {
    const normalized = normalizeListItemsMap({
      original: {
        id: Number.NaN,
        media_type: 'movie',
        title: 'Broken Movie',
      },
    });

    expect(normalized).toEqual({
      original: {
        id: Number.NaN,
        media_type: 'movie',
        title: 'Broken Movie',
      },
    });
  });

  it('preserves Infinity ids on their original keys', () => {
    const normalized = normalizeListItemsMap({
      original: {
        id: Number.POSITIVE_INFINITY,
        media_type: 'tv',
        title: 'Broken Show',
      },
    });

    expect(normalized).toEqual({
      original: {
        id: Number.POSITIVE_INFINITY,
        media_type: 'tv',
        title: 'Broken Show',
      },
    });
  });

  it('preserves non-integer numeric ids on their original keys', () => {
    const normalized = normalizeListItemsMap({
      original: {
        id: 12.5,
        media_type: 'movie',
        title: 'Fractional Movie',
      },
    });

    expect(normalized).toEqual({
      original: {
        id: 12.5,
        media_type: 'movie',
        title: 'Fractional Movie',
      },
    });
  });

  describe('runtime-only leftovers', () => {
    const legacyItem = { id: 123, media_type: 'movie' as const, title: 'Legacy Movie' };

    it('keeps the real legacy item instead of a leftover saved under its new-style key', () => {
      const normalized = normalizeListItemsMap({
        '123': legacyItem,
        'movie-123': { runtimeMinutes: 95 },
      } as any);

      expect(normalized).toEqual({ 'movie-123': { ...legacyItem, runtimeMinutes: 95 } });
    });

    it("doesn't overwrite a runtime the real item already has", () => {
      const normalized = normalizeListItemsMap({
        '123': { ...legacyItem, runtimeMinutes: 100 },
        'movie-123': { runtimeMinutes: 95 },
      } as any);

      expect(normalized['movie-123']).toEqual({ ...legacyItem, runtimeMinutes: 100 });
    });

    it('drops a leftover with no real item', () => {
      expect(normalizeListItemsMap({ 'movie-9': { runtimeMinutes: 95 } } as any)).toEqual({});
    });
  });

  it('maps normalized keys to the legacy keys items are stored under', () => {
    expect(
      getStoredListItemKeys({
        '123': { id: 123, media_type: 'movie' },
        'tv-7': { id: 7, media_type: 'tv' },
        'movie-123': { runtimeMinutes: 95 },
      } as any)
    ).toEqual({ 'movie-123': '123' });
  });
});
