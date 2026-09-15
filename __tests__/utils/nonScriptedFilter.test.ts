import {
  filterNonScriptedTV,
  isTalkOrAwardsShow,
} from '@/src/utils/nonScriptedFilter';

describe('isTalkOrAwardsShow', () => {
  describe('genre layer', () => {
    it('matches Talk (10767) and News (10763) genres', () => {
      expect(isTalkOrAwardsShow({ id: 1, name: 'Some Show', genre_ids: [10767] })).toBe(true);
      expect(isTalkOrAwardsShow({ id: 2, name: 'Some News', genre_ids: [10763] })).toBe(true);
    });

    it('matches Talk even alongside other genres', () => {
      expect(
        isTalkOrAwardsShow({ id: 3, name: 'Late Night Thing', genre_ids: [35, 10767] })
      ).toBe(true);
    });

    it('does not match Reality (10764) or War & Politics (10768) alone', () => {
      expect(isTalkOrAwardsShow({ id: 4, name: 'Survivor', genre_ids: [10764] })).toBe(false);
      expect(
        isTalkOrAwardsShow({ id: 5, name: 'The West Wing', genre_ids: [18, 10768] })
      ).toBe(false);
    });
  });

  describe('ID blocklist', () => {
    it('matches curated IDs without needing genre data', () => {
      expect(isTalkOrAwardsShow({ id: 1408, name: 'Saturday Night Live' })).toBe(true);
      expect(isTalkOrAwardsShow({ id: 2224, name: 'The Daily Show' })).toBe(true);
    });
  });

  describe('exact-title list (popular + niche)', () => {
    it.each([
      ['The Tonight Show Starring Jimmy Fallon', [18]],
      ['Jimmy Kimmel Live!', [35]],
      ['Late Show with Stephen Colbert', [35]],
      ['Late Night with Seth Meyers', [35]],
      ['The Graham Norton Show', [10767]],
      ['The View', [10764]],
      ['Good Morning America', [10763]],
      ['Meet the Press', [10768]],
      ['Talking Dead', [10767]],
      ['Hot Ones', []],
    ])('matches %s', (name, genre_ids) => {
      expect(isTalkOrAwardsShow({ id: 999001, name, genre_ids })).toBe(true);
    });

    it('is punctuation-insensitive', () => {
      expect(
        isTalkOrAwardsShow({ id: 999002, name: 'Jimmy Kimmel Live', genre_ids: [35] })
      ).toBe(true);
    });
  });

  describe('award-ceremony patterns', () => {
    it.each([
      'The 96th Academy Awards',
      'Oscars 2024',
      'Golden Globes 2025',
      '67th Grammy Awards',
      'Primetime Emmy Awards',
      'BAFTA Film Awards',
      'Tony Awards 2024',
      'MTV Video Music Awards',
      'Live from the Red Carpet',
    ])('matches ceremony variant %s', (name) => {
      expect(isTalkOrAwardsShow({ id: 999003, name, genre_ids: [10764] })).toBe(true);
    });
  });

  describe('scripted shows are never matched', () => {
    it.each([
      ['Breaking Bad', [18]],
      ['The Morning Show', [18]],
      ['The Newsroom', [18]],
      ['30 Rock', [35]],
      ['House of Cards', [18, 10768]],
      ['The Sample Show', [18]],
    ])('keeps %s', (name, genre_ids) => {
      expect(isTalkOrAwardsShow({ id: 999004, name, genre_ids })).toBe(false);
    });

    it('keeps the Ellen sitcom (exact-title list has no bare "ellen")', () => {
      expect(isTalkOrAwardsShow({ id: 999005, name: 'Ellen', genre_ids: [35] })).toBe(false);
    });

    it('never matches movies, even with award-like titles', () => {
      expect(
        isTalkOrAwardsShow({ id: 999006, media_type: 'movie', name: 'Oscar', title: 'Oscar' })
      ).toBe(false);
      // Untyped title-only items resolve to movie, same as useContentFilter.
      expect(isTalkOrAwardsShow({ id: 999007, title: 'Oscar' })).toBe(false);
      expect(
        isTalkOrAwardsShow({ id: 999008, media_type: 'movie', title: 'The Oscars' })
      ).toBe(false);
    });

    it('fails open on missing data', () => {
      expect(isTalkOrAwardsShow(null)).toBe(false);
      expect(isTalkOrAwardsShow(undefined)).toBe(false);
      expect(isTalkOrAwardsShow({})).toBe(false);
      expect(isTalkOrAwardsShow({ id: 999009 })).toBe(false);
      expect(isTalkOrAwardsShow({ id: 999010, name: '' })).toBe(false);
    });
  });
});

describe('filterNonScriptedTV', () => {
  const scripted = { id: 1, name: 'Breaking Bad', genre_ids: [18] };
  const talk = { id: 2, name: 'The Tonight Show Starring Jimmy Fallon', genre_ids: [10767] };

  it('returns the same reference when disabled', () => {
    const items = [scripted, talk];
    expect(filterNonScriptedTV(items, false)).toBe(items);
  });

  it('returns the same reference when enabled but nothing matches', () => {
    const items = [scripted];
    expect(filterNonScriptedTV(items, true)).toBe(items);
  });

  it('removes matches when enabled', () => {
    expect(filterNonScriptedTV([scripted, talk], true)).toEqual([scripted]);
  });

  it('handles empty input without allocating', () => {
    const items: typeof scripted[] = [];
    expect(filterNonScriptedTV(items, true)).toBe(items);
  });

  it('filters 10k mixed items fast enough to be unnoticeable', () => {
    const items = Array.from({ length: 10_000 }, (_, i) =>
      i % 10 === 0 ? { ...talk, id: 1_000_000 + i } : { ...scripted, id: 2_000_000 + i }
    );
    const start = Date.now();
    const result = filterNonScriptedTV(items, true);
    const elapsed = Date.now() - start;
    expect(result).toHaveLength(9_000);
    expect(elapsed).toBeLessThan(1000);
  });
});
