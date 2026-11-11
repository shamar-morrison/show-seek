import { getProfileBackgroundUrl, sanitizeProfileBackground } from '@/src/utils/profileBackground';

describe('sanitizeProfileBackground', () => {
  it('keeps a valid poster or backdrop', () => {
    expect(sanitizeProfileBackground({ path: '/abc_123-x.jpg', kind: 'backdrop' })).toEqual({
      path: '/abc_123-x.jpg',
      kind: 'backdrop',
    });
    expect(sanitizeProfileBackground({ path: '/p.png', kind: 'poster', extra: 1 })).toEqual({
      path: '/p.png',
      kind: 'poster',
    });
  });

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', '/a.jpg'],
    ['a full URL', { path: 'https://evil.example/a.jpg', kind: 'backdrop' }],
    ['a path with folders', { path: '/../a.jpg', kind: 'backdrop' }],
    ['another kind', { path: '/a.jpg', kind: 'still' }],
    ['no extension', { path: '/a', kind: 'poster' }],
  ])('drops %s', (_label, value) => {
    expect(sanitizeProfileBackground(value)).toBeUndefined();
  });
});

describe('getProfileBackgroundUrl', () => {
  it('uses a large TMDB size for each kind', () => {
    expect(getProfileBackgroundUrl({ path: '/b.jpg', kind: 'backdrop' })).toMatch(
      /\/w1280\/b\.jpg$/
    );
    expect(getProfileBackgroundUrl({ path: '/p.jpg', kind: 'poster' })).toMatch(/\/w500\/p\.jpg$/);
  });
});
