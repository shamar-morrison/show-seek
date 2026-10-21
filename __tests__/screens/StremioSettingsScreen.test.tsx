import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Alert, AlertButton } from 'react-native';

const RAW_TOKEN = 'f'.repeat(64);
const INSTALL_URL = `https://us-central1-showseek-app-2025.cloudfunctions.net/stremioAddon/${RAW_TOKEN}/manifest.json`;

const mockRouterBack = jest.fn();
const mockToastShow = jest.fn();
const mockSetStringAsync = jest.fn();
const mockCreateInstallLink = jest.fn();
const mockRevokeLink = jest.fn();
const mockGetCachedUserDocument = jest.fn();
const mockMergeUserDocumentCache = jest.fn();
const mockClearUserDocumentCache = jest.fn();
const mockShare = jest.fn();
const mockAnalytics = {
  logLogin: jest.fn(),
  logEvent: jest.fn(),
  trackEvent: jest.fn(),
};

// The shared react-native mock has no Share; extend it for this screen only.
jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  Share: { share: (...args: unknown[]) => mockShare(...args) },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockRouterBack, push: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));
jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => {
    const { View } = require('react-native');
    return <View testID="full-screen-loading" />;
  },
}));
jest.mock('@/src/components/ui/Toast', () => {
  const ReactActual = require('react');
  return {
    __esModule: true,
    default: ReactActual.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
      ReactActual.useImperativeHandle(ref, () => ({ show: mockToastShow }));
      return null;
    }),
  };
});
jest.mock('expo-clipboard', () => ({
  setStringAsync: (...args: unknown[]) => mockSetStringAsync(...args),
}));
jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'member', isAnonymous: false } }),
}));
jest.mock('@/src/services/UserDocumentCache', () => ({
  getCachedUserDocument: (...args: unknown[]) => mockGetCachedUserDocument(...args),
  mergeUserDocumentCache: (...args: unknown[]) => mockMergeUserDocumentCache(...args),
  clearUserDocumentCache: (...args: unknown[]) => mockClearUserDocumentCache(...args),
}));
jest.mock('@/src/services/analytics', () => mockAnalytics);
jest.mock('@/src/services/StremioAddonService', () => {
  const actual = jest.requireActual('@/src/services/StremioAddonService');
  return {
    ...actual,
    stremioAddonService: {
      createInstallLink: () => mockCreateInstallLink(),
      revokeLink: () => mockRevokeLink(),
    },
  };
});

import { resetStremioConnectionForTest } from '@/src/hooks/useStremioConnection';
import StremioSettingsScreen from '@/src/screens/StremioSettingsScreen';
import {
  StremioAccountRequiredError,
  StremioAddonError,
  StremioRateLimitedError,
} from '@/src/services/StremioAddonService';

let alertSpy: jest.SpyInstance;
const consoleSpies: jest.SpyInstance[] = [];

/** Presses the alert button with the given label from the most recent Alert.alert call. */
function pressAlertButton(label: string) {
  const buttons = alertSpy.mock.calls.at(-1)?.[2] as AlertButton[] | undefined;
  const button = buttons?.find((candidate) => candidate.text === label);
  if (!button?.onPress) throw new Error(`No alert button "${label}"`);
  return button.onPress();
}

async function renderScreen(doc: unknown = { stremioAddon: { activeTokenHash: null } }) {
  mockGetCachedUserDocument.mockResolvedValue(doc);
  const screen = render(<StremioSettingsScreen />);
  await waitFor(() => expect(screen.queryByTestId('full-screen-loading')).toBeNull());
  return screen;
}

describe('StremioSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStremioConnectionForTest();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockShare.mockResolvedValue({ action: 'sharedAction' });
    mockSetStringAsync.mockResolvedValue(true);
    mockCreateInstallLink.mockResolvedValue(INSTALL_URL);
    mockRevokeLink.mockResolvedValue(undefined);
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      consoleSpies.push(jest.spyOn(console, method).mockImplementation(() => {}));
    }
  });

  afterEach(() => {
    alertSpy.mockRestore();
    consoleSpies.splice(0).forEach((spy) => spy.mockRestore());
  });

  it('creates a link and offers Share (primary) and Copy with the once-only and private notes', async () => {
    const { getByTestId, getByText, queryByTestId } = await renderScreen();

    expect(getByText('Works with Stremio Desktop and Web, not the Android or iOS apps yet.')).toBeTruthy();
    expect(getByText('Finished movies and episodes are marked as watched.')).toBeTruthy();
    expect(queryByTestId('stremio-disconnect-button')).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId('stremio-create-button'));
    });

    expect(mockCreateInstallLink).toHaveBeenCalledTimes(1);
    expect(getByTestId('stremio-install-url').props.children).toBe(INSTALL_URL);
    expect(getByText('This link is shown only once. A new link replaces it.')).toBeTruthy();
    expect(getByText("Keep this link private. Don't share it with others.")).toBeTruthy();
    expect(getByText('1. On your computer, open Stremio and go to Addons.')).toBeTruthy();
    expect(getByText('Link active')).toBeTruthy();
    expect(mockClearUserDocumentCache).toHaveBeenCalledWith('member');
    expect(mockMergeUserDocumentCache).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByTestId('stremio-share-button'));
    });
    expect(mockShare).toHaveBeenCalledWith({ message: INSTALL_URL });

    await act(async () => {
      fireEvent.press(getByTestId('stremio-copy-button'));
    });
    expect(mockSetStringAsync).toHaveBeenCalledWith(INSTALL_URL);
    expect(mockToastShow).toHaveBeenCalledWith('Link copied');
  });

  it('does not show the link again after leaving and returning', async () => {
    const first = await renderScreen();
    await act(async () => {
      fireEvent.press(first.getByTestId('stremio-create-button'));
    });
    expect(first.getByTestId('stremio-install-url')).toBeTruthy();
    first.unmount();

    const second = await renderScreen({ stremioAddon: { activeTokenHash: 'client-connected' } });
    expect(second.queryByTestId('stremio-install-url')).toBeNull();
    expect(second.queryByText(INSTALL_URL)).toBeNull();
    expect(second.getByText('Link active')).toBeTruthy();
    expect(second.getByTestId('stremio-create-new-button')).toBeTruthy();
  });

  it('confirms before replacing an active link', async () => {
    const { getByTestId } = await renderScreen({ stremioAddon: { activeTokenHash: 'abc' } });

    fireEvent.press(getByTestId('stremio-create-new-button'));
    expect(alertSpy).toHaveBeenLastCalledWith(
      'Create a new link?',
      'Your current link will stop working.',
      expect.any(Array)
    );
    expect(mockCreateInstallLink).not.toHaveBeenCalled();

    await act(async () => {
      await pressAlertButton('Create new link');
    });
    expect(mockCreateInstallLink).toHaveBeenCalledTimes(1);
    expect(getByTestId('stremio-install-url')).toBeTruthy();
  });

  it('confirms before creating when the link state is unknown', async () => {
    mockGetCachedUserDocument.mockRejectedValue(new Error('offline'));
    const screen = render(<StremioSettingsScreen />);
    await waitFor(() => expect(screen.queryByTestId('full-screen-loading')).toBeNull());

    fireEvent.press(screen.getByTestId('stremio-create-button'));
    expect(alertSpy).toHaveBeenLastCalledWith(
      'Create a new link?',
      'Your current link will stop working.',
      expect.any(Array)
    );
  });

  it('disconnects after confirmation and returns to the not-connected view', async () => {
    const { getByTestId, queryByTestId } = await renderScreen({
      stremioAddon: { activeTokenHash: 'abc' },
    });

    fireEvent.press(getByTestId('stremio-disconnect-button'));
    expect(alertSpy).toHaveBeenLastCalledWith(
      'Disconnect Stremio?',
      'Your link will stop working.',
      expect.any(Array)
    );
    await act(async () => {
      await pressAlertButton('Disconnect');
    });

    expect(mockRevokeLink).toHaveBeenCalledTimes(1);
    expect(mockClearUserDocumentCache).toHaveBeenCalledWith('member');
    expect(mockMergeUserDocumentCache).not.toHaveBeenCalled();
    expect(getByTestId('stremio-create-button')).toBeTruthy();
    expect(queryByTestId('stremio-disconnect-button')).toBeNull();
  });

  it('shows the cooldown with a relative retry time', async () => {
    mockCreateInstallLink.mockRejectedValue(
      new StremioRateLimitedError(new Date(Date.now() + 60_000).toISOString())
    );
    const { getByTestId } = await renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('stremio-create-button'));
    });
    expect(alertSpy).toHaveBeenLastCalledWith(
      'Something went wrong',
      'Please wait. Try again in 1 minute.'
    );
  });

  it.each([
    [new StremioAccountRequiredError(), 'You need an account to do that. Please sign in.'],
    [new StremioAddonError(), 'Please try again.'],
    [new StremioRateLimitedError(), 'Please try again.'],
  ])('shows a localized alert for %p', async (error, message) => {
    mockCreateInstallLink.mockRejectedValue(error);
    const { getByTestId, queryByTestId } = await renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('stremio-create-button'));
    });
    expect(alertSpy).toHaveBeenLastCalledWith('Something went wrong', message);
    expect(queryByTestId('stremio-install-url')).toBeNull();
  });

  it('never logs, persists or tracks the raw link', async () => {
    const asyncStorage = AsyncStorage as unknown as Record<string, jest.Mock | undefined>;
    const storageSpies = (['setItem', 'multiSet', 'mergeItem', 'multiMerge'] as const)
      .filter((method) => typeof asyncStorage[method] === 'function')
      .map((method) => jest.spyOn(AsyncStorage, method as 'setItem'));

    const { getByTestId } = await renderScreen();
    await act(async () => {
      fireEvent.press(getByTestId('stremio-create-button'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('stremio-share-button'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('stremio-copy-button'));
    });
    mockShare.mockRejectedValueOnce(new Error(`share failed ${INSTALL_URL}`));
    await act(async () => {
      fireEvent.press(getByTestId('stremio-share-button'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('stremio-disconnect-button'));
    });
    await act(async () => {
      await pressAlertButton('Disconnect');
    });

    const recorded = JSON.stringify([
      ...consoleSpies.map((spy) => spy.mock.calls),
      ...storageSpies.map((spy) => spy.mock.calls),
      ...Object.values(mockAnalytics).map((fn) => fn.mock.calls),
      mockMergeUserDocumentCache.mock.calls,
      mockClearUserDocumentCache.mock.calls,
      mockToastShow.mock.calls,
      alertSpy.mock.calls,
    ]);
    expect(recorded).not.toContain(INSTALL_URL);
    expect(recorded).not.toContain(RAW_TOKEN);
    storageSpies.forEach((spy) => spy.mockRestore());
  });
});
