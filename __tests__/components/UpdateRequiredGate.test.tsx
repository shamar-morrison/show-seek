import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { getDoc } from 'firebase/firestore';
import React from 'react';
import { Linking, Platform, Text } from 'react-native';

jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(() => Promise.resolve()),
  reloadAsync: jest.fn(() => Promise.resolve()),
}));

import { UpdateRequiredGate } from '@/src/components/UpdateRequiredGate';
import { APP_COMPATIBILITY_VERSION } from '@/src/constants/appCompatibility';
import { fetchMinimumCompatibilityVersion, isBelowMinimum } from '@/src/services/appVersionGate';
import * as Updates from 'expo-updates';

const configDoc = (data: Record<string, unknown> | null) => ({
  exists: () => data !== null,
  data: () => data ?? undefined,
});

const renderGate = () =>
  render(
    <UpdateRequiredGate>
      <Text testID="app-content">App</Text>
    </UpdateRequiredGate>
  );

describe('app version gate', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('compares against the minimum only when one is known', () => {
    expect(isBelowMinimum(null, 1)).toBe(false);
    expect(isBelowMinimum(2, 2)).toBe(false);
    expect(isBelowMinimum(3, 2)).toBe(true);
  });

  it('remembers the minimum and falls back to it when offline', async () => {
    (getDoc as jest.Mock).mockResolvedValueOnce(configDoc({ minimumCompatibilityVersion: 5 }));
    await expect(fetchMinimumCompatibilityVersion()).resolves.toBe(5);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'appVersionGate:lastMinimumCompatibilityVersion',
      '5'
    );

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (getDoc as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('5');
    await expect(fetchMinimumCompatibilityVersion()).resolves.toBe(5);
    warn.mockRestore();
  });

  it('never blocks when the config cannot be read and nothing is remembered', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (getDoc as jest.Mock).mockRejectedValue(new Error('offline'));

    const { findByTestId, queryByTestId } = renderGate();

    expect(await findByTestId('app-content')).toBeTruthy();
    expect(queryByTestId('update-required-screen')).toBeNull();
    warn.mockRestore();
  });

  it('lets a current build through', async () => {
    (getDoc as jest.Mock).mockResolvedValue(
      configDoc({ minimumCompatibilityVersion: APP_COMPATIBILITY_VERSION })
    );

    const { findByTestId, queryByTestId } = renderGate();

    expect(await findByTestId('app-content')).toBeTruthy();
    await waitFor(() => expect(getDoc).toHaveBeenCalled());
    expect(queryByTestId('update-required-screen')).toBeNull();
  });

  it('blocks an outdated build and installs an available OTA update', async () => {
    (getDoc as jest.Mock).mockResolvedValue(
      configDoc({ minimumCompatibilityVersion: APP_COMPATIBILITY_VERSION + 1 })
    );
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: true });

    const { findByTestId, queryByTestId } = renderGate();

    fireEvent.press(await findByTestId('update-required-button'));
    expect(queryByTestId('app-content')).toBeNull();
    await waitFor(() => expect(Updates.reloadAsync).toHaveBeenCalled());
    expect(Updates.fetchUpdateAsync).toHaveBeenCalled();
  });

  it('opens the Play Store when no OTA update is available', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    (getDoc as jest.Mock).mockResolvedValue(
      configDoc({ minimumCompatibilityVersion: APP_COMPATIBILITY_VERSION + 1 })
    );
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false });
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

    const { findByTestId } = renderGate();
    fireEvent.press(await findByTestId('update-required-button'));

    await waitFor(() =>
      expect(openURL).toHaveBeenCalledWith('market://details?id=app.horizon.showseek')
    );
    expect(Updates.reloadAsync).not.toHaveBeenCalled();
    openURL.mockRestore();
  });
});
