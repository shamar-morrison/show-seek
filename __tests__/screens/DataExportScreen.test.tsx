import DataExportScreen from '@/src/screens/DataExportScreen';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

const mockBack = jest.fn();
const mockSetOptions = jest.fn();
const mockPresent = jest.fn();
const mockDismiss = jest.fn();
const mockExportUserData = jest.fn();
const mockRequireAccount = jest.fn(() => false);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
  }),
  useNavigation: () => ({
    setOptions: mockSetOptions,
  }),
}));

jest.mock('@lodev09/react-native-true-sheet', () => {
  const React = require('react');
  const TrueSheet = React.forwardRef(({ children }: { children: React.ReactNode }, ref: any) => {
    React.useImperativeHandle(ref, () => ({ present: mockPresent, dismiss: mockDismiss }));
    return children;
  });
  TrueSheet.displayName = 'TrueSheet';
  return { TrueSheet };
});

jest.mock('react-native-gesture-handler', () => {
  const { Pressable, View } = require('react-native');
  return { GestureHandlerRootView: View, Pressable };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'Light',
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({
    accentColor: '#ff5500',
  }),
}));

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockRequireAccount,
}));

jest.mock('@/src/services/DataExportService', () => ({
  exportUserData: (...args: unknown[]) => mockExportUserData(...args),
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

describe('DataExportScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireAccount.mockReturnValue(false);
    mockExportUserData.mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens the info sheet from the header info button', () => {
    render(<DataExportScreen />);

    const options = mockSetOptions.mock.calls.at(-1)?.[0];
    const { getByTestId } = render(options.headerRight());
    const infoButton = getByTestId('data-export-info-button');

    expect(infoButton.props.accessibilityLabel).toBe('What gets exported');
    fireEvent.press(infoButton);
    expect(mockPresent).toHaveBeenCalledTimes(1);
  });

  it('shows the duration note and a Done button in the info sheet', () => {
    const { getByTestId, getByText } = render(<DataExportScreen />);

    expect(getByText('About your export')).toBeTruthy();
    expect(
      getByText(
        'Titles for rated movies and shows are looked up from TMDB, so large libraries can take a minute.'
      )
    ).toBeTruthy();
    fireEvent.press(getByTestId('data-export-info-done'));
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it('lists what is and is not included in the export', () => {
    const { getByText } = render(<DataExportScreen />);

    expect(getByText('What gets exported')).toBeTruthy();
    [
      'Lists',
      'Ratings',
      'Watched episodes',
      'Favorite episodes',
      'Notes',
      'Favorite people',
    ].forEach((label) => expect(getByText(label)).toBeTruthy());

    expect(getByText("What's not included")).toBeTruthy();
    ['Movie watch dates', 'Reminders', 'Tracked collections', 'App settings'].forEach((label) =>
      expect(getByText(label)).toBeTruthy()
    );
  });

  it('exports CSV by default', async () => {
    const { getByTestId } = render(<DataExportScreen />);

    expect(getByTestId('data-export-format-csv').props.accessibilityState).toMatchObject({
      checked: true,
    });

    await act(async () => {
      fireEvent.press(getByTestId('data-export-start'));
    });

    expect(mockExportUserData).toHaveBeenCalledWith('csv');
  });

  it('exports Markdown after switching format', async () => {
    const { getByTestId } = render(<DataExportScreen />);

    fireEvent.press(getByTestId('data-export-format-markdown'));
    await act(async () => {
      fireEvent.press(getByTestId('data-export-start'));
    });

    expect(mockExportUserData).toHaveBeenCalledWith('markdown');
  });

  it('shows a loading state and ignores repeat presses while exporting', async () => {
    let resolveExport: () => void = () => {};
    mockExportUserData.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveExport = resolve;
      })
    );

    const { getByTestId, getByText, queryByTestId } = render(<DataExportScreen />);

    fireEvent.press(getByTestId('data-export-start'));

    expect(getByTestId('data-export-loading')).toBeTruthy();
    expect(getByText('Exporting…')).toBeTruthy();

    fireEvent.press(getByTestId('data-export-start'));
    expect(mockExportUserData).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveExport();
    });

    await waitFor(() => expect(queryByTestId('data-export-loading')).toBeNull());
  });

  it('shows the translated fallback alert when the export fails', async () => {
    const exportError = new Error('private backend details');
    mockExportUserData.mockRejectedValue(exportError);
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const { getByTestId } = render(<DataExportScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('data-export-start'));
    });

    expect(console.error).toHaveBeenCalledWith('Export failed:', exportError);
    expect(Alert.alert).toHaveBeenCalledWith('Export Failed', 'Export failed. Please try again.');
  });

  it('leaves the screen when no account is signed in', () => {
    mockRequireAccount.mockReturnValue(true);

    render(<DataExportScreen />);

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
