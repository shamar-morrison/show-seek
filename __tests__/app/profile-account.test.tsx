import AccountScreen from '@/app/(tabs)/profile/account';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockAuth = { user: null as unknown, isGuest: false };
const mockLogic = {
  isPremium: false,
  isPremiumLoading: false,
  isExporting: false,
  isSigningOut: false,
  isDeletingAccount: false,
  handleExportData: jest.fn(),
  handleDeleteAccount: jest.fn(),
  handleSignOut: jest.fn(),
  handleUpgradePress: jest.fn(),
};

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuth,
}));

jest.mock('@/src/hooks/useProfileLogic', () => ({
  useProfileLogic: () => mockLogic,
}));

describe('AccountScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.user = { displayName: 'Kevin', email: 'kevin@example.com', photoURL: null };
    mockAuth.isGuest = false;
    mockLogic.isPremium = false;
    mockLogic.isDeletingAccount = false;
    mockLogic.isSigningOut = false;
  });

  it('shows identity and all account actions to a signed-in user', () => {
    const { getByText } = render(<AccountScreen />);

    expect(getByText('Kevin')).toBeTruthy();
    expect(getByText('kevin@example.com')).toBeTruthy();
    expect(getByText('Export Data')).toBeTruthy();
    expect(getByText('Delete Account')).toBeTruthy();
    expect(getByText('Sign Out')).toBeTruthy();
  });

  it('wires each account action to its handler', () => {
    const { getByTestId } = render(<AccountScreen />);

    fireEvent.press(getByTestId('action-button-export-data'));
    fireEvent.press(getByTestId('action-button-delete-account'));
    fireEvent.press(getByTestId('action-button-sign-out'));

    expect(mockLogic.handleExportData).toHaveBeenCalledTimes(1);
    expect(mockLogic.handleDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockLogic.handleSignOut).toHaveBeenCalledTimes(1);
  });

  it('offers free users an upgrade', () => {
    const { getByTestId } = render(<AccountScreen />);

    fireEvent.press(getByTestId('account-prompt-upgrade'));

    expect(mockLogic.handleUpgradePress).toHaveBeenCalledTimes(1);
  });

  it('shows premium status instead of an upgrade to premium users', () => {
    mockLogic.isPremium = true;
    const { getByText, queryByTestId } = render(<AccountScreen />);

    expect(getByText('Premium Member')).toBeTruthy();
    expect(queryByTestId('account-prompt-upgrade')).toBeNull();
  });

  it('gives guests a sign-in prompt, sign out, and delete, but no export', () => {
    mockAuth.isGuest = true;
    mockAuth.user = { displayName: null, email: null, photoURL: null, isAnonymous: true };
    const { getByText, getByTestId, queryByText } = render(<AccountScreen />);

    expect(getByText('Guest User')).toBeTruthy();
    expect(queryByText('Export Data')).toBeNull();
    expect(getByText('Delete Account')).toBeTruthy();
    expect(getByText('Sign Out')).toBeTruthy();

    fireEvent.press(getByTestId('account-prompt-sign-in'));

    expect(mockLogic.handleSignOut).toHaveBeenCalledTimes(1);
  });

  it('shows loading states and blocks repeat presses', () => {
    mockLogic.isDeletingAccount = true;
    mockLogic.isSigningOut = true;
    const { getByText, getByTestId } = render(<AccountScreen />);

    expect(getByText('Deleting Account...')).toBeTruthy();
    expect(getByText('Signing Out...')).toBeTruthy();

    fireEvent.press(getByTestId('action-button-deleting-account...'));
    fireEvent.press(getByTestId('action-button-signing-out...'));

    expect(mockLogic.handleDeleteAccount).not.toHaveBeenCalled();
    expect(mockLogic.handleSignOut).not.toHaveBeenCalled();
  });
});
