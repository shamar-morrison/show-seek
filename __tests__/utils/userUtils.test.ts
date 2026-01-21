import { getInitials } from '@/src/utils/userUtils';

describe('getInitials', () => {
  describe('with display name', () => {
    it('should return first and last initials for full name', () => {
      expect(getInitials('John Doe', 'john@example.com')).toBe('JD');
    });

    it('should return first and last initials for multi-word name', () => {
      expect(getInitials('John Michael Doe', 'john@example.com')).toBe('JD');
    });

    it('should return first two characters for single word name', () => {
      expect(getInitials('John', 'john@example.com')).toBe('JO');
    });

    it('should handle lowercase names', () => {
      expect(getInitials('jane smith', 'jane@example.com')).toBe('JS');
    });

    it('should trim whitespace', () => {
      expect(getInitials('  John Doe  ', 'john@example.com')).toBe('JD');
    });

    it('should handle extra spaces between words', () => {
      expect(getInitials('John    Doe', 'john@example.com')).toBe('JD');
    });
  });

  describe('with email only', () => {
    it('should return first two characters of email when no display name', () => {
      expect(getInitials(null, 'john@example.com')).toBe('JO');
    });

    it('should return first two characters of email when display name is empty', () => {
      expect(getInitials('', 'jane@example.com')).toBe('JA');
    });

    it('should return first two characters of email when display name is whitespace', () => {
      expect(getInitials('   ', 'test@example.com')).toBe('TE');
    });
  });

  describe('guest user fallback', () => {
    it('should return GU when both display name and email are null', () => {
      expect(getInitials(null, null)).toBe('GU');
    });

    it('should return GU when both are empty strings', () => {
      expect(getInitials('', '')).toBe('GU');
    });

    it('should return GU when display name is whitespace and email is empty', () => {
      expect(getInitials('   ', '')).toBe('GU');
    });
  });
});
