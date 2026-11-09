import { foldForSearch } from '@/src/utils/searchText';

describe('foldForSearch', () => {
  it('lowercases, trims and strips accents', () => {
    expect(foldForSearch('  Penélope Cruz ')).toBe('penelope cruz');
    expect(foldForSearch('Zoë Saldaña')).toBe('zoe saldana');
    expect(foldForSearch('Pedro Almodóvar')).toBe('pedro almodovar');
  });

  it('leaves plain text as it is, apart from case', () => {
    expect(foldForSearch('Director')).toBe('director');
  });
});
