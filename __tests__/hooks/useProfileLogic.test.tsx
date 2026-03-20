import { useProfileLogic } from '@/src/hooks/useProfileLogic';
import { act, renderHook } from '@testing-library/react-native';
import { Alert } from 'react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn();
const mockResetSession = jest.fn();
const mockExportUserData = jest.fn();
const mockDeleteAccount = jest.fn();
const mockClearLocalAccountData = jest.fn();

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'user-1' },
    resetSession: mockResetSession,
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

jest.mock('@/src/services/AccountDeletionService', () => ({
  accountDeletionService: {
    deleteAccount: (...args: any[]) => mockDeleteAccount(...args),
  },
}));

jest.mock('@/src/utils/accountDeletion', () => ({
  clearLocalAccountData: (...args: any[]) => mockClearLocalAccountData(...args),
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
    replace: mockReplace,
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

  it('runs account deletion, local cleanup, and routes to sign-in after double confirmation', async () => {
    mockDeleteAccount.mockResolvedValue({ success: true });
    mockClearLocalAccountData.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);

    const { result } = renderHook(() => useProfileLogic());

    act(() => {
      result.current.handleDeleteAccount();
    });

    const firstButtons = (Alert.alert as jest.Mock).mock.calls[0]?.[2] as {
      text?: string;
      onPress?: () => unknown;
    }[];
    const continueButton = firstButtons.find(
      (button) => button.text === 'profile.deleteAccountContinue'
    );

    act(() => {
      continueButton?.onPress?.();
    });

    const secondButtons = (Alert.alert as jest.Mock).mock.calls[1]?.[2] as {
      text?: string;
      onPress?: () => unknown;
    }[];
    const deleteButton = secondButtons.find(
      (button) => button.text === 'profile.deleteAccountAction'
    );

    await act(async () => {
      await deleteButton?.onPress?.();
    });

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockClearLocalAccountData).toHaveBeenCalledWith('user-1');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockResetSession).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('falls back to resetting local auth state when post-delete sign out fails', async () => {
    const signOutError = new Error('sign out failed');
    mockDeleteAccount.mockResolvedValue({ success: true });
    mockClearLocalAccountData.mockResolvedValue(undefined);
    mockSignOut.mockRejectedValue(signOutError);
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useProfileLogic());

    act(() => {
      result.current.handleDeleteAccount();
    });

    const firstButtons = (Alert.alert as jest.Mock).mock.calls[0]?.[2] as {
      text?: string;
      onPress?: () => unknown;
    }[];
    const continueButton = firstButtons.find(
      (button) => button.text === 'profile.deleteAccountContinue'
    );

    act(() => {
      continueButton?.onPress?.();
    });

    const secondButtons = (Alert.alert as jest.Mock).mock.calls[1]?.[2] as {
      text?: string;
      onPress?: () => unknown;
    }[];
    const deleteButton = secondButtons.find(
      (button) => button.text === 'profile.deleteAccountAction'
    );

    await act(async () => {
      await deleteButton?.onPress?.();
    });

    expect(mockResetSession).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });
});
