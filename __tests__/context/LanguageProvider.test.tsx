// Mock dependencies at module level
const mockSetApiLanguage = jest.fn();
const mockChangeLanguage = jest.fn().mockResolvedValue(undefined);
const mockResetQueries = jest.fn();
const mockGetStoredLanguage = jest.fn().mockResolvedValue('en-US');
const mockSetStoredLanguage = jest.fn().mockResolvedValue(undefined);

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
}));

import { LanguageProvider, useLanguage } from '@/src/context/LanguageProvider';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

describe('LanguageProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStoredLanguage.mockResolvedValue('en-US');
    mockSetStoredLanguage.mockResolvedValue(undefined);
    mockChangeLanguage.mockResolvedValue(undefined);
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

      // Should not call storage or reset queries when language is unchanged
      expect(mockSetStoredLanguage).not.toHaveBeenCalled();
      expect(mockResetQueries).not.toHaveBeenCalled();
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
