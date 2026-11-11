import { languageMatches, matchesSearch, regionMatches } from '@/src/utils/settingsSearch';

describe('settings search', () => {
  it('matches any part of a name, ignoring case and accents, and empty queries match all', () => {
    expect(matchesSearch('', ['anything'])).toBe(true);
    expect(matchesSearch('  ', ['anything'])).toBe(true);
    expect(matchesSearch('FRAN', ['Français'])).toBe(true);
    expect(matchesSearch('francais', ['Français'])).toBe(true);
    expect(matchesSearch('xyz', ['Français', undefined])).toBe(false);
  });

  it('finds languages by native name, English name or code', () => {
    const german = { code: 'de-DE', nativeName: 'Deutsch', englishName: 'German' };
    expect(languageMatches('deutsch', german)).toBe(true);
    expect(languageMatches('german', german)).toBe(true);
    expect(languageMatches('de', german)).toBe(true);
    expect(languageMatches('spanish', german)).toBe(false);
  });

  it('finds regions by name, code or a common other name', () => {
    const uk = { code: 'GB', name: 'United Kingdom' };
    const us = { code: 'US', name: 'United States' };
    expect(regionMatches('kingdom', uk)).toBe(true);
    expect(regionMatches('gb', uk)).toBe(true);
    expect(regionMatches('uk', uk)).toBe(true);
    expect(regionMatches('england', uk)).toBe(true);
    expect(regionMatches('usa', us)).toBe(true);
    expect(regionMatches('america', us)).toBe(true);
    expect(regionMatches('uk', us)).toBe(false);
    expect(regionMatches('holland', { code: 'NL', name: 'Netherlands' })).toBe(true);
    expect(regionMatches('turkiye', { code: 'TR', name: 'Turkey' })).toBe(true);
  });
});
