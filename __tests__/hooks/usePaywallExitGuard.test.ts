import { usePaywallExitGuard } from '@/src/hooks/usePaywallExitGuard';
import {
  trackPaywallWinbackDecision,
  trackPaywallWinbackShown,
} from '@/src/services/analytics';
import {
  markHasSeenPaywallWinback,
  readHasSeenPaywallWinback,
} from '@/src/utils/winbackStorage';
import { act, renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';

const mockExitApp = jest.fn();
let backPressHandler: (() => boolean) | null = null;
const mockAddEventListener = jest.fn((event, handler) => {
  if (event === 'hardwareBackPress') {
    backPressHandler = handler as () => boolean;
  }
  return {
    remove: jest.fn(() => {
      backPressHandler = null;
    }),
  };
});

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return {
    ...actual,
    BackHandler: {
      exitApp: () => mockExitApp(),
      addEventListener: (event: any, handler: any) => mockAddEventListener(event, handler),
    },
  };
});

const mockTrackPaywallWinbackShown = trackPaywallWinbackShown as jest.Mock;
const mockTrackPaywallWinbackDecision = trackPaywallWinbackDecision as jest.Mock;
const mockReadHasSeenPaywallWinback = readHasSeenPaywallWinback as jest.Mock;
const mockMarkHasSeenPaywallWinback = markHasSeenPaywallWinback as jest.Mock;

let mockUser: { uid: string } | null = { uid: 'test-user-123' };
let mockIsPremium = false;

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({ isPremium: mockIsPremium }),
}));

jest.mock('@/src/services/analytics', () => ({
  trackPaywallWinbackShown: jest.fn(),
  trackPaywallWinbackDecision: jest.fn(),
}));

jest.mock('@/src/utils/winbackStorage', () => ({
  readHasSeenPaywallWinback: jest.fn(),
  markHasSeenPaywallWinback: jest.fn(),
  clearWinbackStorageCacheForTesting: jest.fn(),
}));

describe('usePaywallExitGuard', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'android';
    jest.clearAllMocks();
    mockUser = { uid: 'test-user-123' };
    mockIsPremium = false;
    mockReadHasSeenPaywallWinback.mockResolvedValue(false);
    backPressHandler = null;
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
  });

  it('shows win-back modal on first hardware back press when eligible', async () => {
    const { result } = renderHook(() => usePaywallExitGuard());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isEligible).toBe(true);
    expect(result.current.isWinbackModalVisible).toBe(false);
    expect(backPressHandler).not.toBeNull();

    // Trigger first back press
    let handled = false;
    act(() => {
      handled = backPressHandler!();
    });

    expect(handled).toBe(true);
    expect(result.current.isWinbackModalVisible).toBe(true);
    expect(mockMarkHasSeenPaywallWinback).toHaveBeenCalledWith('test-user-123');
    expect(mockTrackPaywallWinbackShown).toHaveBeenCalledWith({
      screen: 'onboarding-paywall',
    });
    expect(mockExitApp).not.toHaveBeenCalled();
  });

  it('exits the app on second back press when modal is already visible', async () => {
    const { result } = renderHook(() => usePaywallExitGuard());

    await act(async () => {
      await Promise.resolve();
    });

    // 1st back press: shows modal
    act(() => {
      backPressHandler!();
    });
    expect(result.current.isWinbackModalVisible).toBe(true);

    // 2nd back press: closes modal and exits app
    act(() => {
      backPressHandler!();
    });

    expect(result.current.isWinbackModalVisible).toBe(false);
    expect(mockExitApp).toHaveBeenCalledTimes(1);
  });

  it('handles decline by logging analytics, closing modal, and exiting app', async () => {
    const { result } = renderHook(() => usePaywallExitGuard());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.handleDecline();
    });

    expect(result.current.isWinbackModalVisible).toBe(false);
    expect(mockTrackPaywallWinbackDecision).toHaveBeenCalledWith({
      screen: 'onboarding-paywall',
      decision: 'decline',
    });
    expect(mockExitApp).toHaveBeenCalledTimes(1);
  });

  it('handles close attempt button on paywall by showing modal first then exiting on second', async () => {
    const { result } = renderHook(() => usePaywallExitGuard());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.handleCloseAttempt();
    });

    expect(result.current.isWinbackModalVisible).toBe(true);
    expect(mockTrackPaywallWinbackShown).toHaveBeenCalledTimes(1);
    expect(mockExitApp).not.toHaveBeenCalled();

    // Second close attempt
    act(() => {
      result.current.handleCloseAttempt();
    });

    expect(result.current.isWinbackModalVisible).toBe(false);
    expect(mockExitApp).toHaveBeenCalledTimes(1);
  });

  it('does not show modal and exits directly if user has already seen the winback offer', async () => {
    mockReadHasSeenPaywallWinback.mockResolvedValueOnce(true);

    const { result } = renderHook(() => usePaywallExitGuard());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isEligible).toBe(false);

    act(() => {
      backPressHandler!();
    });

    expect(result.current.isWinbackModalVisible).toBe(false);
    expect(mockTrackPaywallWinbackShown).not.toHaveBeenCalled();
    expect(mockExitApp).toHaveBeenCalledTimes(1);
  });

  it('does not register back handler when disabled or non-Android', () => {
    Platform.OS = 'ios';
    renderHook(() => usePaywallExitGuard({ enabled: true }));
    expect(backPressHandler).toBeNull();
  });
});
