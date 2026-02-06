import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

const mockSetOptions = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({
    setOptions: mockSetOptions,
  }),
}));

jest.mock('@/src/components/ui/SearchableHeader', () => ({
  SearchableHeader: () => null,
}));

import { useViewModeToggle } from '@/src/hooks/useViewModeToggle';

describe('useViewModeToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('does not manage header when manageHeader is false', async () => {
    const { result } = renderHook(() =>
      useViewModeToggle({
        storageKey: 'view-mode-key',
        manageHeader: false,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoadingPreference).toBe(false);
    });

    expect(mockSetOptions).not.toHaveBeenCalled();
  });

  it('restores saved preference from storage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('list');

    const { result } = renderHook(() =>
      useViewModeToggle({
        storageKey: 'view-mode-key',
        manageHeader: false,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoadingPreference).toBe(false);
    });

    expect(result.current.viewMode).toBe('list');
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('view-mode-key');
  });

  it('toggles mode and persists preference', async () => {
    const { result } = renderHook(() =>
      useViewModeToggle({
        storageKey: 'view-mode-key',
        manageHeader: false,
      })
    );

    await waitFor(() => {
      expect(result.current.isLoadingPreference).toBe(false);
    });

    await act(async () => {
      await result.current.toggleViewMode();
    });

    expect(result.current.viewMode).toBe('list');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('view-mode-key', 'list');
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });
});
