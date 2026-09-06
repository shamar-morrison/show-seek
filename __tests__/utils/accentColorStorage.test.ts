jest.mock('@/src/services/UserDocumentCache', () => ({
  getCachedUserDocument: jest.fn(),
  mergeUserDocumentCache: jest.fn(),
}));

import {
  fetchAccentColorFromFirebase,
  getStoredAccentColor,
  setStoredAccentColor,
  syncAccentColorToFirebase,
} from '@/src/utils/accentColorStorage';
import { DEFAULT_ACCENT_COLOR } from '@/src/constants/accentColors';
import { auth, db } from '@/src/firebase/config';
import {
  getCachedUserDocument,
  mergeUserDocumentCache,
} from '@/src/services/UserDocumentCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';

describe('accentColorStorage', () => {
  const mockUserDocRef = { id: 'users/test-user-id' };

  beforeEach(() => {
    jest.clearAllMocks();
    (doc as jest.Mock).mockReturnValue(mockUserDocRef);
    (auth as any).currentUser = {
      uid: 'test-user-id',
      email: 'test@example.com',
    };
  });

  describe('getStoredAccentColor', () => {
    it('should return the stored accent color when valid', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('#3B82F6');

      const result = await getStoredAccentColor();

      expect(result).toBe('#3B82F6');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('showseek_accent_color');
    });

    it('should return the default accent color when nothing is stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await getStoredAccentColor();

      expect(result).toBe(DEFAULT_ACCENT_COLOR);
    });

    it('should return the default accent color for an invalid stored value', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('not-a-color');

      const result = await getStoredAccentColor();

      expect(result).toBe(DEFAULT_ACCENT_COLOR);
    });
  });

  describe('fetchAccentColorFromFirebase', () => {
    it('should force a server read so a web-changed color is picked up on login', async () => {
      (getCachedUserDocument as jest.Mock).mockResolvedValue({
        accentColor: '#10B981',
      });

      const result = await fetchAccentColorFromFirebase();

      expect(result).toBe('#10B981');
      expect(getCachedUserDocument).toHaveBeenCalledWith('test-user-id', {
        forceRefresh: true,
        callsite: 'accentColorStorage.fetchAccentColorFromFirebase',
      });
    });

    it('should return null for an invalid stored color', async () => {
      (getCachedUserDocument as jest.Mock).mockResolvedValue({
        accentColor: 'bogus',
      });

      const result = await fetchAccentColorFromFirebase();

      expect(result).toBeNull();
    });

    it('should return null when the user is not signed in', async () => {
      (auth as any).currentUser = null;

      const result = await fetchAccentColorFromFirebase();

      expect(result).toBeNull();
      expect(getCachedUserDocument).not.toHaveBeenCalled();
    });
  });

  describe('syncAccentColorToFirebase', () => {
    it('should write the top-level accent field and merge the cache', async () => {
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await syncAccentColorToFirebase('#8B5CF6');

      expect(doc).toHaveBeenCalledWith(db, 'users', 'test-user-id');
      expect(setDoc).toHaveBeenCalledWith(
        mockUserDocRef,
        { accentColor: '#8B5CF6' },
        { merge: true }
      );
      expect(mergeUserDocumentCache).toHaveBeenCalledWith('test-user-id', {
        accentColor: '#8B5CF6',
      });
    });

    it('should silently skip syncing for unauthenticated users', async () => {
      (auth as any).currentUser = null;

      await syncAccentColorToFirebase('#8B5CF6');

      expect(setDoc).not.toHaveBeenCalled();
    });
  });

  describe('setStoredAccentColor', () => {
    it('should persist the color to AsyncStorage', async () => {
      await setStoredAccentColor('#F59E0B');

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'showseek_accent_color',
        '#F59E0B'
      );
    });
  });
});
