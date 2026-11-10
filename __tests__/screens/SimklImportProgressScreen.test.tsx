import {
  createEmptyFileImportStats,
  type FileImportStats,
} from '@/functions/src/shared/fileImport';
import { SIMKL_IMPORT_ROUTE } from '@/src/constants/simklImportRoutes';
import { SimklImportFlowProvider } from '@/src/context/SimklImportFlowContext';
import SimklImportProgressScreen, { mergeRetry } from '@/src/screens/SimklImportProgressScreen';
import type { PreparedSimklImport } from '@/src/utils/simklImport/prepare';
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
jest.mock('@/src/services/SimklImportService', () => {
  class SimklImportRunError extends Error {}
  return {
    SimklImportRunError,
    simklImportService: {
      runPreparedImport: (...args: unknown[]) => mockRunPreparedImport(...args),
    },
  };
});

function stats(overrides: Partial<FileImportStats> = {}): FileImportStats {
  return { ...createEmptyFileImportStats(), ...overrides };
}

const preparedImport: PreparedSimklImport = {
  chunks: [{ movies: [], shows: [] }],
  format: 'json',
  stats: stats({ ignored: { anime_extras: 1 } }),
  summary: {
    anime: 0,
    episodes: 0,
    movieWatches: 0,
    movies: 0,
    ratings: 0,
    shows: 0,
    summaryOnlyShows: 0,
    watchlist: 0,
  },
};

describe('SimklImportProgressScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('runs the import and summarizes it, naming unfound shows and shows with unplaced episodes', async () => {
    mockRunPreparedImport.mockResolvedValue({
      failedChunkIndexes: [],
      stats: stats({
        ignored: { anime_extras: 1, summary_only_episodes: 3 },
        imported: { ...createEmptyFileImportStats().imported, shows: 12, watchedEpisodes: 60 },
        skipped: { unmatched_anime_episode: 120, unmatched_episode: 3 },
        unmatchedEpisodeTitles: ['Doctor Who'],
        unresolvedTitles: ['Shingeki no Kyojin Season 3'],
      }),
    });

    const { getByText, getByTestId } = render(
      <SimklImportFlowProvider initialPreparedImport={preparedImport}>
        <SimklImportProgressScreen />
      </SimklImportFlowProvider>
    );

    await waitFor(() => expect(getByText('Import complete')).toBeTruthy());
    expect(mockRunPreparedImport).toHaveBeenCalledWith(
      preparedImport,
      'user-123',
      expect.any(Function),
      undefined
    );
    expect(getByText('Watched episodes')).toBeTruthy();
    expect(getByText("Anime episodes we couldn't place")).toBeTruthy();
    expect(getByText('Anime OVAs, ONAs and specials')).toBeTruthy();
    expect(getByText('Finished shows without an episode list')).toBeTruthy();
    expect(getByTestId('simkl-import-unresolved')).toBeTruthy();
    expect(getByText('• Shingeki no Kyojin Season 3')).toBeTruthy();
    expect(getByTestId('simkl-import-unmatched-episodes')).toBeTruthy();
    expect(getByText('• Doctor Who')).toBeTruthy();
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('goes back to the select screen without a prepared import', () => {
    render(
      <SimklImportFlowProvider>
        <SimklImportProgressScreen />
      </SimklImportFlowProvider>
    );
    expect(mockReplace).toHaveBeenCalledWith(SIMKL_IMPORT_ROUTE);
    expect(mockRunPreparedImport).not.toHaveBeenCalled();
  });

  it('merges a retry pass without double-counting client-side stats, keeping unmatched titles', () => {
    const client = stats({ ignored: { anime_extras: 1 } });
    const previous = stats({
      ignored: { anime_extras: 1 },
      imported: { ...client.imported, watchedEpisodes: 10 },
      unmatchedEpisodeTitles: ['Doctor Who'],
    });
    const retry = stats({
      ignored: { anime_extras: 1 },
      imported: { ...client.imported, watchedEpisodes: 5 },
      unmatchedEpisodeTitles: ['Futurama'],
    });

    expect(mergeRetry(previous, retry, client)).toMatchObject({
      ignored: { anime_extras: 1 },
      imported: { watchedEpisodes: 15 },
      unmatchedEpisodeTitles: ['Doctor Who', 'Futurama'],
    });
    expect(mergeRetry(stats(), stats(), stats()).unmatchedEpisodeTitles).toBeUndefined();
  });
});
