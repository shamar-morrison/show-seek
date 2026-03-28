jest.mock('@/src/services/UserDocumentCache', () => ({
  getCachedUserDocument: jest.fn(),
  mergeUserDocumentCache: jest.fn(),
}));

import {
  fetchLanguageFromFirebase,
  getStoredLanguage,
  setStoredLanguage,
  syncLanguageToFirebase,
} from '@/src/utils/languageStorage';
import { auth, db } from '@/src/firebase/config';
import { getCachedUserDocument, mergeUserDocumentCache } from '@/src/services/UserDocumentCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';

describe('languageStorage', () => {
  const mockUserDocRef = { id: 'users/test-user-id' };

  beforeEach(() => {
    jest.clearAllMocks();
    (doc as jest.Mock).mockReturnValue(mockUserDocRef);
    (auth as any).currentUser = {
      uid: 'test-user-id',
      email: 'test@example.com',
    };
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

  describe('syncLanguageToFirebase', () => {
    it('should write language to Firebase for authenticated users', async () => {
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await syncLanguageToFirebase('ja-JP');

      expect(doc).toHaveBeenCalledWith(db, 'users', 'test-user-id');
      expect(setDoc).toHaveBeenCalledWith(mockUserDocRef, { language: 'ja-JP' }, { merge: true });
      expect(mergeUserDocumentCache).toHaveBeenCalledWith('test-user-id', { language: 'ja-JP' });
    });

    it('should no-op when user is not authenticated', async () => {
      (auth as any).currentUser = null;

      await syncLanguageToFirebase('ja-JP');

      expect(doc).not.toHaveBeenCalled();
      expect(setDoc).not.toHaveBeenCalled();
    });
  });

  describe('fetchLanguageFromFirebase', () => {
    it('should return language from Firebase when present', async () => {
      (getCachedUserDocument as jest.Mock).mockResolvedValue({ language: 'fr-FR' });

      const result = await fetchLanguageFromFirebase();

      expect(result).toBe('fr-FR');
      expect(getCachedUserDocument).toHaveBeenCalledWith('test-user-id', {
        callsite: 'languageStorage.fetchLanguageFromFirebase',
      });
    });

    it('should return null for unsupported language codes', async () => {
      (getCachedUserDocument as jest.Mock).mockResolvedValue({ language: 'xx-YY' });

      const result = await fetchLanguageFromFirebase();

      expect(result).toBeNull();
    });

    it('should return null when user is not authenticated', async () => {
      (auth as any).currentUser = null;

      const result = await fetchLanguageFromFirebase();

      expect(result).toBeNull();
      expect(getCachedUserDocument).not.toHaveBeenCalled();
    });

    it('should return null when Firebase fetch fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (getCachedUserDocument as jest.Mock).mockRejectedValue(new Error('Firestore failure'));

      const result = await fetchLanguageFromFirebase();

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
