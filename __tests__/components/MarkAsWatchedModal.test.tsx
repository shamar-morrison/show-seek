import MarkAsWatchedModal from '@/src/components/MarkAsWatchedModal';
import * as traktManagedEdits from '@/src/utils/traktManagedEdits';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

let mockIsConnected = false;

jest.mock('@/src/context/TraktContext', () => ({
  useTrakt: () => ({
    isConnected: mockIsConnected,
  }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({
    accentColor: '#E50914',
  }),
}));

jest.mock('@/src/components/ui/ModalBackground', () => ({
  ModalBackground: () => null,
}));

jest.mock('@/src/components/CustomDatePicker', () => ({
  CustomDatePicker: () => null,
}));

describe('MarkAsWatchedModal', () => {
  const mockOnClose = jest.fn();
  const mockOnMarkAsWatched = jest.fn().mockResolvedValue(undefined);
  const mockOnClearAll = jest.fn().mockResolvedValue(undefined);
  const mockOnShowToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsConnected = false;
  });

  const renderModal = (props = {}) => {
    return render(
      <MarkAsWatchedModal
        visible={true}
        onClose={mockOnClose}
        movieTitle="Inception"
        releaseDate="2010-07-16"
        watchCount={1}
        onMarkAsWatched={mockOnMarkAsWatched}
        onClearAll={mockOnClearAll}
        onShowToast={mockOnShowToast}
        {...props}
      />
    );
  };

  it('renders modal content with movie title and watch options', () => {
    const { getByText } = renderModal();

    expect(getByText('Inception')).toBeTruthy();
    expect(getByText('Right now')).toBeTruthy();
    expect(getByText('Release date')).toBeTruthy();
    expect(getByText('Clear watch history')).toBeTruthy();
  });

  it('marks as watched right now and closes the modal', async () => {
    const { getByText } = renderModal();

    fireEvent.press(getByText('Right now'));

    await waitFor(() => {
      expect(mockOnMarkAsWatched).toHaveBeenCalledTimes(1);
      expect(mockOnMarkAsWatched.mock.calls[0][0]).toBeInstanceOf(Date);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  it('warns about Trakt-managed edit when Trakt is connected', async () => {
    mockIsConnected = true;
    const warnSpy = jest.spyOn(traktManagedEdits, 'maybeWarnTraktManagedWatchedEdit');

    const { getByText } = renderModal();

    fireEvent.press(getByText('Right now'));

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith(
        true,
        mockOnShowToast,
        expect.any(String)
      );
      expect(mockOnMarkAsWatched).toHaveBeenCalledTimes(1);
    });

    warnSpy.mockRestore();
  });

  it('handles clear all watch history with confirmation alert', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByText } = renderModal();

    fireEvent.press(getByText('Clear watch history'));

    expect(alertSpy).toHaveBeenCalled();
    const alertButtons = alertSpy.mock.calls[0][2];
    const confirmButton = alertButtons?.find((b) => b.style === 'destructive');
    expect(confirmButton).toBeDefined();

    // Trigger destructive confirmation action
    await act(async () => {
      await confirmButton?.onPress?.();
    });

    await waitFor(() => {
      expect(mockOnClearAll).toHaveBeenCalledTimes(1);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    alertSpy.mockRestore();
  });
});
