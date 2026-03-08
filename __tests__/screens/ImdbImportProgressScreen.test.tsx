import type { PreparedImdbImport } from '@/src/utils/imdbImport';
import type { ImdbImportStats } from '@/functions/src/shared/imdbImport';
import { ImdbImportFlowProvider, useImdbImportFlow } from '@/src/context/ImdbImportFlowContext';
import ImdbImportProgressScreen from '@/src/screens/ImdbImportProgressScreen';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetOptions = jest.fn();
const mockAddListener = jest.fn(() => jest.fn());
const mockInvalidateQueries = jest.fn();
const mockRunPreparedImport = jest.fn();
const mockRequireAccount = jest.fn(() => false);
let consoleErrorSpy: jest.SpyInstance;

jest.mock('expo-router', () => ({
  useNavigation: () => ({
    addListener: mockAddListener,
    setOptions: mockSetOptions,
  }),
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

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

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({
    accentColor: '#ff5500',
  }),
}));

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockRequireAccount,
}));

jest.mock('@/src/services/ImdbImportService', () => ({
  imdbImportService: {
    runPreparedImport: (...args: unknown[]) => mockRunPreparedImport(...args),
  },
}));

const createStats = (overrides: Partial<ImdbImportStats> = {}): ImdbImportStats => ({
  ignored: {},
  imported: {
    customListsCreated: 0,
    listItems: 0,
    ratings: 0,
    watchedEpisodes: 0,
    watchedMovies: 0,
    watchedShows: 0,
  },
  processedActions: 0,
  processedEntities: 0,
  skipped: {},
  ...overrides,
});

const preparedImport: PreparedImdbImport = {
  chunks: [
    {
      entities: [
        { imdbId: 'tt0000001', rawTitleType: 'movie', title: 'Imported Movie', actions: [] },
      ],
    },
  ],
  files: [
    {
      fileName: 'ratings.csv',
      kind: 'ratings',
      stats: createStats({ processedActions: 1, processedEntities: 1 }),
      totalRows: 12,
    },
  ],
  stats: createStats({ processedActions: 8, processedEntities: 8 }),
  unsupportedFiles: ['people.csv'],
};

function FlowStateProbe() {
  const { preparedImport } = useImdbImportFlow();

  return <Text>{preparedImport ? 'flow-ready' : 'flow-empty'}</Text>;
}

function renderScreen(initialPreparedImport: PreparedImdbImport | null = preparedImport) {
  return render(
    <ImdbImportFlowProvider initialPreparedImport={initialPreparedImport}>
      <FlowStateProbe />
      <ImdbImportProgressScreen />
    </ImdbImportFlowProvider>
  );
}

describe('ImdbImportProgressScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAccount.mockReturnValue(false);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('redirects back to the selection screen when no prepared import exists', async () => {
    renderScreen(null);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/profile/imdb-import');
    });

    expect(mockRunPreparedImport).not.toHaveBeenCalled();
  });

  it('auto-starts the import, shows progress, renders the summary, and clears the shared flow on success', async () => {
    let resolveImport!: (value: ImdbImportStats) => void;

    mockRunPreparedImport.mockImplementation(
      (_prepared: PreparedImdbImport, onProgress?: (progress: any) => void) => {
        onProgress?.({
          completedChunks: 1,
          totalChunks: 4,
          stats: createStats({
            imported: {
              customListsCreated: 0,
              listItems: 2,
              ratings: 1,
              watchedEpisodes: 0,
              watchedMovies: 0,
              watchedShows: 0,
            },
            processedActions: 8,
            processedEntities: 8,
            skipped: {
              unresolved_imdb_id: 2,
            },
          }),
        });

        return new Promise((resolve) => {
          resolveImport = resolve;
        });
      }
    );

    const { findByText, getAllByText, getByTestId, getByText } = renderScreen();

    expect(mockRunPreparedImport).toHaveBeenCalledTimes(1);
    expect(await findByText('25% complete')).toBeTruthy();
    expect(getAllByText('1 / 4 upload batches finished')).toHaveLength(2);
    expect(getByTestId('imdb-import-progress-bar')).toBeTruthy();
    expect(getByText('flow-ready')).toBeTruthy();

    resolveImport(
      createStats({
        imported: {
          customListsCreated: 1,
          listItems: 4,
          ratings: 3,
          watchedEpisodes: 0,
          watchedMovies: 1,
          watchedShows: 0,
        },
        processedActions: 8,
        processedEntities: 8,
        skipped: {
          unresolved_imdb_id: 2,
          unsupported_tmdb_result: 1,
        },
        ignored: {
          item_notes: 1,
        },
      })
    );

    expect(await findByText('Import complete')).toBeTruthy();
    expect(
      getByText('This summary shows what was imported, plus anything that was skipped or ignored.')
    ).toBeTruthy();
    expect(getByText('Rows with unresolved IMDb IDs')).toBeTruthy();
    expect(getByText('Rows with unsupported TMDB matches')).toBeTruthy();
    expect(getByText('IMDb item notes')).toBeTruthy();
    expect(getByText('Movie watches')).toBeTruthy();

    await waitFor(() => {
      expect(getByText('flow-empty')).toBeTruthy();
    });

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalled();
    });
  });

  it('shows failure actions and keeps the prepared import available when the import fails', async () => {
    mockRunPreparedImport.mockRejectedValue(new Error('network error'));

    const { findByText, getByText } = renderScreen();

    expect(await findByText('Import failed')).toBeTruthy();
    expect(getByText('Retry')).toBeTruthy();
    expect(getByText('Back to Files')).toBeTruthy();
    expect(getByText('flow-ready')).toBeTruthy();

    fireEvent.press(getByText('Back to Files'));

    expect(mockBack).toHaveBeenCalled();
  });

  it('retries successfully after a failed import', async () => {
    mockRunPreparedImport
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(
        createStats({
          imported: {
            customListsCreated: 1,
            listItems: 2,
            ratings: 3,
            watchedEpisodes: 0,
            watchedMovies: 1,
            watchedShows: 0,
          },
          processedActions: 8,
          processedEntities: 8,
          skipped: {
            unresolved_imdb_id: 1,
          },
        })
      );

    const { findByText, getByText } = renderScreen();

    expect(await findByText('Import failed')).toBeTruthy();

    fireEvent.press(getByText('Retry'));

    expect(await findByText('Import complete')).toBeTruthy();
    expect(mockRunPreparedImport).toHaveBeenCalledTimes(2);

    await waitFor(() => {
      expect(getByText('flow-empty')).toBeTruthy();
    });
  });
});
