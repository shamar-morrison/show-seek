import { render, fireEvent, act } from '@testing-library/react-native';
import React from 'react';
import TraktZipImportScreen from '@/src/screens/TraktZipImportScreen';
import { traktZipImportService } from '@/src/services/TraktZipImportService';

import type { TraktZipImportUIState } from '@/src/types/trakt';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockRequireAccount = jest.fn(() => false);
const mockStartZipImport = jest.fn();
const mockDismissZipImport = jest.fn();
const mockSetSelectedZipFile = jest.fn();

let mockTraktContextState = {
  isEnriching: false,
  isSyncing: false,
  isZipImporting: false,
  zipImportUiState: 'idle' as TraktZipImportUIState,
  zipUploadProgress: 0,
  zipImportDoc: null as any,
  zipImportError: null as string | null,
  selectedZipFile: null as any,
  setSelectedZipFile: mockSetSelectedZipFile,
  startZipImport: mockStartZipImport,
  dismissZipImport: mockDismissZipImport,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({
    isPremium: true,
    isLoading: false,
  }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({
    accentColor: '#ff5500',
  }),
}));

jest.mock('@/src/context/TraktContext', () => ({
  useTrakt: () => mockTraktContextState,
}));

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockRequireAccount,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('@/src/components/icons/TraktLogo', () => ({
  TraktLogo: () => null,
}));

jest.mock('@/src/components/ui/PremiumBadge', () => ({
  PremiumBadge: () => null,
}));

jest.mock('@/src/components/ui/CollapsibleCategory', () => ({
  CollapsibleCategory: ({ children }: { children: React.ReactNode }) => children,
  CollapsibleFeatureItem: () => null,
}));

describe('TraktZipImportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTraktContextState = {
      isEnriching: false,
      isSyncing: false,
      isZipImporting: false,
      zipImportUiState: 'idle',
      zipUploadProgress: 0,
      zipImportDoc: null,
      zipImportError: null,
      selectedZipFile: null,
      setSelectedZipFile: mockSetSelectedZipFile,
      startZipImport: mockStartZipImport,
      dismissZipImport: mockDismissZipImport,
    };
  });

  it('renders idle screen correctly', () => {
    const { getAllByText } = render(<TraktZipImportScreen />);
    expect(getAllByText(/Trakt/i).length).toBeGreaterThan(0);
  });

  it('displays sync in progress banner when OAuth sync is active', () => {
    mockTraktContextState.isSyncing = true;
    const { getByText } = render(<TraktZipImportScreen />);
    expect(getByText(/Trakt Sync In Progress/i)).toBeTruthy();
  });

  it('renders in-flight processing view when zipImportUiState is processing', () => {
    mockTraktContextState.zipImportUiState = 'processing';
    mockTraktContextState.zipImportDoc = {
      id: 'zip_123',
      progress: { current: 65, phase: 'syncing', total: 100 },
      stats: {
        customLists: 0,
        episodes: 0,
        favorites: 0,
        movies: 0,
        movieWatches: 0,
        ratings: 0,
        shows: 0,
        watchlist: 0,
      },
      status: 'processing',
      userId: 'user-1',
    };

    const { getByText } = render(<TraktZipImportScreen />);
    expect(getByText(/Importing Your Data/i)).toBeTruthy();
  });

  it('renders uploading view when zipImportUiState is uploading', () => {
    mockTraktContextState.zipImportUiState = 'uploading';
    mockTraktContextState.zipUploadProgress = 0.55;

    const { getByText } = render(<TraktZipImportScreen />);
    expect(getByText(/Uploading Archive/i)).toBeTruthy();
    expect(getByText(/55%/i)).toBeTruthy();
  });

  it('handles completed state with missing or null stats safely without crashing', () => {
    mockTraktContextState.zipImportUiState = 'completed';
    mockTraktContextState.zipImportDoc = {
      id: 'zip_123_456',
      progress: { current: 100, phase: 'completed', total: 100 },
      stats: {
        customLists: null as any,
        episodes: NaN as any,
        favorites: undefined as any,
        movies: 5,
        movieWatches: null as any,
        ratings: '12' as any,
        shows: 3,
        watchlist: 0,
      },
      status: 'completed',
      userId: 'user-123',
    };

    const { queryAllByText, getByText } = render(<TraktZipImportScreen />);

    // Should render normalized numbers without throwing
    expect(queryAllByText('5').length).toBeGreaterThan(0);
    expect(queryAllByText('12').length).toBeGreaterThan(0);
    expect(queryAllByText('3').length).toBeGreaterThan(0);
    expect(queryAllByText('0').length).toBeGreaterThan(0);

    // Done button should call dismissZipImport
    const doneBtn = getByText(/Done/i);
    fireEvent.press(doneBtn);
    expect(mockDismissZipImport).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalled();
  });

  it('renders failed view and allows trying again or going back', () => {
    mockTraktContextState.zipImportUiState = 'failed';
    mockTraktContextState.zipImportError = 'Network error while parsing zip';

    const { getByText } = render(<TraktZipImportScreen />);
    expect(getByText(/Import Failed/i)).toBeTruthy();
    expect(getByText(/Network error while parsing zip/i)).toBeTruthy();

    const tryAgainBtn = getByText(/Try Again/i);
    fireEvent.press(tryAgainBtn);
    expect(mockDismissZipImport).toHaveBeenCalled();
  });

  it('picks a file and triggers startZipImport', async () => {
    jest.spyOn(traktZipImportService, 'pickZipFile').mockResolvedValueOnce({
      name: 'trakt-export.zip',
      size: 2048,
      uri: 'file:///trakt-export.zip',
    });

    const { getByText, rerender } = render(<TraktZipImportScreen />);
    const selectFileBtn = getByText(/Select Trakt Export/i);

    await act(async () => {
      fireEvent.press(selectFileBtn);
    });

    expect(mockSetSelectedZipFile).toHaveBeenCalledWith({
      name: 'trakt-export.zip',
      size: 2048,
      uri: 'file:///trakt-export.zip',
    });

    // Simulate state update
    mockTraktContextState.selectedZipFile = {
      name: 'trakt-export.zip',
      size: 2048,
      uri: 'file:///trakt-export.zip',
    };

    rerender(<TraktZipImportScreen />);

    const startImportBtn = getByText(/Start Import/i);
    await act(async () => {
      fireEvent.press(startImportBtn);
    });

    expect(mockStartZipImport).toHaveBeenCalledWith({
      name: 'trakt-export.zip',
      size: 2048,
      uri: 'file:///trakt-export.zip',
    });
  });
});
