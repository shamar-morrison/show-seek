import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import React from 'react';

const mockMutateAsync = jest.fn();
const mockRefetch = jest.fn();
let mockPreferences: Record<string, unknown> | null = null;
let mockIsLoading = false;
let mockError: Error | null = null;

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: mockPreferences,
    isLoading: mockIsLoading,
    error: mockError,
    refetch: mockRefetch,
  }),
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
    mockIsLoading = false;
    mockError = null;
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

  it('shows no choice and saves nothing until the saved preferences are read', async () => {
    mockIsLoading = true;
    mockPreferences = { continueWatchingFrom: 'first-unwatched' }; // only the defaults so far
    const { getByTestId, queryByTestId } = render(<ContinueWatchingFromScreen />);

    for (const id of [FIRST, AFTER]) {
      expect(getByTestId(id).props.accessibilityState).toEqual(
        expect.objectContaining({ selected: false, disabled: true, busy: true })
      );
    }
    await act(async () => {
      fireEvent.press(getByTestId(FIRST));
      fireEvent.press(getByTestId(AFTER));
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(queryByTestId('continue-watching-from-error')).toBeNull();
  });

  it('offers a retry when the saved preferences could not be read', async () => {
    mockError = new Error('offline');
    const { getByTestId, getByText, rerender } = render(<ContinueWatchingFromScreen />);

    expect(getByTestId('continue-watching-from-error')).toBeTruthy();
    expect(getByText('Unable to load preferences')).toBeTruthy();
    expect(getByTestId(AFTER).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false, disabled: true })
    );
    await act(async () => {
      fireEvent.press(getByTestId(AFTER));
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('continue-watching-from-retry'));
    expect(mockRefetch).toHaveBeenCalledTimes(1);

    // Once read, the saved choice shows and can be changed.
    mockError = null;
    mockPreferences = { continueWatchingFrom: 'after-furthest' };
    rerender(<ContinueWatchingFromScreen />);
    expect(getByTestId(AFTER).props.accessibilityState.selected).toBe(true);
    await act(async () => {
      fireEvent.press(getByTestId(FIRST));
    });
    expect(mockMutateAsync).toHaveBeenCalledWith({
      key: 'continueWatchingFrom',
      value: 'first-unwatched',
    });
  });
});
