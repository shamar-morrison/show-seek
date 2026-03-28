// Mock dependencies at module level
const mockSetApiLanguage = jest.fn();
const mockChangeLanguage = jest.fn().mockResolvedValue(undefined);
const mockResetQueries = jest.fn();
const mockGetStoredLanguage = jest.fn().mockResolvedValue('en-US');
const mockSetStoredLanguage = jest.fn().mockResolvedValue(undefined);
const mockFetchLanguageFromFirebase = jest.fn().mockResolvedValue(null);
const mockSyncLanguageToFirebase = jest.fn().mockResolvedValue(undefined);
let mockUser: { uid: string; isAnonymous?: boolean } | null = null;

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
  useQueryClient: () => ({
    resetQueries: (...args: any[]) => mockResetQueries(...args),
  }),
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
  }),
}));

import { LanguageProvider, useLanguage } from '@/src/context/LanguageProvider';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

describe('LanguageProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = null;
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
    it('should load language from storage on mount', async () => {
      mockGetStoredLanguage.mockResolvedValue('fr-FR');

      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      expect(result.current.language).toBe('fr-FR');
      expect(mockGetStoredLanguage).toHaveBeenCalled();
    });

    it('should sync API language on initialization', async () => {
      mockGetStoredLanguage.mockResolvedValue('ja-JP');

      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLanguageReady).toBe(true);
      });

      expect(mockSetApiLanguage).toHaveBeenCalledWith('ja-JP');
    });

    it('should sync i18n on initialization', async () => {
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
