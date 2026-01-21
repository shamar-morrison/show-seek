import { getStoredLanguage, setStoredLanguage } from '@/src/utils/languageStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('languageStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStoredLanguage', () => {
    it('should return stored language when present', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('fr-FR');

      const result = await getStoredLanguage();

      expect(result).toBe('fr-FR');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('showseek_language');
    });

    it('should return default language (en-US) when no value stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await getStoredLanguage();

      expect(result).toBe('en-US');
    });

    it('should return default language (en-US) when error occurs', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const result = await getStoredLanguage();

      expect(result).toBe('en-US');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('setStoredLanguage', () => {
    it('should save language to AsyncStorage', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await setStoredLanguage('ja-JP');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('showseek_language', 'ja-JP');
    });

    it('should throw when error occurs', async () => {
      const storageError = new Error('Storage error');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(storageError);

      await expect(setStoredLanguage('ja-JP')).rejects.toThrow('Storage error');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
