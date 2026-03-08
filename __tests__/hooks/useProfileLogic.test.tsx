import { useProfileLogic } from '@/src/hooks/useProfileLogic';
import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockPush = jest.fn();
const mockSignOut = jest.fn();
const mockExportUserData = jest.fn();

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'user-1' },
    signOut: mockSignOut,
  }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({
    isPremium: true,
  }),
}));

jest.mock('@/src/services/DataExportService', () => ({
  exportUserData: (...args: any[]) => mockExportUserData(...args),
}));

jest.mock('@/src/utils/appCache', () => ({
  clearAppCache: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'Light',
  },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('useProfileLogic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the translated export fallback instead of the raw error message', async () => {
    const exportError = new Error('private backend details');
    mockExportUserData.mockRejectedValue(exportError);

    const { result } = renderHook(() => useProfileLogic());

    act(() => {
      result.current.handleExportData();
    });

    const buttons = (Alert.alert as jest.Mock).mock.calls[0]?.[2] as {
      text?: string;
      onPress?: () => unknown;
    }[];
    const csvButton = buttons.find((button) => button.text === 'profile.exportAsCsv');

    await act(async () => {
      await csvButton?.onPress?.();
    });

    expect(mockExportUserData).toHaveBeenCalledWith('csv');
    expect(console.error).toHaveBeenCalledWith('Export failed:', exportError);
    expect(Alert.alert).toHaveBeenNthCalledWith(
      2,
      'profile.exportFailedTitle',
      'profile.exportFailedFallbackMessage'
    );
  });
});
