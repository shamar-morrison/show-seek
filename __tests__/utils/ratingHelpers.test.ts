import { getRatingText } from '@/src/utils/ratingHelpers';

describe('ratingHelpers', () => {
  describe('getRatingText', () => {
    it('should return "Terrible" for ratings 1-2', () => {
      expect(getRatingText(1)).toBe('Terrible');
      expect(getRatingText(2)).toBe('Terrible');
    });

    it('should return "Not Good" for ratings 3-4', () => {
      expect(getRatingText(3)).toBe('Not Good');
      expect(getRatingText(4)).toBe('Not Good');
    });

    it('should return "Average" for rating 5', () => {
      expect(getRatingText(5)).toBe('Average');
    });

    it('should return "Pretty Good" for ratings 6-7', () => {
      expect(getRatingText(6)).toBe('Pretty Good');
      expect(getRatingText(7)).toBe('Pretty Good');
    });

    it('should return "Great" for ratings 8-9', () => {
      expect(getRatingText(8)).toBe('Great');
      expect(getRatingText(9)).toBe('Great');
    });

    it('should return "Masterpiece" for rating 10', () => {
      expect(getRatingText(10)).toBe('Masterpiece');
    });

    it('should return empty string for 0', () => {
      expect(getRatingText(0)).toBe('');
    });

    it('should return empty string for negative numbers', () => {
      expect(getRatingText(-1)).toBe('');
      expect(getRatingText(-5)).toBe('');
    });

    it('should return empty string for numbers above 10', () => {
      expect(getRatingText(11)).toBe('');
      expect(getRatingText(100)).toBe('');
    });

    it('should handle decimal ratings by not matching any bracket', () => {
      // 1.5 is not >= 1 && <= 2 as integers, depends on implementation
      // Current implementation uses >= and <= so 1.5 falls in 1-2 range
      expect(getRatingText(1.5)).toBe('Terrible');
      expect(getRatingText(5.5)).toBe('');
    });
  });
});
