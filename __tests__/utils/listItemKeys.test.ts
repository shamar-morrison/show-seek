import { isCanonicalListItemKey } from '@/functions/src/shared/pagedMap';
import {
  findListItemByRef,
  getLegacyListItemKeyForRef,
  getListItemKey,
  getListItemRefCandidateKeys,
  getStoredListItemKeys,
  isSeasonListItemKey,
  normalizeListItemsMap,
} from '@/src/utils/listItemKeys';

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

describe('season list entries', () => {
  const season = {
    id: 1396,
    media_type: 'season' as const,
    season_number: 3,
    title: 'Breaking Bad · Season 3',
  };
  const specials = {
    id: 1396,
    media_type: 'season' as const,
    season_number: 0,
    title: 'Breaking Bad · Specials',
  };

  it('keys a season by show ID and season number, including specials', () => {
    expect(getListItemKey(season)).toBe('season-1396-3');
    expect(getListItemKey(specials)).toBe('season-1396-0');
  });

  it("can't key a season without a valid season number", () => {
    expect(getListItemKey({ id: 1396, media_type: 'season' as const })).toBeNull();
    expect(getListItemKey({ id: 1396, media_type: 'season', season_number: -1 })).toBeNull();
    expect(getListItemKey({ id: 1396, media_type: 'season', season_number: 1.5 })).toBeNull();
  });

  it('never gives a season a legacy numeric key', () => {
    expect(getListItemRefCandidateKeys(season)).toEqual(['season-1396-3']);
    expect(getLegacyListItemKeyForRef(season)).toBeNull();
    expect(getLegacyListItemKeyForRef({ id: 7, media_type: 'movie' })).toBe('7');
  });

  it("doesn't match a show or a legacy entry with the same ID", () => {
    const items = {
      '1396': { id: 1396, media_type: 'tv' },
      'tv-1396': { id: 1396, media_type: 'tv' },
    };
    expect(findListItemByRef(items, season)).toBeUndefined();
  });

  it('keeps each season of a show apart when normalizing', () => {
    const normalized = normalizeListItemsMap({
      'season-1396-3': season,
      'season-1396-0': specials,
      'tv-1396': { id: 1396, media_type: 'tv', title: 'Breaking Bad' },
    } as any);

    expect(Object.keys(normalized).sort()).toEqual(['season-1396-0', 'season-1396-3', 'tv-1396']);
    expect(getStoredListItemKeys({ 'season-1396-3': season } as any)).toEqual({});
  });

  it('recognizes season keys as canonical page keys', () => {
    expect(isSeasonListItemKey('season-1396-3')).toBe(true);
    expect(isCanonicalListItemKey('season-1396-0')).toBe(true);
    expect(isCanonicalListItemKey('movie-1')).toBe(true);
    expect(isCanonicalListItemKey('season-1396')).toBe(false);
    expect(isCanonicalListItemKey('1396')).toBe(false);
  });
});
