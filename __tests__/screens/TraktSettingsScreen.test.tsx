import { render } from '@testing-library/react-native';
import React from 'react';

const mockTraktState = {
  connectTrakt: jest.fn(),
  disconnectTrakt: jest.fn(),
  enrichData: jest.fn(),
  isConnected: true,
  isEnriching: false,
  isLoading: false,
  isSyncing: false,
  lastEnrichedAt: null,
  lastSyncedAt: null,
  syncNow: jest.fn(),
  syncStatus: null as
    | {
        connected: boolean;
        errorCategory?: 'locked_account' | 'rate_limited';
        errorMessage?: string;
        nextAllowedSyncAt?: string;
        status?: 'failed';
        synced: boolean;
      }
    | null,
};

jest.mock('@/src/context/TraktContext', () => ({
  useTrakt: () => mockTraktState,
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({ isPremium: true }),
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

describe('TraktSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTraktState.syncStatus = null;
    mockTraktState.lastSyncedAt = null;
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
});
