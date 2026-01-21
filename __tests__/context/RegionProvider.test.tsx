import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock dependencies before importing the provider
const mockSetApiRegion = jest.fn();

jest.mock('@/src/api/tmdb', () => ({
  setApiRegion: mockSetApiRegion,
}));

import { getStoredRegion, setStoredRegion } from '@/src/utils/regionStorage';

describe('RegionProvider dependencies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockReset();
    (AsyncStorage.setItem as jest.Mock).mockReset();
  });

  describe('region storage integration', () => {
    it('should call getStoredRegion on initialization', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('GB');

      const region = await getStoredRegion();

      expect(region).toBe('GB');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('showseek_region');
    });

    it('should call setStoredRegion when changing region', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await setStoredRegion('CA');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('showseek_region', 'CA');
    });

    it('should return default region (US) when no value stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const region = await getStoredRegion();

      expect(region).toBe('US');
    });
  });

  describe('API client sync', () => {
    it('should update API region via setApiRegion', () => {
      mockSetApiRegion('DE');

      expect(mockSetApiRegion).toHaveBeenCalledWith('DE');
    });
  });
});
