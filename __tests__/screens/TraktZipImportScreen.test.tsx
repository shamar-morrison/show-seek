import { render, fireEvent, act } from '@testing-library/react-native';
import React from 'react';
import TraktZipImportScreen from '@/src/screens/TraktZipImportScreen';
import { traktZipImportService } from '@/src/services/TraktZipImportService';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockRequireAccount = jest.fn(() => false);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'user-123' },
  }),
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
  useTrakt: () => ({
    isEnriching: false,
  }),
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
  });

  it('renders idle screen correctly', () => {
    const { getAllByText } = render(<TraktZipImportScreen />);
    expect(getAllByText(/Trakt/i).length).toBeGreaterThan(0);
  });

  it('handles completed state with missing or null stats safely without crashing', async () => {
    let progressCallback: ((doc: any) => void) | null = null;

    jest.spyOn(traktZipImportService, 'pickZipFile').mockResolvedValueOnce({
      name: 'trakt.zip',
      size: 1024,
      uri: 'file:///trakt.zip',
    });

    jest.spyOn(traktZipImportService, 'uploadZipFile').mockResolvedValueOnce('users/test/imports/zip_123.zip');

    jest.spyOn(traktZipImportService, 'subscribeToProgress').mockImplementation(
      (_userId, _importId, onProgress) => {
        progressCallback = onProgress;
        return () => {};
      }
    );

    jest.spyOn(traktZipImportService, 'startImport').mockResolvedValueOnce({ importId: 'zip_123_456' });

    const { getByText, queryAllByText } = render(<TraktZipImportScreen />);

    // Trigger file selection
    const selectFileBtn = getByText(/Select Trakt Export/i);
    await act(async () => {
      fireEvent.press(selectFileBtn);
    });

    // Start import
    const startImportBtn = getByText(/Start Import/i);
    await act(async () => {
      fireEvent.press(startImportBtn);
    });

    // Simulate progress event with null / non-finite / missing stats fields
    await act(async () => {
      progressCallback?.({
        id: 'zip_123_456',
        progress: { current: 100, phase: 'completed', total: 100 },
        stats: {
          customLists: null,
          episodes: NaN,
          favorites: undefined,
          movies: 5,
          movieWatches: null,
          ratings: '12',
          shows: 3,
          watchlist: 0,
        },
        status: 'completed',
        userId: 'user-123',
      });
    });

    // Should render normalized numbers (0 for null/undefined/NaN, 5 for movies, 12 for ratings, 3 for shows) without throwing
    expect(queryAllByText('5').length).toBeGreaterThan(0);
    expect(queryAllByText('12').length).toBeGreaterThan(0);
    expect(queryAllByText('3').length).toBeGreaterThan(0);
    expect(queryAllByText('0').length).toBeGreaterThan(0);
  });
});
