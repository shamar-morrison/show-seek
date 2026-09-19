import { useProfileLogic } from '@/src/hooks/useProfileLogic';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

type AlertButton = {
  text?: string;
  onPress?: () => unknown;
};

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSignOut = jest.fn();
const mockResetSession = jest.fn();
const mockExportUserData = jest.fn();
const mockDeleteAccount = jest.fn();
const mockClearLocalAccountData = jest.fn();
const mockPremiumState: {
  isPremium: boolean;
  isLoading: boolean;
  premiumProvider: 'polar' | 'revenuecat' | null;
  premiumSubscriptionState: string | null;
  premiumSource: 'live' | 'cached';
} = {
  isPremium: true,
  isLoading: false,
  premiumProvider: null,
  premiumSubscriptionState: null,
  premiumSource: 'live',
};

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'user-1' },
    resetSession: mockResetSession,
    signOut: mockSignOut,
  }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
}));

jest.mock('@/src/services/DataExportService', () => ({
  exportUserData: (...args: any[]) => mockExportUserData(...args),
}));

jest.mock('@/src/services/AccountDeletionService', () => ({
  accountDeletionService: {
    deleteAccount: (...args: any[]) => mockDeleteAccount(...args),
  },
}));

jest.mock('@/src/utils/accountDeletion', () => {
  const actual = jest.requireActual('@/src/utils/accountDeletion');
  return {
    clearLocalAccountData: (...args: any[]) => mockClearLocalAccountData(...args),
    isPolarDeleteBlocked: actual.isPolarDeleteBlocked,
    isPolarSubscriptionActiveError: actual.isPolarSubscriptionActiveError,
  };
});

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

const confirmDeleteAccount = async (handleDeleteAccount: () => void) => {
  act(() => {
    handleDeleteAccount();
  });

  const firstButtons = (Alert.alert as jest.Mock).mock.calls[0]?.[2] as AlertButton[];
  const continueButton = firstButtons.find(
    (button) => button.text === 'profile.deleteAccountContinue'
  );

  act(() => {
    continueButton?.onPress?.();
  });

  const secondButtons = (Alert.alert as jest.Mock).mock.calls[1]?.[2] as AlertButton[];
  const deleteButton = secondButtons.find(
    (button) => button.text === 'profile.deleteAccountAction'
  );

  await act(async () => {
    await deleteButton?.onPress?.();
  });
};

describe('useProfileLogic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPremiumState.isPremium = true;
    mockPremiumState.isLoading = false;
    mockPremiumState.premiumProvider = null;
    mockPremiumState.premiumSubscriptionState = null;
    mockPremiumState.premiumSource = 'live';
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

  it('shows export options for free users without routing to premium', () => {
    mockPremiumState.isPremium = false;
    mockPremiumState.isLoading = true;

    const { result } = renderHook(() => useProfileLogic());

    act(() => {
      result.current.handleExportData();
    });

    expect(mockPush).not.toHaveBeenCalledWith('/premium');
    expect(Alert.alert).toHaveBeenCalledWith(
      'profile.exportDataTitle',
      'profile.exportDataMessage',
      expect.anything()
    );
  });

  it('runs account deletion, local cleanup, and routes to sign-in after double confirmation', async () => {
    mockDeleteAccount.mockResolvedValue({ success: true });
    mockClearLocalAccountData.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);

    const { result } = renderHook(() => useProfileLogic());

    await confirmDeleteAccount(result.current.handleDeleteAccount);

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockClearLocalAccountData).toHaveBeenCalledWith('user-1');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockResetSession).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('continues to sign out and redirect when local cleanup fails after remote deletion', async () => {
    const cleanupError = new Error('multiRemove failed');
    mockDeleteAccount.mockResolvedValue({ success: true });
    mockClearLocalAccountData.mockRejectedValue(cleanupError);
    mockSignOut.mockResolvedValue(undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useProfileLogic());

    await confirmDeleteAccount(result.current.handleDeleteAccount);

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockClearLocalAccountData).toHaveBeenCalledWith('user-1');
    expect(console.warn).toHaveBeenCalledWith(
      '[profile] Failed to clear local account data after remote deletion:',
      cleanupError
    );
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockResetSession).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    expect(Alert.alert).not.toHaveBeenCalledWith(
      'common.errorTitle',
      'profile.deleteAccountFailed'
    );
  });

  it('falls back to resetting local auth state when post-delete sign out fails', async () => {
    const signOutError = new Error('sign out failed');
    mockDeleteAccount.mockResolvedValue({ success: true });
    mockClearLocalAccountData.mockResolvedValue(undefined);
    mockSignOut.mockRejectedValue(signOutError);
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useProfileLogic());

    await confirmDeleteAccount(result.current.handleDeleteAccount);

    expect(mockResetSession).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('resets local auth state and redirects when cleanup and sign out both fail after remote deletion', async () => {
    const cleanupError = new Error('cleanup failed');
    const signOutError = new Error('sign out failed');
    mockDeleteAccount.mockResolvedValue({ success: true });
    mockClearLocalAccountData.mockRejectedValue(cleanupError);
    mockSignOut.mockRejectedValue(signOutError);
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useProfileLogic());

    await confirmDeleteAccount(result.current.handleDeleteAccount);

    expect(console.warn).toHaveBeenNthCalledWith(
      1,
      '[profile] Failed to clear local account data after remote deletion:',
      cleanupError
    );
    expect(console.warn).toHaveBeenNthCalledWith(
      2,
      '[profile] Failed to sign out after account deletion:',
      signOutError
    );
    expect(mockResetSession).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    expect(Alert.alert).not.toHaveBeenCalledWith(
      'common.errorTitle',
      'profile.deleteAccountFailed'
    );
  });

  it('blocks deletion with the Polar message for a live active Polar subscription', () => {
    mockPremiumState.isPremium = true;
    mockPremiumState.premiumProvider = 'polar';
    mockPremiumState.premiumSubscriptionState = 'ACTIVE';
    mockPremiumState.premiumSource = 'live';

    const { result } = renderHook(() => useProfileLogic());

    act(() => {
      result.current.handleDeleteAccount();
    });

    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledWith(
      'profile.deleteAccountPolarActiveTitle',
      'profile.deleteAccountPolarActiveMessage'
    );
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('skips the pre-check for cached snapshots and lets the callable decide', async () => {
    mockPremiumState.isPremium = true;
    mockPremiumState.premiumProvider = 'polar';
    mockPremiumState.premiumSubscriptionState = 'ACTIVE';
    mockPremiumState.premiumSource = 'cached';
    mockDeleteAccount.mockResolvedValue({ success: true });
    mockClearLocalAccountData.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);

    const { result } = renderHook(() => useProfileLogic());

    await confirmDeleteAccount(result.current.handleDeleteAccount);

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('allows deletion for a cancelled Polar subscription in the grace period', async () => {
    mockPremiumState.isPremium = true;
    mockPremiumState.premiumProvider = 'polar';
    mockPremiumState.premiumSubscriptionState = 'CANCELLED';
    mockPremiumState.premiumSource = 'live';
    mockDeleteAccount.mockResolvedValue({ success: true });
    mockClearLocalAccountData.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);

    const { result } = renderHook(() => useProfileLogic());

    await confirmDeleteAccount(result.current.handleDeleteAccount);

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('allows deletion for RevenueCat subscribers', async () => {
    mockPremiumState.isPremium = true;
    mockPremiumState.premiumProvider = 'revenuecat';
    mockPremiumState.premiumSubscriptionState = 'ACTIVE';
    mockPremiumState.premiumSource = 'live';
    mockDeleteAccount.mockResolvedValue({ success: true });
    mockClearLocalAccountData.mockResolvedValue(undefined);
    mockSignOut.mockResolvedValue(undefined);

    const { result } = renderHook(() => useProfileLogic());

    await confirmDeleteAccount(result.current.handleDeleteAccount);

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('shows the Polar message when the server rejects with POLAR_SUBSCRIPTION_ACTIVE', async () => {
    mockPremiumState.isPremium = true;
    mockPremiumState.premiumProvider = 'polar';
    mockPremiumState.premiumSubscriptionState = 'ACTIVE';
    mockPremiumState.premiumSource = 'cached';
    mockDeleteAccount.mockRejectedValue({
      code: 'functions/failed-precondition',
      details: { reason: 'POLAR_SUBSCRIPTION_ACTIVE' },
    });

    const { result } = renderHook(() => useProfileLogic());

    await confirmDeleteAccount(result.current.handleDeleteAccount);

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'profile.deleteAccountPolarActiveTitle',
        'profile.deleteAccountPolarActiveMessage'
      );
    });
  });
});
