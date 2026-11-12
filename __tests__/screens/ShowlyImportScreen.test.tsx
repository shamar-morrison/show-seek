import { createEmptyFileImportStats } from '@/functions/src/shared/fileImport';
import { SHOWLY_IMPORT_PROGRESS_ROUTE } from '@/src/constants/showlyImportRoutes';
import { ShowlyImportFlowProvider } from '@/src/context/ShowlyImportFlowContext';
import ShowlyImportScreen from '@/src/screens/ShowlyImportScreen';
import { ShowlyImportError } from '@/src/utils/showlyImport/files';
import type { PreparedShowlyImport } from '@/src/utils/showlyImport/prepare';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockPickFiles = jest.fn();
const mockPrepare = jest.fn();
const mockGetLimitState = jest.fn();
const mockGetStoredRun = jest.fn();
const mockRequireAccount = jest.fn(() => false);
let mockIsPremium = true;

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
    useRouter: () => ({ back: mockBack, push: mockPush, replace: jest.fn() }),
  };
});
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light' },
}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});
jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({ isLoading: false, isPremium: mockIsPremium }),
}));
jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff5500' }),
}));
jest.mock('@/src/context/auth', () => ({ useAuth: () => ({ user: { uid: 'user-123' } }) }));
jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockRequireAccount,
}));
jest.mock('@/src/components/ui/CollapsibleCategory', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    CollapsibleCategory: ({ children, title }: { children: React.ReactNode; title: string }) => (
      <View>
        <Text>{title}</Text>
        {children}
      </View>
    ),
    CollapsibleFeatureItem: ({ description, text }: { description?: string; text: string }) => (
      <View>
        <Text>{text}</Text>
        {description ? <Text>{description}</Text> : null}
      </View>
    ),
  };
});
jest.mock('@/src/components/ui/PremiumBadge', () => ({
  PremiumBadge: () => {
    const { Text } = require('react-native');
    return <Text testID="premium-badge">Premium</Text>;
  },
}));
jest.mock('@/src/services/ShowlyImportService', () => ({
  fingerprintOf: () => 'fingerprint-1',
  showlyImportService: {
    getLimitState: (...args: unknown[]) => mockGetLimitState(...args),
    getStoredRun: (...args: unknown[]) => mockGetStoredRun(...args),
    pickFiles: (...args: unknown[]) => mockPickFiles(...args),
    prepare: (...args: unknown[]) => mockPrepare(...args),
  },
}));

const preparedImport: PreparedShowlyImport = {
  chunks: [{ movies: [], shows: [] }],
  format: 'json',
  stats: createEmptyFileImportStats(),
  summary: {
    customLists: 2,
    dropped: 4,
    emptyLists: 1,
    episodes: 156,
    following: 15,
    movieWatchlist: 2,
    ratings: 9,
    showWatchlist: 3,
    watchedMovies: 8,
  },
};

function renderScreen() {
  return render(
    <ShowlyImportFlowProvider>
      <ShowlyImportScreen />
    </ShowlyImportFlowProvider>
  );
}

describe('ShowlyImportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPremium = true;
    mockGetLimitState.mockResolvedValue({ activeImportId: null, nextAllowedImportAt: null });
    mockGetStoredRun.mockResolvedValue(null);
  });

  it('explains how to export the backup from Showly', async () => {
    const { getByText, getByTestId } = renderScreen();

    expect(getByText('Import your Showly library')).toBeTruthy();
    expect(getByText('How do I get my Showly backup?')).toBeTruthy();
    expect(getByText('Go to Settings → Backup & Restore → Export data.')).toBeTruthy();
    expect(getByTestId('showly-import-hero-icon')).toBeTruthy();
    // Let the import-limit check settle.
    await waitFor(() => expect(mockGetLimitState).toHaveBeenCalledWith('user-123'));
  });

  it('sends free users to the paywall instead of the file picker', async () => {
    mockIsPremium = false;
    const { getByTestId } = renderScreen();

    expect(getByTestId('premium-badge')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('showly-import-pick'));
    });

    expect(mockPush).toHaveBeenCalledWith('/premium');
    expect(mockPickFiles).not.toHaveBeenCalled();
  });

  it('previews the picked backup and starts the import', async () => {
    mockPickFiles.mockResolvedValue([{ bytes: new Uint8Array([1]), name: 'showly_export.json' }]);
    mockPrepare.mockReturnValue(preparedImport);
    const { getByTestId, getByText } = renderScreen();

    // Nothing to start before a file is picked.
    fireEvent.press(getByTestId('showly-import-start'));
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByTestId('showly-import-pick'));
    });

    expect(getByTestId('showly-import-summary')).toBeTruthy();
    expect(getByText('15')).toBeTruthy(); // My Shows
    expect(getByText('156')).toBeTruthy();
    expect(getByText('5')).toBeTruthy(); // show + movie watchlist
    expect(getByText("1 empty list won't be created.")).toBeTruthy();

    fireEvent.press(getByTestId('showly-import-start'));
    expect(mockPush).toHaveBeenCalledWith(SHOWLY_IMPORT_PROGRESS_ROUTE);
  });

  it('explains a file it cannot read', async () => {
    mockPickFiles.mockResolvedValue([{ bytes: new Uint8Array([1]), name: 'SimklBackup.json' }]);
    mockPrepare.mockImplementation(() => {
      throw new ShowlyImportError('simkl_export');
    });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { getByTestId } = renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('showly-import-pick'));
    });
    spy.mockRestore();

    expect(Alert.alert).toHaveBeenCalledWith(
      "Can't read this file",
      'This looks like a Simkl backup. Use Import from Simkl in Integrations instead.'
    );
  });

  it('shows the cooldown and keeps Start disabled while another Showly import is cooling down', async () => {
    mockGetLimitState.mockResolvedValue({
      activeImportId: 'showly-other',
      nextAllowedImportAt: Date.now() + 60 * 60 * 1000,
    });
    mockPickFiles.mockResolvedValue([{ bytes: new Uint8Array([1]), name: 'showly_export.json' }]);
    mockPrepare.mockReturnValue(preparedImport);
    const { getByTestId } = renderScreen();

    await waitFor(() => expect(getByTestId('showly-import-cooldown')).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByTestId('showly-import-pick'));
    });
    fireEvent.press(getByTestId('showly-import-start'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockGetLimitState).toHaveBeenCalledWith('user-123');
  });
});
