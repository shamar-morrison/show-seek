import { getRatingText } from '@/src/utils/ratingHelpers';

describe('ratingHelpers', () => {
  describe('getRatingText', () => {
    it('should return "Terrible" for ratings 1-2 (including 1.5)', () => {
      expect(getRatingText(1)).toBe('Terrible');
      expect(getRatingText(1.5)).toBe('Terrible');
      expect(getRatingText(2)).toBe('Terrible');
    });

    it('should return "Not Good" for ratings 2.5-4', () => {
      expect(getRatingText(2.5)).toBe('Not Good');
      expect(getRatingText(3)).toBe('Not Good');
      expect(getRatingText(3.5)).toBe('Not Good');
      expect(getRatingText(4)).toBe('Not Good');
    });

    it('should return "Average" for ratings 4.5-5.5', () => {
      expect(getRatingText(4.5)).toBe('Average');
      expect(getRatingText(5)).toBe('Average');
      expect(getRatingText(5.5)).toBe('Average');
    });

    it('should return "Pretty Good" for ratings 6-7 (including 6.5)', () => {
      expect(getRatingText(6)).toBe('Pretty Good');
      expect(getRatingText(6.5)).toBe('Pretty Good');
      expect(getRatingText(7)).toBe('Pretty Good');
    });

    it('should return "Great" for ratings 7.5-9', () => {
      expect(getRatingText(7.5)).toBe('Great');
      expect(getRatingText(8)).toBe('Great');
      expect(getRatingText(8.5)).toBe('Great');
      expect(getRatingText(9)).toBe('Great');
    });

    it('should return "Masterpiece" for ratings 9.5-10', () => {
      expect(getRatingText(9.5)).toBe('Masterpiece');
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

    it('should return empty string for values outside defined brackets', () => {
      // 0.5 is below the minimum rating of 1
      expect(getRatingText(0.5)).toBe('');
    });
  });
});
