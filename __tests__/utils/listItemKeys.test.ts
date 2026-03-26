import { normalizeListItemsMap } from '@/src/utils/listItemKeys';

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
});
