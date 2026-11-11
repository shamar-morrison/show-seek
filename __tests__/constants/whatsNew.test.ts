import { CURRENT_WHATS_NEW } from '@/src/constants/whatsNew';
import enUS from '@/src/i18n/locales/en-US.json';
import esES from '@/src/i18n/locales/es-ES.json';
import esMX from '@/src/i18n/locales/es-MX.json';
import frFR from '@/src/i18n/locales/fr-FR.json';
import ptBR from '@/src/i18n/locales/pt-BR.json';
import ptPT from '@/src/i18n/locales/pt-PT.json';
import trTR from '@/src/i18n/locales/tr-TR.json';

const LOCALES = { enUS, esES, esMX, frFR, ptBR, ptPT, trTR } as Record<string, unknown>;

const lookup = (dict: unknown, key: string) =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], dict);

describe("current What's New announcement", () => {
  const sections = CURRENT_WHATS_NEW?.sections ?? [];

  it('has unique section ids and an image for each section', () => {
    expect(new Set(sections.map((section) => section.id)).size).toBe(sections.length);
    for (const section of sections) {
      expect(section.visual.type).toBe('image');
    }
  });

  it.each(Object.keys(LOCALES))('has every title and description in %s', (locale) => {
    for (const section of sections) {
      for (const key of [section.titleKey, section.descriptionKey]) {
        const text = lookup(LOCALES[locale], key);
        expect(typeof text).toBe('string');
        expect((text as string).length).toBeGreaterThan(0);
      }
    }
  });
});
