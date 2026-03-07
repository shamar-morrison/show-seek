import type { PreparedImdbImport } from '@/src/utils/imdbImport';
import type { ImdbImportStats } from '@/functions/src/shared/imdbImport';
import ImdbImportScreen from '@/src/screens/ImdbImportScreen';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockPickRawFiles = jest.fn();
const mockPrepareFiles = jest.fn();
const mockRunPreparedImport = jest.fn();
const mockRequireAccount = jest.fn(() => false);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
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

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({
    isLoading: false,
    isPremium: true,
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
    CollapsibleFeatureItem: ({
      description,
      text,
    }: {
      description?: string;
      text: string;
    }) => (
      <View>
        <Text>{text}</Text>
        {description ? <Text>{description}</Text> : null}
      </View>
    ),
  };
});

jest.mock('@/src/services/ImdbImportService', () => ({
  imdbImportService: {
    pickRawFiles: (...args: unknown[]) => mockPickRawFiles(...args),
    prepareFiles: (...args: unknown[]) => mockPrepareFiles(...args),
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
  chunks: [{ entities: [{ imdbId: 'tt0000001', rawTitleType: 'movie', title: 'Imported Movie', actions: [] }] }],
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

describe('ImdbImportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAccount.mockReturnValue(false);
    mockPickRawFiles.mockResolvedValue([{ fileName: 'ratings.csv', content: 'csv' }]);
    mockPrepareFiles.mockReturnValue(preparedImport);
  });

  it('renders the ready state after selecting files', async () => {
    const { getByText, findByText } = render(<ImdbImportScreen />);

    fireEvent.press(getByText('Select CSV Files'));

    expect(await findByText('Ready to import')).toBeTruthy();
    expect(getByText('ratings.csv')).toBeTruthy();
    expect(getByText(/people\.csv/)).toBeTruthy();
    expect(getByText('8 rows')).toBeTruthy();
  });

  it('shows progress and a grouped final summary after import', async () => {
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

    const { findByText, getByTestId, getByText } = render(<ImdbImportScreen />);

    fireEvent.press(getByText('Select CSV Files'));
    await findByText('Ready to import');
    fireEvent.press(getByText('Start Import'));

    expect(await findByText('25% complete')).toBeTruthy();
    expect(getByText('1 of 4 upload batches finished')).toBeTruthy();
    expect(getByTestId('imdb-import-progress-bar')).toBeTruthy();

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
      expect(mockInvalidateQueries).toHaveBeenCalled();
    });
  });

  it('uses issues-only copy when there are no imported totals to show', async () => {
    mockRunPreparedImport.mockResolvedValue(
      createStats({
        processedActions: 8,
        processedEntities: 8,
        skipped: {
          unresolved_imdb_id: 2,
        },
      })
    );

    const { findByText, getByText } = render(<ImdbImportScreen />);

    fireEvent.press(getByText('Select CSV Files'));
    await findByText('Ready to import');
    fireEvent.press(getByText('Start Import'));

    expect(await findByText('Import complete')).toBeTruthy();
    expect(
      getByText('This summary only shows items that were skipped or ignored during the import.')
    ).toBeTruthy();
  });
});
