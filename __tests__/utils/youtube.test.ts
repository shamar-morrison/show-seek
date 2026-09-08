import { extractYouTubeVideoId } from '@/src/utils/youtube';

describe('extractYouTubeVideoId', () => {
  it('returns null for null, undefined, or empty string', () => {
    expect(extractYouTubeVideoId(null)).toBeNull();
    expect(extractYouTubeVideoId(undefined)).toBeNull();
    expect(extractYouTubeVideoId('')).toBeNull();
    expect(extractYouTubeVideoId('   ')).toBeNull();
  });

  it('returns the ID when passed a plain 11-char ID', () => {
    expect(extractYouTubeVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('s8oE1b2L1-M')).toBe('s8oE1b2L1-M');
    expect(extractYouTubeVideoId('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts ID from standard watch URLs', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('http://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s')).toBe(
      'dQw4w9WgXcQ'
    );
    expect(
      extractYouTubeVideoId('https://www.youtube.com/watch?feature=player_embedded&v=dQw4w9WgXcQ')
    ).toBe('dQw4w9WgXcQ');
  });

  it('extracts ID from short youtu.be URLs', () => {
    expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('http://youtu.be/dQw4w9WgXcQ?t=10')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts ID from embed and mobile URLs', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for invalid strings', () => {
    expect(extractYouTubeVideoId('invalid_id')).toBeNull();
    expect(extractYouTubeVideoId('https://vimeo.com/12345678')).toBeNull();
    expect(extractYouTubeVideoId('https://www.youtube.com/feed/subscriptions')).toBeNull();
  });
});
