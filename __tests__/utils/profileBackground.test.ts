import {
  dragFocus,
  getCoverGeometry,
  getDefaultFocus,
  getProfileBackgroundPosition,
  getProfileBackgroundUrl,
  sanitizeProfileBackground,
} from '@/src/utils/profileBackground';

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

describe('focus', () => {
  it('keeps a valid focus and drops an invalid one', () => {
    expect(
      sanitizeProfileBackground({ path: '/a.jpg', kind: 'backdrop', focus: { x: 0.2, y: 1 } })
    ).toEqual({ path: '/a.jpg', kind: 'backdrop', focus: { x: 0.2, y: 1 } });
    for (const focus of [{ x: 1.5, y: 0 }, { x: '0.5', y: 0 }, { x: 0.5 }, 'centre']) {
      expect(sanitizeProfileBackground({ path: '/a.jpg', kind: 'backdrop', focus })).toEqual({
        path: '/a.jpg',
        kind: 'backdrop',
      });
    }
  });

  it('defaults backdrops to the centre and posters to the top', () => {
    expect(getDefaultFocus('backdrop')).toEqual({ x: 0.5, y: 0.5 });
    expect(getDefaultFocus('poster')).toEqual({ x: 0.5, y: 0 });
  });

  it('turns the focus into image position percentages', () => {
    expect(getProfileBackgroundPosition({ path: '/a.jpg', kind: 'poster' })).toEqual({
      left: '50%',
      top: '0%',
    });
    expect(
      getProfileBackgroundPosition({ path: '/a.jpg', kind: 'backdrop', focus: { x: 0.25, y: 1 } })
    ).toEqual({ left: '25%', top: '100%' });
  });
});

describe('getCoverGeometry', () => {
  it('scales a backdrop to cover a taller frame, overflowing sideways', () => {
    // 1920x1080 into 390x260: height decides the scale.
    const g = getCoverGeometry({ width: 1920, height: 1080 }, { width: 390, height: 260 });
    expect(g.height).toBeCloseTo(260);
    expect(g.width).toBeCloseTo(462.2, 1);
    expect(g.overflowX).toBeCloseTo(72.2, 1);
    expect(g.overflowY).toBe(0);
  });

  it('scales a poster to cover a wide frame, overflowing downwards', () => {
    const g = getCoverGeometry({ width: 2000, height: 3000 }, { width: 390, height: 260 });
    expect(g.width).toBeCloseTo(390);
    expect(g.overflowY).toBeCloseTo(325);
    expect(g.overflowX).toBe(0);
  });
});

describe('dragFocus', () => {
  const geometry = { overflowX: 100, overflowY: 200 };

  it('moves the focus against the drag, by the share of the overflow dragged', () => {
    // Dragging the image right and down shows more of its left and top.
    expect(dragFocus({ x: 0.5, y: 0.5 }, 25, 50, geometry)).toEqual({ x: 0.25, y: 0.25 });
    expect(dragFocus({ x: 0.5, y: 0.5 }, -25, -50, geometry)).toEqual({ x: 0.75, y: 0.75 });
  });

  it('stops at the edges', () => {
    expect(dragFocus({ x: 0.5, y: 0.5 }, 500, -900, geometry)).toEqual({ x: 0, y: 1 });
  });

  it("doesn't move an axis with no overflow", () => {
    expect(dragFocus({ x: 0.5, y: 0.3 }, 40, 40, { overflowX: 0, overflowY: 100 })).toEqual({
      x: 0.5,
      y: 0,
    });
  });
});
