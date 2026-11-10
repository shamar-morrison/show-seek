import { createEmptyFileImportStats } from '@/functions/src/shared/fileImport';
import { SIMKL_BACKUP_URL, SIMKL_IMPORT_PROGRESS_ROUTE } from '@/src/constants/simklImportRoutes';
import { SimklImportFlowProvider } from '@/src/context/SimklImportFlowContext';
import SimklImportScreen from '@/src/screens/SimklImportScreen';
import { SimklImportError } from '@/src/utils/simklImport/files';
import type { PreparedSimklImport } from '@/src/utils/simklImport/prepare';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, Linking } from 'react-native';

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
jest.mock('@/src/services/SimklImportService', () => ({
  fingerprintOf: () => 'fingerprint-1',
  simklImportService: {
    getLimitState: (...args: unknown[]) => mockGetLimitState(...args),
    getStoredRun: (...args: unknown[]) => mockGetStoredRun(...args),
    pickFiles: (...args: unknown[]) => mockPickFiles(...args),
    prepare: (...args: unknown[]) => mockPrepare(...args),
  },
}));

const preparedImport: PreparedSimklImport = {
  chunks: [{ movies: [], shows: [] }],
  format: 'json',
  stats: createEmptyFileImportStats(),
  summary: {
    anime: 5,
    episodes: 156,
    movieWatches: 6,
    movies: 8,
    ratings: 9,
    shows: 15,
    summaryOnlyShows: 3,
    watchlist: 3,
  },
};

function renderScreen() {
  return render(
    <SimklImportFlowProvider>
      <SimklImportScreen />
    </SimklImportFlowProvider>
  );
}

describe('SimklImportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPremium = true;
    mockGetLimitState.mockResolvedValue({ activeImportId: null, nextAllowedImportAt: null });
    mockGetStoredRun.mockResolvedValue(null);
  });

  it("explains how to get the backup and opens Simkl's export page", async () => {
    const { getByText, getByTestId } = renderScreen();

    expect(getByText('Import your Simkl history')).toBeTruthy();
    expect(getByText('How do I get my Simkl backup?')).toBeTruthy();
    expect(getByText('3. Download the .zip backup')).toBeTruthy();
    expect(getByTestId('simkl-import-hero-icon')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('simkl-import-open-simkl'));
    });
    expect(Linking.openURL).toHaveBeenCalledWith(SIMKL_BACKUP_URL);
  });

  it('sends free users to the paywall instead of the file picker', async () => {
    mockIsPremium = false;
    const { getByTestId } = renderScreen();

    expect(getByTestId('premium-badge')).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId('simkl-import-pick'));
    });

    expect(mockPush).toHaveBeenCalledWith('/premium');
    expect(mockPickFiles).not.toHaveBeenCalled();
  });

  it('previews the picked backup and starts the import', async () => {
    mockPickFiles.mockResolvedValue([{ bytes: new Uint8Array([1]), name: 'SimklBackup.zip' }]);
    mockPrepare.mockReturnValue(preparedImport);
    const { getByTestId, getByText } = renderScreen();

    // Nothing to start before a file is picked.
    fireEvent.press(getByTestId('simkl-import-start'));
    expect(mockPush).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByTestId('simkl-import-pick'));
    });

    expect(getByTestId('simkl-import-summary')).toBeTruthy();
    expect(getByText('10')).toBeTruthy(); // shows without the 5 anime
    expect(getByText('156')).toBeTruthy();
    expect(
      getByText(
        '3 finished shows have no episode list in your backup. All of their aired episodes will be marked as watched on the date you finished them.'
      )
    ).toBeTruthy();

    fireEvent.press(getByTestId('simkl-import-start'));
    expect(mockPush).toHaveBeenCalledWith(SIMKL_IMPORT_PROGRESS_ROUTE);
  });

  it('explains a file it cannot read', async () => {
    mockPickFiles.mockResolvedValue([{ bytes: new Uint8Array([1]), name: 'export.csv' }]);
    mockPrepare.mockImplementation(() => {
      throw new SimklImportError('csv_not_supported');
    });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { getByTestId } = renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('simkl-import-pick'));
    });
    spy.mockRestore();

    expect(Alert.alert).toHaveBeenCalledWith(
      "Can't read this file",
      'This is Simkl\'s .csv backup, which isn\'t supported yet. Download the ".zip archive with .json file" backup instead.'
    );
  });

  it('shows the cooldown and keeps Start disabled while another Simkl import is cooling down', async () => {
    mockGetLimitState.mockResolvedValue({
      activeImportId: 'simkl-other',
      nextAllowedImportAt: Date.now() + 60 * 60 * 1000,
    });
    mockPickFiles.mockResolvedValue([{ bytes: new Uint8Array([1]), name: 'SimklBackup.zip' }]);
    mockPrepare.mockReturnValue(preparedImport);
    const { getByTestId } = renderScreen();

    await waitFor(() => expect(getByTestId('simkl-import-cooldown')).toBeTruthy());
    await act(async () => {
      fireEvent.press(getByTestId('simkl-import-pick'));
    });
    fireEvent.press(getByTestId('simkl-import-start'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockGetLimitState).toHaveBeenCalledWith('user-123');
  });
});
