import enUS from '@/src/i18n/locales/en-US.json';
import esES from '@/src/i18n/locales/es-ES.json';
import esMX from '@/src/i18n/locales/es-MX.json';
import frFR from '@/src/i18n/locales/fr-FR.json';
import ptBR from '@/src/i18n/locales/pt-BR.json';
import ptPT from '@/src/i18n/locales/pt-PT.json';

function collectLeafKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, nestedValue]) =>
      collectLeafKeys(nestedValue, prefix ? `${prefix}.${key}` : key)
    )
    .sort();
}

describe('locale parity', () => {
  const referenceKeys = collectLeafKeys(enUS);

  it.each([
    ['es-ES', esES],
    ['es-MX', esMX],
    ['fr-FR', frFR],
    ['pt-BR', ptBR],
    ['pt-PT', ptPT],
  ])('%s mirrors the en-US locale key shape', (_locale, locale) => {
    expect(collectLeafKeys(locale)).toEqual(referenceKeys);
  });
});
