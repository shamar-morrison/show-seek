import {
  areDiscoverFiltersEqual,
  DEFAULT_DISCOVER_FILTERS,
  getDiscoverRuntimeParams,
  hasActiveDiscoverFilters,
} from '@/src/utils/discoverFilters';

describe('getDiscoverRuntimeParams', () => {
  it('sends nothing for any runtime', () => {
    expect(getDiscoverRuntimeParams('any')).toEqual({});
  });

  it('turns each range into inclusive TMDB bounds, matching the list filters', () => {
    // List ranges include the lower end and exclude the upper end.
    expect(getDiscoverRuntimeParams('30to60')).toEqual({ runtimeGte: 30, runtimeLte: 59 });
    expect(getDiscoverRuntimeParams('90to120')).toEqual({ runtimeGte: 90, runtimeLte: 119 });
  });

  it('leaves out titles with no runtime on TMDB from "Under 30 min"', () => {
    expect(getDiscoverRuntimeParams('under30')).toEqual({ runtimeGte: 1, runtimeLte: 29 });
  });

  it('has no upper bound for "Over 2.5 h"', () => {
    expect(getDiscoverRuntimeParams('over150')).toEqual({
      runtimeGte: 150,
      runtimeLte: undefined,
    });
  });
});

describe('areDiscoverFiltersEqual', () => {
  it('ignores genre and provider order', () => {
    expect(
      areDiscoverFiltersEqual(
        { ...DEFAULT_DISCOVER_FILTERS, genres: [28, 18], watchProviders: [8, 9] },
        { ...DEFAULT_DISCOVER_FILTERS, genres: [18, 28], watchProviders: [9, 8] }
      )
    ).toBe(true);
  });

  it('only compares the genre operator while genres are selected', () => {
    expect(
      areDiscoverFiltersEqual(DEFAULT_DISCOVER_FILTERS, {
        ...DEFAULT_DISCOVER_FILTERS,
        genreOperator: 'and',
      })
    ).toBe(true);
    expect(
      areDiscoverFiltersEqual(
        { ...DEFAULT_DISCOVER_FILTERS, genres: [28] },
        { ...DEFAULT_DISCOVER_FILTERS, genres: [28], genreOperator: 'and' }
      )
    ).toBe(false);
  });

  it('notices a runtime change', () => {
    expect(
      areDiscoverFiltersEqual(DEFAULT_DISCOVER_FILTERS, {
        ...DEFAULT_DISCOVER_FILTERS,
        runtime: '60to90',
      })
    ).toBe(false);
  });
});

describe('hasActiveDiscoverFilters', () => {
  it('is false for the defaults and true for any change, including runtime and sort', () => {
    expect(hasActiveDiscoverFilters(DEFAULT_DISCOVER_FILTERS)).toBe(false);
    expect(hasActiveDiscoverFilters({ ...DEFAULT_DISCOVER_FILTERS, runtime: 'over150' })).toBe(
      true
    );
    expect(
      hasActiveDiscoverFilters({ ...DEFAULT_DISCOVER_FILTERS, sortBy: 'vote_average.desc' })
    ).toBe(true);
  });
});
