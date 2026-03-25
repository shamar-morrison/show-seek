import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

const mockRouterBack = jest.fn();
const mockRouterPush = jest.fn();
const mockTraktState = {
  connectTrakt: jest.fn(),
  disconnectTrakt: jest.fn(),
  enrichData: jest.fn(),
  isConnected: true,
  isEnriching: false,
  isLoading: false,
  isSyncing: false,
  lastEnrichedAt: null as Date | null,
  lastSyncedAt: null as Date | null,
  syncNow: jest.fn(),
  syncStatus: null as
    | {
        attempt?: number;
        connected: boolean;
        errorCategory?:
          | 'locked_account'
          | 'rate_limited'
          | 'storage_limit'
          | 'upstream_blocked'
          | 'upstream_unavailable';
        errorMessage?: string;
        errors?: string[];
        maxAttempts?: number;
        nextAllowedSyncAt?: string;
        nextRetryAt?: string;
        status?: 'failed' | 'retrying';
        synced: boolean;
      }
    | null,
};
const mockPremiumState = {
  isPremium: true,
  isLoading: false,
};

jest.mock('@/src/context/TraktContext', () => ({
  useTrakt: () => mockTraktState,
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockRouterBack,
    push: mockRouterPush,
  }),
}));

jest.mock('@/src/components/icons/TraktLogo', () => ({
  TraktLogo: () => null,
}));

jest.mock('@/src/components/ui/CollapsibleCategory', () => ({
  CollapsibleCategory: ({ children }: { children: React.ReactNode }) => children,
  CollapsibleFeatureItem: () => null,
}));

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));

jest.mock('@/src/components/ui/PremiumBadge', () => ({
  PremiumBadge: () => null,
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

import TraktSettingsScreen from '@/src/screens/TraktSettingsScreen';
import { TraktRequestError } from '@/src/services/TraktService';

describe('TraktSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTraktState.isSyncing = false;
    mockTraktState.isConnected = true;
    mockTraktState.syncStatus = null;
    mockTraktState.lastSyncedAt = null;
    mockPremiumState.isPremium = true;
    mockPremiumState.isLoading = false;
  });

  it('shows the rate-limited banner before the first sync and prefers translated copy', () => {
    mockTraktState.syncStatus = {
      connected: true,
      errorCategory: 'rate_limited',
      errorMessage: 'Server rate limit message',
      nextAllowedSyncAt: new Date(Date.now() + 60_000).toISOString(),
      status: 'failed',
      synced: false,
    };

    const { getByText, queryByText } = render(<TraktSettingsScreen />);

    expect(getByText('Sync Temporarily Limited')).toBeTruthy();
    expect(getByText('Please wait before starting another Trakt sync.')).toBeTruthy();
    expect(queryByText('Server rate limit message')).toBeNull();
  });

  it('shows the locked-account banner before the first sync and prefers translated copy', () => {
    mockTraktState.syncStatus = {
      connected: true,
      errorCategory: 'locked_account',
      errorMessage: 'Server locked account message',
      status: 'failed',
      synced: false,
    };

    const { getByText, queryByText } = render(<TraktSettingsScreen />);

    expect(getByText('Trakt Account Locked')).toBeTruthy();
    expect(
      getByText(
        'Your Trakt account is locked. Contact Trakt support at support@trakt.tv with your Trakt username to unlock it.'
      )
    ).toBeTruthy();
    expect(queryByText('Server locked account message')).toBeNull();
  });

  it('keeps retrying syncs on the full-screen import view with retry details', () => {
    mockTraktState.isSyncing = true;
    mockTraktState.syncStatus = {
      attempt: 2,
      connected: true,
      maxAttempts: 5,
      nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
      status: 'retrying',
      synced: false,
    };

    const { getByText, queryByText } = render(<TraktSettingsScreen />);

    expect(getByText('Retrying Import')).toBeTruthy();
    expect(getByText('Retrying your import')).toBeTruthy();
    expect(getByText('Retry 2 of 5.')).toBeTruthy();
    expect(getByText(/Next retry/i)).toBeTruthy();
    expect(queryByText('Connected!')).toBeNull();

    mockTraktState.isSyncing = false;
  });

  it('shows an inline error and keeps import available when the first sync fails', () => {
    mockTraktState.syncStatus = {
      connected: true,
      errorCategory: 'upstream_blocked',
      errorMessage: 'Trakt blocked the request upstream.',
      errors: ['Trakt blocked the request upstream.'],
      status: 'failed',
      synced: false,
    };

    const { getByText } = render(<TraktSettingsScreen />);

    expect(getByText("Import Didn't Finish")).toBeTruthy();
    expect(getByText('Trakt blocked the request upstream.')).toBeTruthy();
    expect(getByText('You can try again now without reconnecting Trakt.')).toBeTruthy();
    expect(getByText('Import History')).toBeTruthy();
  });

  it('prefers translated storage-limit copy over the raw Firestore error', () => {
    mockTraktState.syncStatus = {
      connected: true,
      errorCategory: 'storage_limit',
      errorMessage:
        '3 INVALID_ARGUMENT: too many index entries for entity /users/user-1/lists/already-watched',
      errors: [
        '3 INVALID_ARGUMENT: too many index entries for entity /users/user-1/lists/already-watched',
      ],
      status: 'failed',
      synced: false,
    };

    const { getByText, queryByText } = render(<TraktSettingsScreen />);

    expect(getByText("Import Didn't Finish")).toBeTruthy();
    expect(
      getByText('Your Trakt history is too large to import right now. Please try again later.')
    ).toBeTruthy();
    expect(
      queryByText(
        '3 INVALID_ARGUMENT: too many index entries for entity /users/user-1/lists/already-watched'
      )
    ).toBeNull();
  });

  it('does not route to premium or connect Trakt while premium status is still loading', () => {
    mockTraktState.isConnected = false;
    mockPremiumState.isPremium = false;
    mockPremiumState.isLoading = true;

    const { getAllByText } = render(<TraktSettingsScreen />);

    fireEvent.press(getAllByText('Connect Trakt')[1]);

    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(mockTraktState.connectTrakt).not.toHaveBeenCalled();
  });

  it('shows the enrichment cooldown alert with retry timing from the backend error', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockTraktState.lastSyncedAt = new Date();
    mockTraktState.enrichData.mockRejectedValueOnce(
      new TraktRequestError('Please wait before running TMDB enrichment again.', {
        category: 'rate_limited',
        nextAllowedEnrichAt: new Date(Date.now() + 60_000).toISOString(),
      })
    );

    const { getByText } = render(<TraktSettingsScreen />);

    fireEvent.press(getByText('Enrich Now'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Please wait before running TMDB enrichment again.',
        expect.stringContaining('You can try again')
      );
    });

    alertSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
