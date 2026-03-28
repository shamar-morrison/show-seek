export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', nativeName: '中文 (简体)', englishName: 'Chinese (Simplified)' },
  { code: 'zh-TW', nativeName: '中文 (繁體)', englishName: 'Chinese (Traditional)' },
  { code: 'da-DK', nativeName: 'Dansk', englishName: 'Danish' },
  { code: 'nl-NL', nativeName: 'Nederlands', englishName: 'Dutch' },
  { code: 'en-US', nativeName: 'English', englishName: 'English' },
  { code: 'fi-FI', nativeName: 'Suomi', englishName: 'Finnish' },
  { code: 'fr-FR', nativeName: 'Français', englishName: 'French' },
  { code: 'de-DE', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'el-GR', nativeName: 'Ελληνικά', englishName: 'Greek' },
  { code: 'hi-IN', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'hu-HU', nativeName: 'Magyar', englishName: 'Hungarian' },
  { code: 'id-ID', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian' },
  { code: 'it-IT', nativeName: 'Italiano', englishName: 'Italian' },
  { code: 'ja-JP', nativeName: '日本語', englishName: 'Japanese' },
  { code: 'ko-KR', nativeName: '한국어', englishName: 'Korean' },
  { code: 'no-NO', nativeName: 'Norsk', englishName: 'Norwegian' },
  { code: 'pl-PL', nativeName: 'Polski', englishName: 'Polish' },
  { code: 'pt-BR', nativeName: 'Português (Brasil)', englishName: 'Portuguese (Brazil)' },
  { code: 'pt-PT', nativeName: 'Português (Portugal)', englishName: 'Portuguese (Portugal)' },
  { code: 'ro-RO', nativeName: 'Română', englishName: 'Romanian' },
  { code: 'ru-RU', nativeName: 'Русский', englishName: 'Russian' },
  { code: 'es-ES', nativeName: 'Español (España)', englishName: 'Spanish (Spain)' },
  { code: 'es-MX', nativeName: 'Español (México)', englishName: 'Spanish (Mexico)' },
  { code: 'sv-SE', nativeName: 'Svenska', englishName: 'Swedish' },
  { code: 'th-TH', nativeName: 'ไทย', englishName: 'Thai' },
  { code: 'tr-TR', nativeName: 'Türkçe', englishName: 'Turkish' },
  { code: 'uk-UA', nativeName: 'Українська', englishName: 'Ukrainian' },
  { code: 'vi-VN', nativeName: 'Tiếng Việt', englishName: 'Vietnamese' },
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: SupportedLanguageCode = 'en-US';

const SUPPORTED_LANGUAGE_CODES = new Set<string>(SUPPORTED_LANGUAGES.map((language) => language.code));

export function isSupportedLanguageCode(language: string): language is SupportedLanguageCode {
  return SUPPORTED_LANGUAGE_CODES.has(language);
}
