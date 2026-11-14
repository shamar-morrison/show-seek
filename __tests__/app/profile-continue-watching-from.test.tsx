import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import React from 'react';

const mockMutateAsync = jest.fn();
let mockPreferences: Record<string, unknown> | null = null;

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: mockPreferences }),
  useUpdatePreference: () => ({ mutateAsync: mockMutateAsync }),
}));
jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#E50914' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Light: 'l' } }));

import ContinueWatchingFromScreen from '@/app/(tabs)/profile/continue-watching-from';

const FIRST = 'continue-watching-from-option-first-unwatched';
const AFTER = 'continue-watching-from-option-after-furthest';

describe('ContinueWatchingFromScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreferences = null;
    mockMutateAsync.mockResolvedValue(undefined);
  });

  it('explains each option, with an example of what comes next', () => {
    const { getAllByText, getByText, queryByText } = render(<ContinueWatchingFromScreen />);

    expect(getByText('First unwatched episode')).toBeTruthy();
    expect(getByText('Next: Episode 5')).toBeTruthy();
    expect(getByText('After your furthest episode')).toBeTruthy();
    expect(getByText('Next: Episode 7 · 1 skipped')).toBeTruthy();
    expect(getAllByText('Watched 1–4 and 6')).toHaveLength(2);
    // The options speak for themselves: no subtitle above them.
    expect(
      queryByText("Choose which episode Watch Progress suggests next when you've skipped one.")
    ).toBeNull();
    expect(
      getByText(
        "Progress and time left always count every episode you haven't watched, whichever you choose."
      )
    ).toBeTruthy();
  });

  it('selects the first unwatched episode by default, and the saved choice otherwise', () => {
    const { getByTestId, rerender } = render(<ContinueWatchingFromScreen />);
    expect(getByTestId(FIRST).props.accessibilityState.selected).toBe(true);
    expect(getByTestId(AFTER).props.accessibilityState.selected).toBe(false);

    mockPreferences = { continueWatchingFrom: 'after-furthest' };
    rerender(<ContinueWatchingFromScreen />);
    expect(getByTestId(FIRST).props.accessibilityState.selected).toBe(false);
    expect(getByTestId(AFTER).props.accessibilityState.selected).toBe(true);
  });

  it('saves a new choice, and does nothing for the current one', async () => {
    const { getByTestId } = render(<ContinueWatchingFromScreen />);

    fireEvent.press(getByTestId(FIRST));
    expect(mockMutateAsync).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByTestId(AFTER));
    });
    expect(mockMutateAsync).toHaveBeenCalledWith({
      key: 'continueWatchingFrom',
      value: 'after-furthest',
    });
  });

  it('tells the user when saving fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockMutateAsync.mockRejectedValueOnce(new Error('offline'));
    const { getByTestId } = render(<ContinueWatchingFromScreen />);

    await act(async () => {
      fireEvent.press(getByTestId(AFTER));
    });

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        expect.any(String),
        'Failed to update this setting. Please try again.'
      )
    );
    alertSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
