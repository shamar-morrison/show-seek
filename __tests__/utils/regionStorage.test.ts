import {
  fetchRegionFromFirebase,
  getStoredRegion,
  setStoredRegion,
  syncRegionToFirebase,
} from '@/src/utils/regionStorage';
import { auth, db } from '@/src/firebase/config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';

describe('regionStorage', () => {
  const mockUserDocRef = { id: 'users/test-user-id' };

  beforeEach(() => {
    jest.clearAllMocks();
    (doc as jest.Mock).mockReturnValue(mockUserDocRef);
    (auth as any).currentUser = {
      uid: 'test-user-id',
      email: 'test@example.com',
    };
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

  describe('syncRegionToFirebase', () => {
    it('should write region to Firebase for authenticated users', async () => {
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await syncRegionToFirebase('CA');

      expect(doc).toHaveBeenCalledWith(db, 'users', 'test-user-id');
      expect(setDoc).toHaveBeenCalledWith(mockUserDocRef, { region: 'CA' }, { merge: true });
    });

    it('should no-op when user is not authenticated', async () => {
      (auth as any).currentUser = null;

      await syncRegionToFirebase('CA');

      expect(setDoc).not.toHaveBeenCalled();
      expect(doc).not.toHaveBeenCalled();
    });
  });

  describe('fetchRegionFromFirebase', () => {
    it('should return region from Firebase when present', async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({ region: 'GB' }),
      });

      const result = await fetchRegionFromFirebase();

      expect(result).toBe('GB');
      expect(doc).toHaveBeenCalledWith(db, 'users', 'test-user-id');
      expect(getDoc).toHaveBeenCalledWith(mockUserDocRef);
    });

    it('should return null when document does not exist', async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => false,
      });

      const result = await fetchRegionFromFirebase();

      expect(result).toBeNull();
    });

    it('should return null when region is missing', async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => ({}),
      });

      const result = await fetchRegionFromFirebase();

      expect(result).toBeNull();
    });

    it('should return null when user is not authenticated', async () => {
      (auth as any).currentUser = null;

      const result = await fetchRegionFromFirebase();

      expect(result).toBeNull();
      expect(getDoc).not.toHaveBeenCalled();
    });

    it('should return null when Firebase fetch fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (getDoc as jest.Mock).mockRejectedValue(new Error('Firestore failure'));

      const result = await fetchRegionFromFirebase();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
