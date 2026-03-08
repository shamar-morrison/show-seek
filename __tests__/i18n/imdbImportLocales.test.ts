import enUS from '@/src/i18n/locales/en-US.json';
import esES from '@/src/i18n/locales/es-ES.json';
import esMX from '@/src/i18n/locales/es-MX.json';
import frFR from '@/src/i18n/locales/fr-FR.json';
import ptBR from '@/src/i18n/locales/pt-BR.json';
import ptPT from '@/src/i18n/locales/pt-PT.json';

function collectKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, nestedValue]) => collectKeys(nestedValue, prefix ? `${prefix}.${key}` : key))
    .sort();
}

describe('IMDb import locale coverage', () => {
  const referenceKeys = collectKeys(enUS.imdbImport);

  it.each([
    ['es-ES', esES.imdbImport],
    ['es-MX', esMX.imdbImport],
    ['fr-FR', frFR.imdbImport],
    ['pt-BR', ptBR.imdbImport],
    ['pt-PT', ptPT.imdbImport],
  ])('%s mirrors the en-US imdbImport key shape', (_locale, imdbImport) => {
    expect(collectKeys(imdbImport)).toEqual(referenceKeys);
  });
});
