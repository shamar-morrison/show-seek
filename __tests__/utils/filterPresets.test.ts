import { DEFAULT_DISCOVER_FILTERS, type DiscoverFilterState } from '@/src/utils/discoverFilters';
import {
  adaptListFiltersForScreen,
  findMatchingDiscoverPreset,
  findMatchingListPreset,
  FULL_LIST_PRESET_CAPS,
  getDiscoverSaveBlocker,
  getListSaveBlocker,
  isListPresetCompatible,
  joinPresetSummary,
  MAX_FILTER_PRESETS_PER_SCOPE,
  normalizeDiscoverPresetFilters,
  normalizeListPresetFilters,
  partitionListPresets,
  sortPresets,
  validatePresetName,
  type DiscoverFilterPreset,
  type ListFilterPreset,
  type ListPresetScreenCaps,
} from '@/src/utils/filterPresets';
import { DEFAULT_WATCH_STATUS_FILTERS, type WatchStatusFilterState } from '@/src/utils/listFilters';

const discoverPreset = (
  id: string,
  filters: Partial<DiscoverFilterState>,
  mediaType: 'movie' | 'tv' = 'movie',
  name = id
): DiscoverFilterPreset => ({
  id,
  scope: 'discover',
  name,
  mediaType,
  filters: { ...DEFAULT_DISCOVER_FILTERS, ...filters },
  createdAt: new Date(2026, 0, 1),
});

const listPreset = (
  id: string,
  filters: Partial<WatchStatusFilterState>,
  name = id
): ListFilterPreset => ({
  id,
  scope: 'list',
  name,
  filters: { ...DEFAULT_WATCH_STATUS_FILTERS, ...filters },
  createdAt: new Date(2026, 0, 1),
});

const MOVIE_ONLY: ListPresetScreenCaps = { mediaType: 'movie', showListFilters: false };

describe('normalizeDiscoverPresetFilters', () => {
  it('fills missing fields from the defaults', () => {
    expect(normalizeDiscoverPresetFilters({ genres: [27] })).toEqual({
      ...DEFAULT_DISCOVER_FILTERS,
      genres: [27],
    });
  });

  it('drops invalid values', () => {
    expect(
      normalizeDiscoverPresetFilters({
        sortBy: 'nonsense',
        genres: [27, 'x', -1, 27],
        genreOperator: 'xor',
        year: 'abc',
        rating: 42,
        runtime: 'forever',
        language: '',
        watchProviders: [8, 1.5],
      })
    ).toEqual({ ...DEFAULT_DISCOVER_FILTERS, genres: [27], watchProviders: [8] });
  });

  it('resets the genre operator when no genres are kept', () => {
    expect(normalizeDiscoverPresetFilters({ genreOperator: 'and' }).genreOperator).toBe('or');
    expect(
      normalizeDiscoverPresetFilters({ genres: [1], genreOperator: 'and' }).genreOperator
    ).toBe('and');
  });

  it('handles non-object input', () => {
    expect(normalizeDiscoverPresetFilters(null)).toEqual(DEFAULT_DISCOVER_FILTERS);
  });
});

describe('normalizeListPresetFilters', () => {
  it('keeps valid values', () => {
    const filters: WatchStatusFilterState = {
      genres: [18],
      genreOperator: 'and',
      year: 1999,
      rating: 7,
      mediaType: 'tv',
      runtime: '30to60',
      userRating: 8,
    };
    expect(normalizeListPresetFilters(filters)).toEqual(filters);
  });

  it('drops invalid values', () => {
    expect(normalizeListPresetFilters({ mediaType: 'book', userRating: 12, runtime: 'x' })).toEqual(
      DEFAULT_WATCH_STATUS_FILTERS
    );
    expect(normalizeListPresetFilters({ userRating: 'rated' }).userRating).toBe('rated');
  });
});

describe('validatePresetName', () => {
  const existing = [listPreset('a', {}, 'Horror Nights')];

  it('rejects empty and whitespace-only names', () => {
    expect(validatePresetName('   ', existing)).toBe('empty');
  });

  it('rejects names over 40 characters', () => {
    expect(validatePresetName('x'.repeat(41), existing)).toBe('tooLong');
    expect(validatePresetName('x'.repeat(40), existing)).toBeNull();
  });

  it('rejects duplicates ignoring case and extra spaces', () => {
    expect(validatePresetName('  horror   nights ', existing)).toBe('duplicate');
  });

  it('lets a preset keep its own name', () => {
    expect(validatePresetName('Horror Nights', existing, 'a')).toBeNull();
  });
});

describe('findMatchingDiscoverPreset', () => {
  const presets = [discoverPreset('horror', { genres: [27, 53] })];

  it('matches regardless of genre order', () => {
    expect(
      findMatchingDiscoverPreset(presets, 'movie', {
        ...DEFAULT_DISCOVER_FILTERS,
        genres: [53, 27],
      })?.id
    ).toBe('horror');
  });

  it('does not match on the other tab', () => {
    expect(
      findMatchingDiscoverPreset(presets, 'tv', { ...DEFAULT_DISCOVER_FILTERS, genres: [27, 53] })
    ).toBeUndefined();
  });

  it('never matches the defaults', () => {
    expect(
      findMatchingDiscoverPreset([discoverPreset('empty', {})], 'movie', DEFAULT_DISCOVER_FILTERS)
    ).toBeUndefined();
  });
});

describe('list preset compatibility', () => {
  it('hides presets using list-only filters on screens without them', () => {
    expect(isListPresetCompatible(listPreset('r', { runtime: 'under30' }), MOVIE_ONLY)).toBe(false);
    expect(isListPresetCompatible(listPreset('u', { userRating: 'rated' }), MOVIE_ONLY)).toBe(
      false
    );
  });

  it('hides presets for the other media type on single-type screens', () => {
    expect(isListPresetCompatible(listPreset('tv', { mediaType: 'tv' }), MOVIE_ONLY)).toBe(false);
    expect(isListPresetCompatible(listPreset('mv', { mediaType: 'movie' }), MOVIE_ONLY)).toBe(true);
    expect(isListPresetCompatible(listPreset('all', { rating: 7 }), MOVIE_ONLY)).toBe(true);
  });

  it('allows everything on full list screens', () => {
    expect(
      isListPresetCompatible(
        listPreset('x', { mediaType: 'tv', runtime: 'over150', userRating: 9 }),
        FULL_LIST_PRESET_CAPS
      )
    ).toBe(true);
  });

  it('counts hidden presets', () => {
    const { compatible, hiddenCount } = partitionListPresets(
      [listPreset('a', { rating: 7 }), listPreset('b', { runtime: 'under30' })],
      MOVIE_ONLY
    );
    expect(compatible.map((p) => p.id)).toEqual(['a']);
    expect(hiddenCount).toBe(1);
  });
});

describe('adaptListFiltersForScreen / findMatchingListPreset', () => {
  it('drops the media type on single-type screens', () => {
    const filters = { ...DEFAULT_WATCH_STATUS_FILTERS, mediaType: 'movie' as const, rating: 7 };
    expect(adaptListFiltersForScreen(filters, MOVIE_ONLY).mediaType).toBe('all');
    expect(adaptListFiltersForScreen(filters, FULL_LIST_PRESET_CAPS).mediaType).toBe('movie');
  });

  it('matches a Movies preset applied on the movie ratings screen', () => {
    const preset = listPreset('m', { mediaType: 'movie', rating: 7 });
    const applied = adaptListFiltersForScreen(preset.filters, MOVIE_ONLY);
    expect(findMatchingListPreset([preset], applied, MOVIE_ONLY)?.id).toBe('m');
  });

  it('does not match incompatible presets', () => {
    const preset = listPreset('r', { rating: 7, runtime: 'under30' });
    expect(findMatchingListPreset([preset], preset.filters, MOVIE_ONLY)).toBeUndefined();
  });

  it('never matches the defaults', () => {
    expect(
      findMatchingListPreset(
        [listPreset('e', {})],
        DEFAULT_WATCH_STATUS_FILTERS,
        FULL_LIST_PRESET_CAPS
      )
    ).toBeUndefined();
  });
});

describe('save blockers', () => {
  it('blocks saving the defaults', () => {
    expect(getDiscoverSaveBlocker([], 'movie', DEFAULT_DISCOVER_FILTERS)).toBe('noFilters');
    expect(getListSaveBlocker([], DEFAULT_WATCH_STATUS_FILTERS)).toBe('noFilters');
  });

  it('blocks duplicate filters but not the same filters on the other tab', () => {
    const presets = [discoverPreset('a', { rating: 7 })];
    const filters = { ...DEFAULT_DISCOVER_FILTERS, rating: 7 };
    expect(getDiscoverSaveBlocker(presets, 'movie', filters)).toBe('duplicateFilters');
    expect(getDiscoverSaveBlocker(presets, 'tv', filters)).toBeNull();
    expect(getDiscoverSaveBlocker(presets, 'movie', filters, 'a')).toBeNull();
  });

  it('blocks duplicate list filters', () => {
    const presets = [listPreset('a', { genres: [1, 2] })];
    expect(getListSaveBlocker(presets, { ...DEFAULT_WATCH_STATUS_FILTERS, genres: [2, 1] })).toBe(
      'duplicateFilters'
    );
  });

  it('blocks new presets at the cap but still allows updates', () => {
    const presets = Array.from({ length: MAX_FILTER_PRESETS_PER_SCOPE }, (_, i) =>
      listPreset(`p${i}`, { year: 1950 + i })
    );
    const filters = { ...DEFAULT_WATCH_STATUS_FILTERS, rating: 9 };
    expect(getListSaveBlocker(presets, filters)).toBe('limitReached');
    expect(getListSaveBlocker(presets, filters, 'p0')).toBeNull();
  });
});

describe('sortPresets', () => {
  it('puts the newest first', () => {
    const older = { ...listPreset('old', {}), createdAt: new Date(2026, 0, 1) };
    const newer = { ...listPreset('new', {}), createdAt: new Date(2026, 5, 1) };
    expect(sortPresets([older, newer]).map((p) => p.id)).toEqual(['new', 'old']);
  });

  it('moves a recently used preset ahead of newer ones', () => {
    const used = {
      ...listPreset('used', {}),
      createdAt: new Date(2026, 0, 1),
      lastUsedAt: new Date(2026, 8, 1),
    };
    const newer = { ...listPreset('new', {}), createdAt: new Date(2026, 5, 1) };
    expect(sortPresets([newer, used]).map((p) => p.id)).toEqual(['used', 'new']);
  });
});

describe('joinPresetSummary', () => {
  it('joins parts with a middle dot', () => {
    expect(joinPresetSummary(['Horror', '7+ stars', 'Netflix'])).toBe(
      'Horror · 7+ stars · Netflix'
    );
  });
});
