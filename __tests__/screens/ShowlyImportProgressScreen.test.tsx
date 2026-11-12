import {
  createEmptyFileImportStats,
  type FileImportStats,
} from '@/functions/src/shared/fileImport';
import { SHOWLY_IMPORT_ROUTE } from '@/src/constants/showlyImportRoutes';
import { ShowlyImportFlowProvider } from '@/src/context/ShowlyImportFlowContext';
import ShowlyImportProgressScreen, { mergeRetry } from '@/src/screens/ShowlyImportProgressScreen';
import type { PreparedShowlyImport } from '@/src/utils/showlyImport/prepare';
import { render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockReplace = jest.fn();
const mockRunPreparedImport = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ addListener: jest.fn(() => jest.fn()), setOptions: jest.fn() }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: mockReplace }),
}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));
jest.mock('@/src/context/auth', () => ({ useAuth: () => ({ user: { uid: 'user-123' } }) }));
jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff5500' }),
}));
jest.mock('@/src/hooks/useAccountRequired', () => ({ useAccountRequired: () => () => false }));
jest.mock('@/src/services/ShowlyImportService', () => {
  class ShowlyImportRunError extends Error {}
  return {
    ShowlyImportRunError,
    showlyImportService: {
      runPreparedImport: (...args: unknown[]) => mockRunPreparedImport(...args),
    },
  };
});

function stats(overrides: Partial<FileImportStats> = {}): FileImportStats {
  return { ...createEmptyFileImportStats(), ...overrides };
}

const preparedImport: PreparedShowlyImport = {
  chunks: [{ movies: [], shows: [] }],
  format: 'json',
  stats: stats({ ignored: { hidden_movies: 1 } }),
  summary: {
    customLists: 0,
    dropped: 0,
    emptyLists: 0,
    episodes: 0,
    following: 0,
    movieWatchlist: 0,
    ratings: 0,
    showWatchlist: 0,
    watchedMovies: 0,
  },
};

describe('ShowlyImportProgressScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('runs the import and summarizes it, naming unfound shows and shows with unplaced episodes', async () => {
    mockRunPreparedImport.mockResolvedValue({
      failedChunkIndexes: [],
      stats: stats({
        ignored: { hidden_movies: 1, pinned_items: 3, season_ratings: 2 },
        imported: { ...createEmptyFileImportStats().imported, shows: 12, watchedEpisodes: 60 },
        skipped: { missing_identifiers: 2, unmatched_episode: 3 },
        unmatchedEpisodeTitles: ['Doctor Who'],
        unresolvedTitles: ['Some Obscure Show'],
      }),
    });

    const { getByText, getByTestId } = render(
      <ShowlyImportFlowProvider initialPreparedImport={preparedImport}>
        <ShowlyImportProgressScreen />
      </ShowlyImportFlowProvider>
    );

    await waitFor(() => expect(getByText('Import complete')).toBeTruthy());
    expect(mockRunPreparedImport).toHaveBeenCalledWith(
      preparedImport,
      'user-123',
      expect.any(Function),
      undefined
    );
    expect(getByText('Watched episodes')).toBeTruthy();
    expect(getByText("Episodes we couldn't match")).toBeTruthy();
    expect(getByText('Items without enough information')).toBeTruthy();
    expect(getByText('Hidden movies')).toBeTruthy();
    expect(getByText('Pinned titles')).toBeTruthy();
    expect(getByText('Season ratings')).toBeTruthy();
    expect(getByTestId('showly-import-unresolved')).toBeTruthy();
    expect(getByText('• Some Obscure Show')).toBeTruthy();
    expect(getByTestId('showly-import-unmatched-episodes')).toBeTruthy();
    expect(getByText('• Doctor Who')).toBeTruthy();
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('goes back to the select screen without a prepared import', () => {
    render(
      <ShowlyImportFlowProvider>
        <ShowlyImportProgressScreen />
      </ShowlyImportFlowProvider>
    );
    expect(mockReplace).toHaveBeenCalledWith(SHOWLY_IMPORT_ROUTE);
    expect(mockRunPreparedImport).not.toHaveBeenCalled();
  });

  it('merges a retry pass without double-counting client-side stats, keeping unmatched titles', () => {
    const client = stats({ ignored: { hidden_movies: 1 } });
    const previous = stats({
      ignored: { hidden_movies: 1 },
      imported: { ...client.imported, watchedEpisodes: 10 },
      unmatchedEpisodeTitles: ['Doctor Who'],
    });
    const retry = stats({
      ignored: { hidden_movies: 1 },
      imported: { ...client.imported, watchedEpisodes: 5 },
      unmatchedEpisodeTitles: ['Futurama'],
    });

    expect(mergeRetry(previous, retry, client)).toMatchObject({
      ignored: { hidden_movies: 1 },
      imported: { watchedEpisodes: 15 },
      unmatchedEpisodeTitles: ['Doctor Who', 'Futurama'],
    });
    expect(mergeRetry(stats(), stats(), stats()).unmatchedEpisodeTitles).toBeUndefined();
  });
});
