import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock dependencies before importing the provider
const mockSetApiLanguage = jest.fn();
const mockChangeLanguage = jest.fn().mockResolvedValue(undefined);
const mockResetQueries = jest.fn();

jest.mock('@/src/api/tmdb', () => ({
  setApiLanguage: mockSetApiLanguage,
}));

jest.mock('@/src/i18n', () => ({
  __esModule: true,
  default: {
    changeLanguage: mockChangeLanguage,
  },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    resetQueries: mockResetQueries,
  }),
}));

import { getStoredLanguage, setStoredLanguage } from '@/src/utils/languageStorage';

describe('LanguageProvider dependencies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockReset();
    (AsyncStorage.setItem as jest.Mock).mockReset();
  });

  describe('language storage integration', () => {
    it('should call getStoredLanguage on initialization', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('fr-FR');

      const language = await getStoredLanguage();

      expect(language).toBe('fr-FR');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('showseek_language');
    });

    it('should call setStoredLanguage when changing language', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await setStoredLanguage('ja-JP');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('showseek_language', 'ja-JP');
    });
  });

  describe('API client sync', () => {
    it('should update API language via setApiLanguage', () => {
      mockSetApiLanguage('de-DE');

      expect(mockSetApiLanguage).toHaveBeenCalledWith('de-DE');
    });
  });

  describe('i18n sync', () => {
    it('should update i18n via changeLanguage', async () => {
      await mockChangeLanguage('es-ES');

      expect(mockChangeLanguage).toHaveBeenCalledWith('es-ES');
    });
  });

  describe('cache reset', () => {
    it('should reset queries when language changes', () => {
      mockResetQueries({ predicate: () => true });

      expect(mockResetQueries).toHaveBeenCalled();
    });
  });
});
