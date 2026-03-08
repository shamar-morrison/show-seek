import type { PreparedImdbImport } from '@/src/utils/imdbImport';
import type { ImdbImportStats } from '@/functions/src/shared/imdbImport';
import { ImdbImportFlowProvider } from '@/src/context/ImdbImportFlowContext';
import ImdbImportScreen from '@/src/screens/ImdbImportScreen';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockPickRawFiles = jest.fn();
const mockPrepareFiles = jest.fn();
const mockRequireAccount = jest.fn(() => false);
let mockIsPremium = true;
let mockIsPremiumLoading = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'Light',
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({
    isLoading: mockIsPremiumLoading,
    isPremium: mockIsPremium,
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

jest.mock('@/src/components/ui/PremiumBadge', () => ({
  PremiumBadge: () => {
    const { Text } = require('react-native');
    return <Text testID="premium-badge">Premium</Text>;
  },
}));

jest.mock('@/src/services/ImdbImportService', () => ({
  imdbImportService: {
    pickRawFiles: (...args: unknown[]) => mockPickRawFiles(...args),
    prepareFiles: (...args: unknown[]) => mockPrepareFiles(...args),
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

const singularPreparedImport: PreparedImdbImport = {
  chunks: [
    {
      entities: [{ imdbId: 'tt0000002', rawTitleType: 'movie', title: 'Only Movie', actions: [] }],
    },
  ],
  files: [
    {
      fileName: 'watchlist.csv',
      kind: 'watchlist',
      stats: createStats({ processedActions: 1, processedEntities: 1 }),
      totalRows: 1,
    },
  ],
  stats: createStats({ processedActions: 1, processedEntities: 1 }),
  unsupportedFiles: [],
};

const emptyPreparedImport: PreparedImdbImport = {
  chunks: [],
  files: [],
  stats: createStats(),
  unsupportedFiles: ['people.csv'],
};

function renderScreen() {
  return render(
    <ImdbImportFlowProvider>
      <ImdbImportScreen />
    </ImdbImportFlowProvider>
  );
}

describe('ImdbImportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsPremium = true;
    mockIsPremiumLoading = false;
    mockRequireAccount.mockReturnValue(false);
    mockPickRawFiles.mockResolvedValue([{ fileName: 'ratings.csv', content: 'csv' }]);
    mockPrepareFiles.mockReturnValue(preparedImport);
  });

  it('renders for free users, shows the CTA premium badge, and routes to premium on select', () => {
    mockIsPremium = false;

    const { getByTestId, getByText } = renderScreen();

    expect(getByTestId('premium-badge')).toBeTruthy();

    fireEvent.press(getByText('Select CSV Files'));

    expect(mockPush).toHaveBeenCalledWith('/premium');
    expect(mockPickRawFiles).not.toHaveBeenCalled();
  });

  it('renders the ready state after selecting files', async () => {
    const { getByText, findByText } = renderScreen();

    fireEvent.press(getByText('Select CSV Files'));

    expect(await findByText('Ready to import')).toBeTruthy();
    expect(getByText('2 files')).toBeTruthy();
    expect(getByText('ratings.csv')).toBeTruthy();
    expect(getByText(/people\.csv/)).toBeTruthy();
    expect(getByText('8 rows')).toBeTruthy();
  });

  it('shows singular count copy for one file, row, and batch', async () => {
    mockPrepareFiles.mockReturnValue(singularPreparedImport);

    const { getAllByText, getByText, findByText } = renderScreen();

    fireEvent.press(getByText('Select CSV Files'));

    expect(await findByText('Ready to import')).toBeTruthy();
    expect(getByText('1 file')).toBeTruthy();
    expect(getAllByText('1 row')).toHaveLength(2);
    expect(getByText('1 batch')).toBeTruthy();
  });

  it('shows the nothing-to-import state when no chunks were prepared', async () => {
    mockPrepareFiles.mockReturnValue(emptyPreparedImport);

    const { findByText, getByText, queryByText } = renderScreen();

    fireEvent.press(getByText('Select CSV Files'));

    expect(await findByText('Nothing to import')).toBeTruthy();
    expect(
      getByText("We couldn't find any supported IMDb rows in the selected files.")
    ).toBeTruthy();
    expect(queryByText('Ready to import')).toBeNull();
  });

  it('navigates to the dedicated progress screen when starting the import', async () => {
    const { findByText, getByText } = renderScreen();

    fireEvent.press(getByText('Select CSV Files'));
    await findByText('Ready to import');
    fireEvent.press(getByText('Start Import'));

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/profile/imdb-import-progress');
  });
});
