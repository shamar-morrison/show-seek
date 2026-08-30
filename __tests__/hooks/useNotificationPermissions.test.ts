import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { Alert, Linking, Platform } from 'react-native';

let mockIsDevice = true;
const mockRaceWithTimeout = jest.fn();

jest.mock('expo-device', () => ({
  get isDevice() {
    return mockIsDevice;
  },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

jest.mock('@/src/utils/timeout', () => ({
  raceWithTimeout: (...args: unknown[]) => mockRaceWithTimeout(...args),
}));

describe('useNotificationPermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDevice = true;
    (Platform as { OS: string }).OS = 'ios';
    mockRaceWithTimeout.mockImplementation((promise: Promise<unknown>) => promise);
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const loadHook = async () => {
    const { useNotificationPermissions } = require('@/src/hooks/useNotificationPermissions');
    const rendered = renderHook(() => useNotificationPermissions());

    await waitFor(() => {
      expect(rendered.result.current.permissionStatus).not.toBe('checking');
    });

    return rendered;
  };

  // Verifies the hook exposes a granted state after the initial permission check succeeds.
  it('loads a granted permission state on mount', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

    const { result } = await loadHook();

    expect(result.current.permissionStatus).toBe('granted');
    expect(result.current.hasPermission).toBe(true);
  });

  // Verifies the hook exposes a denied state so reminder flows can gate correctly on mount.
  it('loads a denied permission state on mount', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    const { result } = await loadHook();

    expect(result.current.permissionStatus).toBe('denied');
    expect(result.current.hasPermission).toBe(false);
  });

  // Verifies timeouts fall back to an undetermined state and surface a user-facing alert instead of hanging.
  it('falls back to undetermined when the initial permission check times out', async () => {
    mockRaceWithTimeout.mockRejectedValueOnce(new Error('Operation timed out'));

    const { result } = await loadHook();

    expect(result.current.permissionStatus).toBe('undetermined');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Permission unavailable',
      "Couldn't check notification permissions on this device.",
      [{ text: 'OK' }]
    );
  });

  // Verifies simulator environments bail out early because notification permissions only work on physical devices.
  it('returns false immediately on non-device environments', async () => {
    mockIsDevice = false;

    const { result } = await loadHook();

    let allowed = true;
    await act(async () => {
      allowed = await result.current.requestPermission();
    });

    expect(allowed).toBe(false);
    expect(Notifications.getPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Not available',
      "Notifications aren't available on this device."
    );
  });

  // Verifies denied permissions without ability to ask again route users to settings.
  it('opens the settings redirect path when permission was previously denied (canAskAgain is false)', async () => {
    (Platform as { OS: string }).OS = 'android';
    (Notifications.getPermissionsAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 'granted' })
      .mockResolvedValueOnce({ status: 'denied', canAskAgain: false });

    const { result } = await loadHook();

    await act(async () => {
      await result.current.requestPermission();
    });

    const buttons = (Alert.alert as jest.Mock).mock.calls[0]?.[2] as {
      onPress?: () => void;
      text: string;
    }[];
    const openSettingsButton = buttons.find((button) => button.text === 'Open Settings');

    openSettingsButton?.onPress?.();

    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  // Verifies Android 13+ fresh ask (status: 'denied', canAskAgain: true) prompts natively rather than opening settings.
  it('requests permission natively on Android 13+ fresh ask (status: denied, canAskAgain: true)', async () => {
    (Platform as { OS: string }).OS = 'android';
    (Notifications.getPermissionsAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 'denied', canAskAgain: true })
      .mockResolvedValueOnce({ status: 'denied', canAskAgain: true });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'granted',
      granted: true,
    });

    const { result } = await loadHook();

    let allowed = false;
    await act(async () => {
      allowed = await result.current.requestPermission();
    });

    expect(allowed).toBe(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Linking.openSettings).not.toHaveBeenCalled();
    expect(result.current.permissionStatus).toBe('granted');
  });

  // Verifies iOS fresh ask (status: 'undetermined', canAskAgain: true) prompts natively rather than opening settings.
  it('requests permission natively on iOS fresh ask (status: undetermined, canAskAgain: true)', async () => {
    (Platform as { OS: string }).OS = 'ios';
    (Notifications.getPermissionsAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 'undetermined', canAskAgain: true })
      .mockResolvedValueOnce({ status: 'undetermined', canAskAgain: true });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'granted',
      granted: true,
    });

    const { result } = await loadHook();

    let allowed = false;
    await act(async () => {
      allowed = await result.current.requestPermission();
    });

    expect(allowed).toBe(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(result.current.permissionStatus).toBe('granted');
  });

  // Verifies a denied user can grant permission after visiting settings and the hook refreshes to the granted state.
  it('updates to granted after a denied user later enables notifications in settings', async () => {
    (Notifications.getPermissionsAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 'denied', canAskAgain: false })
      .mockResolvedValueOnce({ status: 'denied', canAskAgain: false })
      .mockResolvedValueOnce({ status: 'granted', canAskAgain: true });

    const { result } = await loadHook();

    await act(async () => {
      await result.current.requestPermission();
    });

    await act(async () => {
      await result.current.checkPermission();
    });

    expect(result.current.permissionStatus).toBe('granted');
    expect(result.current.hasPermission).toBe(true);
  });

  // Verifies an undetermined permission that is denied during the prompt surfaces the denial alert and returns false.
  it('alerts when the user denies the runtime permission prompt', async () => {
    (Notifications.getPermissionsAsync as jest.Mock)
      .mockResolvedValueOnce({ status: 'granted' })
      .mockResolvedValueOnce({ status: 'undetermined', canAskAgain: true });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'denied',
      granted: false,
    });

    const { result } = await loadHook();

    let allowed = true;
    await act(async () => {
      allowed = await result.current.requestPermission();
    });

    expect(allowed).toBe(false);
    expect(result.current.permissionStatus).toBe('denied');
    expect(Alert.alert).toHaveBeenCalledWith(
      'Permission denied',
      'Notifications are disabled. Enable them in Settings to use reminders.'
    );
  });
});
