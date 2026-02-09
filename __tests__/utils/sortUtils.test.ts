import { getSortableTitle } from '@/src/utils/sortUtils';

describe('sortUtils', () => {
  describe('getSortableTitle', () => {
    it('should strip leading "The " from title', () => {
      expect(getSortableTitle('The Matrix')).toBe('matrix');
      expect(getSortableTitle('The Godfather')).toBe('godfather');
      expect(getSortableTitle('The Dark Knight')).toBe('dark knight');
    });

    it('should strip leading "A " from title', () => {
      expect(getSortableTitle('A Quiet Place')).toBe('quiet place');
      expect(getSortableTitle('A Beautiful Mind')).toBe('beautiful mind');
    });

    it('should strip leading "An " from title', () => {
      expect(getSortableTitle('An American Werewolf in London')).toBe(
        'american werewolf in london'
      );
      expect(getSortableTitle('An Officer and a Gentleman')).toBe('officer and a gentleman');
    });

    it('should not strip partial matches (not followed by space)', () => {
      // "Thematic" starts with "The" but not "The " - should not be stripped
      expect(getSortableTitle('Thematic')).toBe('thematic');
      // "Annie" starts with "An" but not "An " - should not be stripped
      expect(getSortableTitle('Annie')).toBe('annie');
      // "Avatar" starts with "A" but not "A " - should not be stripped
      expect(getSortableTitle('Avatar')).toBe('avatar');
    });

    it('should be case insensitive for article detection', () => {
      expect(getSortableTitle('THE Matrix')).toBe('matrix');
      expect(getSortableTitle('THE MATRIX')).toBe('matrix');
      expect(getSortableTitle('the Matrix')).toBe('matrix');
      expect(getSortableTitle('A QUIET PLACE')).toBe('quiet place');
      expect(getSortableTitle('AN AMERICAN WEREWOLF')).toBe('american werewolf');
    });

    it('should handle titles without leading articles', () => {
      expect(getSortableTitle('Avatar')).toBe('avatar');
      expect(getSortableTitle('Inception')).toBe('inception');
      expect(getSortableTitle('Pulp Fiction')).toBe('pulp fiction');
      expect(getSortableTitle('Breaking Bad')).toBe('breaking bad');
    });

    it('should handle empty string', () => {
      expect(getSortableTitle('')).toBe('');
    });

    it('should handle single word titles matching article (no space after)', () => {
      // Edge case: if title is exactly "The" or "A" or "An" (no space after)
      // These should NOT be stripped because there's no trailing space
      // In practice, these wouldn't be valid movie titles
      expect(getSortableTitle('The')).toBe('the');
      expect(getSortableTitle('A')).toBe('a');
      expect(getSortableTitle('An')).toBe('an');
    });

    it('should handle articles in middle of title (should not strip)', () => {
      expect(getSortableTitle('Return of the King')).toBe('return of the king');
      expect(getSortableTitle('Night at the Museum')).toBe('night at the museum');
    });

    it('should sort correctly when used for comparison', () => {
      const titles = ['The Matrix', 'Avatar', 'A Quiet Place', 'Inception', 'The Godfather'];

      const sorted = [...titles].sort((a, b) =>
        getSortableTitle(a).localeCompare(getSortableTitle(b))
      );

      // Expected order (by sortable title):
      // Avatar (avatar), Inception (inception), The Godfather (godfather),
      // The Matrix (matrix), A Quiet Place (quiet place)
      expect(sorted).toEqual([
        'Avatar', // a
        'The Godfather', // g
        'Inception', // i
        'The Matrix', // m
        'A Quiet Place', // q
      ]);
    });
  });
});
