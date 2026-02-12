import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

// Mock dependencies at module level
const mockSetApiRegion = jest.fn();
const mockGetStoredRegion = jest.fn().mockResolvedValue('US');
const mockSetStoredRegion = jest.fn().mockResolvedValue(undefined);
const mockFetchRegionFromFirebase = jest.fn().mockResolvedValue(null);
const mockSyncRegionToFirebase = jest.fn().mockResolvedValue(undefined);
const mockAuthState = {
  user: null as null | { uid?: string },
};

jest.mock('@/src/api/tmdb', () => ({
  setApiRegion: (...args: any[]) => mockSetApiRegion(...args),
  tmdbClient: {
    defaults: { params: {} },
  },
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: mockAuthState.user }),
}));

jest.mock('@/src/utils/regionStorage', () => ({
  getStoredRegion: () => mockGetStoredRegion(),
  setStoredRegion: (...args: any[]) => mockSetStoredRegion(...args),
  fetchRegionFromFirebase: () => mockFetchRegionFromFirebase(),
  syncRegionToFirebase: (...args: any[]) => mockSyncRegionToFirebase(...args),
}));

import { RegionProvider, useRegion } from '@/src/context/RegionProvider';

describe('RegionProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = null;
    mockGetStoredRegion.mockResolvedValue('US');
    mockSetStoredRegion.mockResolvedValue(undefined);
    mockFetchRegionFromFirebase.mockResolvedValue(null);
    mockSyncRegionToFirebase.mockResolvedValue(undefined);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <RegionProvider>{children}</RegionProvider>
  );

  describe('initialization', () => {
    it('should load region from storage on mount', async () => {
      mockGetStoredRegion.mockResolvedValue('GB');

      const { result } = renderHook(() => useRegion(), { wrapper });

      await waitFor(() => {
        expect(result.current.isRegionReady).toBe(true);
      });

      expect(result.current.region).toBe('GB');
      expect(mockGetStoredRegion).toHaveBeenCalled();
    });

    it('should sync API region on initialization', async () => {
      mockGetStoredRegion.mockResolvedValue('CA');

      const { result } = renderHook(() => useRegion(), { wrapper });

      await waitFor(() => {
        expect(result.current.isRegionReady).toBe(true);
      });

      expect(mockSetApiRegion).toHaveBeenCalledWith('CA');
    });

    it('should default to US when no region is stored', async () => {
      mockGetStoredRegion.mockResolvedValue('US');

      const { result } = renderHook(() => useRegion(), { wrapper });

      await waitFor(() => {
        expect(result.current.isRegionReady).toBe(true);
      });

      expect(result.current.region).toBe('US');
    });

    it('should fetch region from Firebase for authenticated users and apply it', async () => {
      mockAuthState.user = { uid: 'user-1' };
      mockGetStoredRegion.mockResolvedValue('US');
      mockFetchRegionFromFirebase.mockResolvedValue('GB');

      const { result } = renderHook(() => useRegion(), { wrapper });

      await waitFor(() => {
        expect(result.current.region).toBe('GB');
      });

      expect(mockFetchRegionFromFirebase).toHaveBeenCalledTimes(1);
      expect(mockSetApiRegion).toHaveBeenCalledWith('GB');
      expect(mockSetStoredRegion).toHaveBeenCalledWith('GB');
    });

    it('should ignore unsupported Firebase regions', async () => {
      mockAuthState.user = { uid: 'user-1' };
      mockGetStoredRegion.mockResolvedValue('US');
      mockFetchRegionFromFirebase.mockResolvedValue('ZZ');

      const { result } = renderHook(() => useRegion(), { wrapper });

      await waitFor(() => {
        expect(result.current.isRegionReady).toBe(true);
      });

      expect(result.current.region).toBe('US');
      expect(mockSetStoredRegion).not.toHaveBeenCalledWith('ZZ');
      expect(mockSetApiRegion).not.toHaveBeenCalledWith('ZZ');
    });

    it('should not fetch region from Firebase when unauthenticated', async () => {
      mockAuthState.user = null;

      const { result } = renderHook(() => useRegion(), { wrapper });

      await waitFor(() => {
        expect(result.current.isRegionReady).toBe(true);
      });

      expect(mockFetchRegionFromFirebase).not.toHaveBeenCalled();
    });
  });

  describe('setRegion', () => {
    it('should update region state when setRegion is called', async () => {
      const { result } = renderHook(() => useRegion(), { wrapper });

      await waitFor(() => {
        expect(result.current.isRegionReady).toBe(true);
      });

      await act(async () => {
        await result.current.setRegion('DE');
      });

      expect(result.current.region).toBe('DE');
    });

    it('should call setApiRegion when region changes', async () => {
      const { result } = renderHook(() => useRegion(), { wrapper });

      await waitFor(() => {
        expect(result.current.isRegionReady).toBe(true);
      });

      jest.clearAllMocks();

      await act(async () => {
        await result.current.setRegion('FR');
      });

      expect(mockSetApiRegion).toHaveBeenCalledWith('FR');
    });

    it('should persist region to storage when changed', async () => {
      const { result } = renderHook(() => useRegion(), { wrapper });

      await waitFor(() => {
        expect(result.current.isRegionReady).toBe(true);
      });

      await act(async () => {
        await result.current.setRegion('JP');
      });

      expect(mockSetStoredRegion).toHaveBeenCalledWith('JP');
    });

    it('should trigger Firebase sync in the background when region changes', async () => {
      const { result } = renderHook(() => useRegion(), { wrapper });

      await waitFor(() => {
        expect(result.current.isRegionReady).toBe(true);
      });

      await act(async () => {
        await result.current.setRegion('JP');
      });

      expect(result.current.region).toBe('JP');
      expect(mockSyncRegionToFirebase).toHaveBeenCalledWith('JP');
    });

    it('should not update if same region is selected', async () => {
      mockGetStoredRegion.mockResolvedValue('US');

      const { result } = renderHook(() => useRegion(), { wrapper });

      await waitFor(() => {
        expect(result.current.isRegionReady).toBe(true);
      });

      jest.clearAllMocks();

      await act(async () => {
        await result.current.setRegion('US');
      });

      // Should not call storage or API when region is unchanged
      expect(mockSetStoredRegion).not.toHaveBeenCalled();
      expect(mockSetApiRegion).not.toHaveBeenCalled();
      expect(mockSyncRegionToFirebase).not.toHaveBeenCalled();
    });

    it('should ignore unsupported region values', async () => {
      const { result } = renderHook(() => useRegion(), { wrapper });

      await waitFor(() => {
        expect(result.current.isRegionReady).toBe(true);
      });

      jest.clearAllMocks();

      await act(async () => {
        await result.current.setRegion('ZZ');
      });

      expect(result.current.region).toBe('US');
      expect(mockSetStoredRegion).not.toHaveBeenCalled();
      expect(mockSetApiRegion).not.toHaveBeenCalled();
      expect(mockSyncRegionToFirebase).not.toHaveBeenCalled();
    });
  });

  describe('useRegion hook', () => {
    it('should throw error when used outside provider', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        renderHook(() => useRegion());
      }).toThrow('useRegion must be used within a RegionProvider');

      consoleSpy.mockRestore();
    });
  });
});
