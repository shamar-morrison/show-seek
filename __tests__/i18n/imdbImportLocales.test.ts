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
  const referenceIntegrationTabKeys = collectKeys(enUS.profile.tabs.integrations);
  const referenceImportFromImdbKeys = collectKeys(enUS.profile.importFromImdb);
  const referencePremiumImportImdbKeys = collectKeys(
    enUS.premiumFeatures.features['import-imdb']
  );

  it.each([
    ['es-ES', esES.imdbImport, esES],
    ['es-MX', esMX.imdbImport, esMX],
    ['fr-FR', frFR.imdbImport, frFR],
    ['pt-BR', ptBR.imdbImport, ptBR],
    ['pt-PT', ptPT.imdbImport, ptPT],
  ])('%s mirrors the en-US IMDb import key shape', (_locale, imdbImport, locale) => {
    expect(collectKeys(imdbImport)).toEqual(referenceKeys);
    expect(collectKeys(locale.profile.tabs.integrations)).toEqual(referenceIntegrationTabKeys);
    expect(collectKeys(locale.profile.importFromImdb)).toEqual(referenceImportFromImdbKeys);
    expect(collectKeys(locale.premiumFeatures.features['import-imdb'])).toEqual(
      referencePremiumImportImdbKeys
    );
  });
});
