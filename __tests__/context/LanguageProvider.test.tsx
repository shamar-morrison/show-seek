// Mock dependencies at module level
const mockSetApiLanguage = jest.fn();
const mockChangeLanguage = jest.fn().mockResolvedValue(undefined);
const mockResetQueries = jest.fn();
const mockQueryClient = {
  resetQueries: (...args: any[]) => mockResetQueries(...args),
};
const mockGetStoredLanguage = jest.fn().mockResolvedValue('en-US');
const mockSetStoredLanguage = jest.fn().mockResolvedValue(undefined);
const mockFetchLanguageFromFirebase = jest.fn().mockResolvedValue(null);
const mockSyncLanguageToFirebase = jest.fn().mockResolvedValue(undefined);
let mockUser: { uid: string; isAnonymous?: boolean } | null = null;
let mockAuthLoading = false;

jest.mock('@/src/api/tmdb', () => ({
  setApiLanguage: (...args: any[]) => mockSetApiLanguage(...args),
  tmdbClient: {
    defaults: { params: {} },
  },
}));

jest.mock('@/src/i18n', () => ({
  __esModule: true,
  default: {
    changeLanguage: (...args: any[]) => mockChangeLanguage(...args),
  },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
}));

jest.mock('@/src/utils/languageStorage', () => ({
  getStoredLanguage: () => mockGetStoredLanguage(),
  setStoredLanguage: (...args: any[]) => mockSetStoredLanguage(...args),
  fetchLanguageFromFirebase: () => mockFetchLanguageFromFirebase(),
  syncLanguageToFirebase: (...args: any[]) => mockSyncLanguageToFirebase(...args),
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: mockAuthLoading,
  }),
}));

import { LanguageProvider, useLanguage } from '@/src/context/LanguageProvider';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('LanguageProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = null;
    mockAuthLoading = false;
    mockGetStoredLanguage.mockResolvedValue('en-US');
    mockSetStoredLanguage.mockResolvedValue(undefined);
    mockChangeLanguage.mockResolvedValue(undefined);
    mockFetchLanguageFromFirebase.mockResolvedValue(null);
    mockSyncLanguageToFirebase.mockResolvedValue(undefined);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <LanguageProvider>{children}</LanguageProvider>
  );

  describe('initialization', () => {
    it('defaults to English when auth settles signed out, ignoring stale storage', async () => {
      mockAuthLoading = true;
      mockGetStoredLanguage.mockResolvedValue('es-ES');

      const { result, rerender } = renderHook(() => useLanguage(), { wrapper });

      expect(result.current.isLanguageReady).toBe(false);
      expect(mockGetStoredLanguage).not.toHaveBeenCalled();

      mockAuthLoading = false;
      rerender({});

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      expect(result.current.language).toBe('en-US');
      expect(mockGetStoredLanguage).not.toHaveBeenCalled();
      expect(mockSetStoredLanguage).toHaveBeenCalledWith('en-US');
    });

    it('waits for auth state to settle before initializing or fetching from Firebase', async () => {
      mockAuthLoading = true;
      mockUser = { uid: 'user-1', isAnonymous: false };
      mockGetStoredLanguage.mockResolvedValue('ja-JP');
      mockFetchLanguageFromFirebase.mockResolvedValue('fr-FR');

      const { result, rerender } = renderHook(() => useLanguage(), { wrapper });

      expect(result.current.isLanguageReady).toBe(false);
      expect(mockGetStoredLanguage).not.toHaveBeenCalled();
      expect(mockFetchLanguageFromFirebase).not.toHaveBeenCalled();

      mockAuthLoading = false;
      rerender({});

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      await waitFor(() => {
        expect(mockGetStoredLanguage).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(mockFetchLanguageFromFirebase).toHaveBeenCalledTimes(1);
      });
    });

    it('loads authenticated language from storage on mount', async () => {
      mockUser = { uid: 'user-1', isAnonymous: false };
      mockGetStoredLanguage.mockResolvedValue('fr-FR');

      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      expect(result.current.language).toBe('fr-FR');
      expect(mockGetStoredLanguage).toHaveBeenCalled();
    });

    it('should sync API language on authenticated initialization', async () => {
      mockUser = { uid: 'user-1', isAnonymous: false };
      mockGetStoredLanguage.mockResolvedValue('ja-JP');

      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      expect(mockSetApiLanguage).toHaveBeenCalledWith('ja-JP');
    });

    it('should sync i18n on authenticated initialization', async () => {
      mockUser = { uid: 'user-1', isAnonymous: false };
      mockGetStoredLanguage.mockResolvedValue('de-DE');

      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      expect(mockChangeLanguage).toHaveBeenCalledWith('de-DE');
    });

    it('restores language from Firebase after login and resets queries', async () => {
      mockUser = { uid: 'user-1', isAnonymous: false };
      mockGetStoredLanguage.mockResolvedValue('en-US');
      mockFetchLanguageFromFirebase.mockResolvedValue('fr-FR');

      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      await waitFor(() => {
        expect(result.current.language).toBe('fr-FR');
      });

      expect(mockFetchLanguageFromFirebase).toHaveBeenCalled();
      expect(mockSetStoredLanguage).toHaveBeenCalledWith('fr-FR');
      expect(mockSetApiLanguage).toHaveBeenCalledWith('fr-FR');
      expect(mockChangeLanguage).toHaveBeenCalledWith('fr-FR');
      expect(mockResetQueries).toHaveBeenCalled();
    });

    it('flushes a newer local language change to Firebase instead of applying the stale fetched value', async () => {
      mockUser = { uid: 'user-1', isAnonymous: false };
      mockGetStoredLanguage.mockResolvedValue('en-US');
      const firebaseLanguage = createDeferred<string | null>();
      mockFetchLanguageFromFirebase.mockReturnValue(firebaseLanguage.promise);

      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      await waitFor(() => {
        expect(mockFetchLanguageFromFirebase).toHaveBeenCalledTimes(1);
      });

      jest.clearAllMocks();

      await act(async () => {
        await result.current.setLanguage('es-ES', { syncToFirebase: false });
      });

      expect(result.current.language).toBe('es-ES');

      await act(async () => {
        firebaseLanguage.resolve('fr-FR');
        await firebaseLanguage.promise;
        await flushMicrotasks();
      });

      await waitFor(() => {
        expect(result.current.language).toBe('es-ES');
      });

      expect(mockSyncLanguageToFirebase).toHaveBeenCalledWith('es-ES', {
        throwOnError: true,
      });
      expect(mockSetApiLanguage).toHaveBeenCalledWith('es-ES');
      expect(mockSetApiLanguage).not.toHaveBeenCalledWith('fr-FR');
      expect(mockSetStoredLanguage).toHaveBeenCalledWith('es-ES');
      expect(mockSetStoredLanguage).not.toHaveBeenCalledWith('fr-FR');
      expect(mockResetQueries).toHaveBeenCalledTimes(1);
    });

    it('does not write back to Firebase when Firebase has no language and there was no local change', async () => {
      mockUser = { uid: 'user-1', isAnonymous: false };
      mockGetStoredLanguage.mockResolvedValue('en-US');
      mockFetchLanguageFromFirebase.mockResolvedValue(null);

      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      await waitFor(() => {
        expect(result.current.language).toBe('en-US');
      });

      expect(mockSyncLanguageToFirebase).not.toHaveBeenCalled();
      expect(mockSetStoredLanguage).not.toHaveBeenCalledWith('fr-FR');
    });

    it('resets to English on logout and keeps the next login from writing back the prior language', async () => {
      mockUser = { uid: 'user-1', isAnonymous: false };
      mockGetStoredLanguage.mockResolvedValue('es-ES');
      mockFetchLanguageFromFirebase.mockResolvedValueOnce('es-ES');

      const { result, rerender } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });
      await waitFor(() => {
        expect(result.current.language).toBe('es-ES');
      });

      jest.clearAllMocks();

      mockUser = null;
      rerender({});

      await waitFor(() => {
        expect(result.current.language).toBe('en-US');
      });
      expect(mockSetStoredLanguage).toHaveBeenCalledWith('en-US');
      expect(mockChangeLanguage).toHaveBeenCalledWith('en-US');
      expect(mockSetApiLanguage).toHaveBeenCalledWith('en-US');

      jest.clearAllMocks();

      mockUser = { uid: 'user-2', isAnonymous: false };
      mockFetchLanguageFromFirebase.mockResolvedValueOnce('en-US');
      rerender({});

      await waitFor(() => {
        expect(mockFetchLanguageFromFirebase).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(result.current.language).toBe('en-US');
      });

      expect(mockSyncLanguageToFirebase).not.toHaveBeenCalled();
    });

    it('retries deferred Firebase sync after a later auth transition when the write fails', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockUser = { uid: 'user-1', isAnonymous: false };
      mockGetStoredLanguage.mockResolvedValue('en-US');
      const firstFirebaseLanguage = createDeferred<string | null>();
      const secondFirebaseLanguage = createDeferred<string | null>();
      mockFetchLanguageFromFirebase
        .mockReturnValueOnce(firstFirebaseLanguage.promise)
        .mockReturnValueOnce(secondFirebaseLanguage.promise);
      mockSyncLanguageToFirebase
        .mockRejectedValueOnce(new Error('Firestore write failed'))
        .mockResolvedValueOnce(undefined);

      const { result, rerender } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });
      await waitFor(() => {
        expect(mockFetchLanguageFromFirebase).toHaveBeenCalledTimes(1);
      });

      await act(async () => {
        await result.current.setLanguage('es-ES', { syncToFirebase: false });
      });

      await act(async () => {
        firstFirebaseLanguage.resolve(null);
        await firstFirebaseLanguage.promise;
        await flushMicrotasks();
      });

      await waitFor(() => {
        expect(mockSyncLanguageToFirebase).toHaveBeenCalledWith('es-ES', {
          throwOnError: true,
        });
      });
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          '[LanguageProvider] Firebase language sync failed:',
          expect.any(Error)
        );
      });

      mockUser = null;
      rerender({});

      await waitFor(() => {
        expect(result.current.language).toBe('en-US');
      });

      mockUser = { uid: 'user-1', isAnonymous: false };
      rerender({});

      await waitFor(() => {
        expect(mockFetchLanguageFromFirebase).toHaveBeenCalledTimes(2);
      });

      await act(async () => {
        await result.current.setLanguage('es-ES', { syncToFirebase: false });
      });

      await act(async () => {
        secondFirebaseLanguage.resolve(null);
        await secondFirebaseLanguage.promise;
        await flushMicrotasks();
      });

      await waitFor(() => {
        expect(mockSyncLanguageToFirebase).toHaveBeenCalledTimes(2);
      });

      consoleSpy.mockRestore();
    });
  });

  describe('setLanguage', () => {
    it('should update language state when setLanguage is called', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      await act(async () => {
        await result.current.setLanguage('es-ES');
      });

      expect(result.current.language).toBe('es-ES');
    });

    it('should call setApiLanguage when language changes', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      jest.clearAllMocks();

      await act(async () => {
        await result.current.setLanguage('pt-BR');
      });

      expect(mockSetApiLanguage).toHaveBeenCalledWith('pt-BR');
    });

    it('should call changeLanguage (i18n) when language changes', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      jest.clearAllMocks();

      await act(async () => {
        await result.current.setLanguage('ko-KR');
      });

      expect(mockChangeLanguage).toHaveBeenCalledWith('ko-KR');
    });

    it('should persist language to storage when changed', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      await act(async () => {
        await result.current.setLanguage('zh-CN');
      });

      expect(mockSetStoredLanguage).toHaveBeenCalledWith('zh-CN');
    });

    it('should sync language to Firebase by default when changed', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      await act(async () => {
        await result.current.setLanguage('ja-JP');
      });

      expect(mockSyncLanguageToFirebase).toHaveBeenCalledWith('ja-JP');
    });

    it('should skip Firebase sync when requested', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      await act(async () => {
        await result.current.setLanguage('ja-JP', { syncToFirebase: false });
      });

      expect(mockSyncLanguageToFirebase).not.toHaveBeenCalled();
      expect(mockSetStoredLanguage).toHaveBeenCalledWith('ja-JP');
      expect(mockSetApiLanguage).toHaveBeenCalledWith('ja-JP');
      expect(mockChangeLanguage).toHaveBeenCalledWith('ja-JP');
      expect(mockResetQueries).toHaveBeenCalled();
    });

    it('should reset queries when language changes', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      jest.clearAllMocks();

      await act(async () => {
        await result.current.setLanguage('it-IT');
      });

      expect(mockResetQueries).toHaveBeenCalled();
    });

    it('should not update if same language is selected', async () => {
      mockGetStoredLanguage.mockResolvedValue('en-US');

      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      jest.clearAllMocks();

      await act(async () => {
        await result.current.setLanguage('en-US');
      });

      // Should not call any side effects when language is unchanged
      expect(mockSetStoredLanguage).not.toHaveBeenCalled();
      expect(mockResetQueries).not.toHaveBeenCalled();
      expect(mockSetApiLanguage).not.toHaveBeenCalled();
      expect(mockChangeLanguage).not.toHaveBeenCalled();
    });
  });

  describe('useLanguage hook', () => {
    it('should throw error when used outside provider', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        renderHook(() => useLanguage());
      }).toThrow('useLanguage must be used within a LanguageProvider');

      consoleSpy.mockRestore();
    });
  });
});
