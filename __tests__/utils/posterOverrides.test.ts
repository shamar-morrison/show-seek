import {
  buildPosterOverrideKey,
  resolvePosterPath,
  sanitizePosterOverrides,
} from '@/src/utils/posterOverrides';

describe('posterOverrides utils', () => {
  it('builds deterministic override keys', () => {
    expect(buildPosterOverrideKey('movie', 42)).toBe('movie_42');
    expect(buildPosterOverrideKey('tv', 7)).toBe('tv_7');
  });

  it('sanitizes malformed override input', () => {
    const raw = {
      movie_10: '/valid-movie.jpg',
      tv_11: '/valid-tv.jpg',
      movie_foo: '/invalid-id.jpg',
      person_12: '/invalid-type.jpg',
      tv_13: '',
      movie_14: 123,
    };

    expect(sanitizePosterOverrides(raw)).toEqual({
      movie_10: '/valid-movie.jpg',
      tv_11: '/valid-tv.jpg',
    });
  });

  it('resolves override first, then falls back to original poster path', () => {
    const overrides = {
      movie_99: '/override.jpg',
    };

    expect(resolvePosterPath(overrides, 'movie', 99, '/fallback.jpg')).toBe('/override.jpg');
    expect(resolvePosterPath(overrides, 'movie', 100, '/fallback.jpg')).toBe('/fallback.jpg');
    expect(resolvePosterPath(overrides, 'tv', 100, null)).toBeNull();
  });
});
