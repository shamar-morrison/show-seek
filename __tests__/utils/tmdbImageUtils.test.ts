import { getOptimizedImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';

const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

describe('getOptimizedImageUrl', () => {
  const testPath = '/test-image.jpg';

  describe('when dataSaver is false', () => {
    it('should return null when path is null', () => {
      expect(getOptimizedImageUrl(null, 'poster', 'medium', false)).toBeNull();
    });

    it('should return original size URL', () => {
      const result = getOptimizedImageUrl(testPath, 'poster', 'original', false);
      expect(result).toBe(`${IMAGE_BASE_URL}${TMDB_IMAGE_SIZES.poster.original}${testPath}`);
    });

    it('should return large size URL', () => {
      const result = getOptimizedImageUrl(testPath, 'poster', 'large', false);
      expect(result).toBe(`${IMAGE_BASE_URL}${TMDB_IMAGE_SIZES.poster.large}${testPath}`);
    });

    it('should return medium size URL', () => {
      const result = getOptimizedImageUrl(testPath, 'poster', 'medium', false);
      expect(result).toBe(`${IMAGE_BASE_URL}${TMDB_IMAGE_SIZES.poster.medium}${testPath}`);
    });

    it('should return small size URL', () => {
      const result = getOptimizedImageUrl(testPath, 'poster', 'small', false);
      expect(result).toBe(`${IMAGE_BASE_URL}${TMDB_IMAGE_SIZES.poster.small}${testPath}`);
    });
  });

  describe('when dataSaver is true', () => {
    it('should return null when path is null', () => {
      expect(getOptimizedImageUrl(null, 'poster', 'medium', true)).toBeNull();
    });

    it('should downscale original to large', () => {
      const result = getOptimizedImageUrl(testPath, 'poster', 'original', true);
      expect(result).toBe(`${IMAGE_BASE_URL}${TMDB_IMAGE_SIZES.poster.large}${testPath}`);
    });

    it('should downscale large to medium', () => {
      const result = getOptimizedImageUrl(testPath, 'poster', 'large', true);
      expect(result).toBe(`${IMAGE_BASE_URL}${TMDB_IMAGE_SIZES.poster.medium}${testPath}`);
    });

    it('should downscale medium to small', () => {
      const result = getOptimizedImageUrl(testPath, 'poster', 'medium', true);
      expect(result).toBe(`${IMAGE_BASE_URL}${TMDB_IMAGE_SIZES.poster.small}${testPath}`);
    });

    it('should keep small as small', () => {
      const result = getOptimizedImageUrl(testPath, 'poster', 'small', true);
      expect(result).toBe(`${IMAGE_BASE_URL}${TMDB_IMAGE_SIZES.poster.small}${testPath}`);
    });
  });

  describe('image types', () => {
    it('should work for backdrop images', () => {
      const result = getOptimizedImageUrl(testPath, 'backdrop', 'large', true);
      expect(result).toBe(`${IMAGE_BASE_URL}${TMDB_IMAGE_SIZES.backdrop.medium}${testPath}`);
    });

    it('should work for profile images', () => {
      const result = getOptimizedImageUrl(testPath, 'profile', 'large', true);
      expect(result).toBe(`${IMAGE_BASE_URL}${TMDB_IMAGE_SIZES.profile.medium}${testPath}`);
    });
  });
});
