import { formatTmdbDate, parseTmdbDate } from '@/src/utils/dateUtils';

describe('dateUtils', () => {
  describe('parseTmdbDate', () => {
    it('should parse a valid YYYY-MM-DD date string', () => {
      const result = parseTmdbDate('2024-06-15');
      expect(result.getFullYear()).toBe(2024);
      expect(result.getMonth()).toBe(5); // 0-indexed, June = 5
      expect(result.getDate()).toBe(15);
    });

    it('should parse edge case dates correctly', () => {
      // First day of year
      const jan1 = parseTmdbDate('2024-01-01');
      expect(jan1.getMonth()).toBe(0);
      expect(jan1.getDate()).toBe(1);

      // Last day of year
      const dec31 = parseTmdbDate('2024-12-31');
      expect(dec31.getMonth()).toBe(11);
      expect(dec31.getDate()).toBe(31);
    });

    it('should throw error for empty string', () => {
      expect(() => parseTmdbDate('')).toThrow('Invalid date string: expected non-empty string');
    });

    it('should throw error for null/undefined as string', () => {
      expect(() => parseTmdbDate(null as unknown as string)).toThrow(
        'Invalid date string: expected non-empty string'
      );
    });

    it('should throw error for invalid format', () => {
      // Only throws when parsing results in NaN
      expect(() => parseTmdbDate('not-a-date')).toThrow(
        'Invalid date string: expected YYYY-MM-DD format'
      );
      expect(() => parseTmdbDate('abc-12-34')).toThrow(
        'Invalid date string: expected YYYY-MM-DD format'
      );
    });

    it('should parse date in different order (does not validate format strictly)', () => {
      // Note: The function parses numbers but doesn't validate format
      // '15-06-2024' parses as year=15, month=6, day=2024
      // JavaScript Date wraps this: year 15, month 5 (June), day 2024
      // 2024 days from June = ~5.5 years forward from year 15
      const result = parseTmdbDate('15-06-2024');
      expect(result instanceof Date).toBe(true);
      // The exact year depends on Date's day-overflow behavior
      expect(result.getFullYear()).toBeGreaterThan(14);
    });
  });

  describe('formatTmdbDate', () => {
    it('should format date with default options', () => {
      const result = formatTmdbDate('2024-06-15');
      // Default format: { month: 'short', day: 'numeric', year: 'numeric' }
      expect(result).toBe('Jun 15, 2024');
    });

    it('should format date with custom options', () => {
      const result = formatTmdbDate('2024-06-15', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      expect(result).toBe('June 15, 2024');
    });

    it('should format date with minimal options', () => {
      const result = formatTmdbDate('2024-06-15', { month: 'short', year: 'numeric' });
      expect(result).toBe('Jun 2024');
    });

    it('should handle different months correctly', () => {
      expect(formatTmdbDate('2024-01-01')).toContain('Jan');
      expect(formatTmdbDate('2024-12-25')).toContain('Dec');
    });
  });
});
