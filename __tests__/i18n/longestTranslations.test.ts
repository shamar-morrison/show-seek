// The test language exists in development builds only: load i18n as one.
const originalDev = (global as { __DEV__?: boolean }).__DEV__;
(global as { __DEV__?: boolean }).__DEV__ = true;

/* eslint-disable @typescript-eslint/no-require-imports */
const i18n = require('@/src/i18n').default as typeof import('@/src/i18n').default;
const enUS = require('@/src/i18n/locales/en-US.json');
const {
  buildLongestTranslations,
  isLongestTextEnabled,
  LONGEST_TEXT_LANGUAGE,
  setLongestTextEnabled,
} = require('@/src/i18n/longestTranslations') as typeof import('@/src/i18n/longestTranslations');
/* eslint-enable @typescript-eslint/no-require-imports */

afterAll(() => {
  (global as { __DEV__?: boolean }).__DEV__ = originalDev;
});

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [[path, value] as [string, string]] : leaves(value, path);
  });
}

const placeholders = (text: string) => (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort();

describe('buildLongestTranslations', () => {
  it('keeps the reference shape and picks the longest translation of each key', () => {
    const result = buildLongestTranslations(
      { title: 'Settings', nested: { save: 'Save', count: '{{count}} items' } },
      [
        { title: 'Configurações', nested: { save: 'Salvar' } },
        { title: 'Ajustes', nested: { save: 'Enregistrer', count: '{{count}} éléments' } },
        { title: 42 as unknown as string, extra: 'ignored' },
      ]
    );

    expect(result).toEqual({
      title: 'Configurações',
      nested: { save: 'Enregistrer', count: '{{count}} éléments' },
    });
  });
});

describe('the development "Longest text" bundle', () => {
  const bundle = i18n.getResourceBundle(LONGEST_TEXT_LANGUAGE, 'translation') as Tree;

  it('has every key, each at least as long as English and with the same placeholders', () => {
    const longest = new Map(leaves(bundle));
    const english = leaves(enUS as Tree);

    expect(longest.size).toBe(english.length);
    for (const [key, text] of english) {
      const candidate = longest.get(key);
      expect(candidate?.length ?? 0).toBeGreaterThanOrEqual(text.length);
      // A dropped or renamed placeholder would break the screen showing it.
      expect({ key, placeholders: placeholders(candidate ?? '') }).toEqual({
        key,
        placeholders: placeholders(text),
      });
    }
  });
});

describe('setLongestTextEnabled', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('switches the text to the longest translations and back to the language before', async () => {
    await i18n.changeLanguage('pt-BR');

    await setLongestTextEnabled(true);
    expect(isLongestTextEnabled()).toBe(true);
    expect(i18n.t('tabs.profile')).toBe(
      (i18n.getResourceBundle(LONGEST_TEXT_LANGUAGE, 'translation') as any).tabs.profile
    );
    expect(i18n.t('tabs.profile').length).toBeGreaterThanOrEqual('Configurações'.length);

    await setLongestTextEnabled(false);
    expect(i18n.language).toBe('pt-BR');
    expect(isLongestTextEnabled()).toBe(false);
  });

  it('resolves plurals with the keys every locale has', async () => {
    await setLongestTextEnabled(true);
    expect(i18n.t('watching.skipped', { count: 1 })).toMatch(/^1 /);
    expect(i18n.t('watching.skipped', { count: 3 })).toMatch(/^3 /);
  });
});
