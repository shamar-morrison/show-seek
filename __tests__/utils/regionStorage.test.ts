import { getStoredRegion, setStoredRegion } from '@/src/utils/regionStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('regionStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStoredRegion', () => {
    it('should return stored region when present', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('GB');

      const result = await getStoredRegion();

      expect(result).toBe('GB');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('showseek_region');
    });

    it('should return default region (US) when no value stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await getStoredRegion();

      expect(result).toBe('US');
    });

    it('should return default region (US) when error occurs', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const result = await getStoredRegion();

      expect(result).toBe('US');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('setStoredRegion', () => {
    it('should save region to AsyncStorage', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await setStoredRegion('CA');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('showseek_region', 'CA');
    });

    it('should throw when error occurs', async () => {
      const storageError = new Error('Storage error');
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(storageError);

      await expect(setStoredRegion('CA')).rejects.toThrow('Storage error');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
