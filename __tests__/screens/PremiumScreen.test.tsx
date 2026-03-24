import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

const mockPurchasePremium = jest.fn();
const mockRestorePurchases = jest.fn();
const mockTrackPremiumPaywallView = jest.fn();
const mockRouterBack = jest.fn();
const mockRequireAccount = jest.fn(() => false);

const mockAuthState = {
  user: {
    displayName: 'Taylor',
    email: 'taylor@example.com',
    isAnonymous: false,
  } as { displayName: string | null; email?: string | null; isAnonymous?: boolean } | null,
  loading: false,
};

const mockPremiumState = {
  isPremium: false,
  isLoading: false,
  purchasePremium: mockPurchasePremium,
  restorePurchases: mockRestorePurchases,
  prices: {
    monthly: '$3.00',
    yearly: '$12.00',
  },
  monthlyTrial: {
    isEligible: false,
    offerToken: null as string | null,
    reasonKey: null as string | null,
  },
  checkPremiumFeature: () => true,
};

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockRequireAccount,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockRouterBack,
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => name,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('@/src/components/ui/CollapsibleCategory', () => ({
  CollapsibleCategory: 'CollapsibleCategory',
  CollapsibleFeatureItem: 'CollapsibleFeatureItem',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: 'SafeAreaView',
}));

jest.mock('@/src/services/analytics', () => ({
  trackPremiumPaywallView: (...args: unknown[]) => mockTrackPremiumPaywallView(...args),
}));

import PremiumScreen from '@/src/screens/PremiumScreen';

describe('PremiumScreen', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;

  beforeEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    mockRouterBack.mockReset();
    mockPurchasePremium.mockReset().mockResolvedValue(true);
    mockRestorePurchases.mockReset().mockResolvedValue(false);
    mockTrackPremiumPaywallView.mockReset();
    mockRequireAccount.mockReset().mockReturnValue(false);
    mockAuthState.user = { displayName: 'Taylor', email: 'taylor@example.com', isAnonymous: false };
    mockAuthState.loading = false;
    mockPremiumState.isPremium = false;
    mockPremiumState.isLoading = false;
    mockPremiumState.monthlyTrial = {
      isEligible: false,
      offerToken: null,
      reasonKey: null,
    };
    mockPremiumState.prices = {
      monthly: '$3.00',
      yearly: '$12.00',
    };
  });

  afterAll(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
  });

  it('tracks a paywall view on mount for non-premium users', async () => {
    render(<PremiumScreen />);

    await waitFor(() => {
      expect(mockTrackPremiumPaywallView).toHaveBeenCalled();
    });
  });

  it('does not track a paywall view for premium users', () => {
    mockPremiumState.isPremium = true;

    render(<PremiumScreen />);

    expect(mockTrackPremiumPaywallView).not.toHaveBeenCalled();
  });

  it('blocks guest users from viewing the premium paywall', async () => {
    mockAuthState.user = {
      displayName: 'Taylor',
      email: 'taylor@example.com',
      isAnonymous: true,
    };
    mockRequireAccount.mockReturnValue(true);

    const { queryByTestId, queryByText } = render(<PremiumScreen />);

    await waitFor(() => {
      expect(mockRequireAccount).toHaveBeenCalled();
      expect(mockRouterBack).toHaveBeenCalledTimes(1);
    });

    expect(queryByTestId('subscribe-button')).toBeNull();
    expect(queryByTestId('premium-close-button')).toBeNull();
    expect(queryByText('Continue')).toBeNull();
    expect(mockTrackPremiumPaywallView).not.toHaveBeenCalled();
  });

  it('defaults to yearly selection when subscribing', () => {
    const { getByTestId, getByText, queryByTestId } = render(<PremiumScreen />);

    expect(getByText("Taylor, you're all set.")).toBeTruthy();
    expect(getByText('Unlock a smoother way to use ShowSeek.')).toBeTruthy();
    expect(getByTestId('plan-yearly-badge')).toBeTruthy();
    expect(queryByTestId('plan-monthly-badge')).toBeNull();

    fireEvent.press(getByTestId('subscribe-button'));

    expect(mockPurchasePremium).toHaveBeenCalledWith('yearly');
  });

  it('renders the pricing controls inside the sticky footer', () => {
    const { getByText, getByTestId } = render(<PremiumScreen />);

    expect(getByText("Taylor, you're all set.")).toBeTruthy();
    expect(getByText('Continue')).toBeTruthy();

    const footer = getByTestId('premium-footer');
    expect(within(footer).getByTestId('plan-monthly')).toBeTruthy();
    expect(within(footer).getByTestId('plan-yearly')).toBeTruthy();
    expect(within(footer).getByTestId('subscribe-button')).toBeTruthy();
  });

  it('does not render dev-only paywall controls even in __DEV__ builds', () => {
    const { queryByTestId, queryByText } = render(<PremiumScreen />);

    expect(queryByTestId('test-offerings-button')).toBeNull();
    expect(queryByText('Test Offerings (Dev)')).toBeNull();
    expect(queryByText('Reset Purchase (Dev)')).toBeNull();
  });

  it('subscribes to monthly plan when monthly is selected', () => {
    const { getByTestId } = render(<PremiumScreen />);

    fireEvent.press(getByTestId('plan-monthly'));
    fireEvent.press(getByTestId('subscribe-button'));

    expect(mockPurchasePremium).toHaveBeenCalledWith('monthly');
  });

  it('subscribes to yearly plan when yearly is selected', () => {
    const { getByTestId } = render(<PremiumScreen />);

    fireEvent.press(getByTestId('plan-monthly'));
    fireEvent.press(getByTestId('plan-yearly'));
    fireEvent.press(getByTestId('subscribe-button'));

    expect(mockPurchasePremium).toHaveBeenCalledWith('yearly');
  });

  it('does not render free-trial toggle controls', () => {
    const { queryByTestId, queryByText } = render(<PremiumScreen />);

    expect(queryByTestId('free-trial-toggle')).toBeNull();
    expect(queryByTestId('free-trial-helper-text')).toBeNull();
    expect(queryByTestId('free-trial-inline-message')).toBeNull();
    expect(queryByText('One Week Free')).toBeNull();
  });

  it('does not show trial helper text when yearly is selected', () => {
    const { queryByTestId } = render(<PremiumScreen />);

    expect(queryByTestId('billing-helper-text')).toBeNull();
  });

  it('falls back to the email prefix when the auth display name is blank', () => {
    mockAuthState.user = {
      displayName: '   ',
      email: 'fallback.user@example.com',
      isAnonymous: false,
    };

    const { getByText, queryByText } = render(<PremiumScreen />);

    expect(getByText("fallback.user, you're all set.")).toBeTruthy();
    expect(queryByText("You're all set.")).toBeNull();
    expect(getByText('Unlock a smoother way to use ShowSeek.')).toBeTruthy();
  });

  it('falls back to the generic ready title when both auth display name and email are blank', () => {
    mockAuthState.user = { displayName: '   ', email: null, isAnonymous: false };

    const { getByText, queryByText } = render(<PremiumScreen />);

    expect(getByText("You're all set.")).toBeTruthy();
    expect(queryByText(/, you're all set\./)).toBeNull();
    expect(getByText('Unlock a smoother way to use ShowSeek.')).toBeTruthy();
  });

  it('keeps the close button immediately available on the regular premium screen', () => {
    const { getByTestId } = render(<PremiumScreen />);

    fireEvent.press(getByTestId('premium-close-button'));

    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });

  it('shows monthly trial-eligible helper text when monthly is selected and eligible', () => {
    mockPremiumState.monthlyTrial = {
      isEligible: true,
      offerToken: null,
      reasonKey: null,
    };

    const { getByTestId, queryByTestId } = render(<PremiumScreen />);

    expect(getByTestId('plan-monthly-badge')).toHaveTextContent('7-day trial');

    fireEvent.press(getByTestId('plan-monthly'));

    expect(getByTestId('billing-helper-text')).toHaveTextContent(
      'Eligible for a 7-day free trial.'
    );
    expect(queryByTestId('billing-helper-reason')).toBeNull();
  });

  it('does not show helper text when monthly trial is unavailable', () => {
    mockPremiumState.monthlyTrial = {
      isEligible: false,
      offerToken: null,
      reasonKey: 'premium.freeTrialUsedMessage',
    };

    const { getByTestId, queryByTestId } = render(<PremiumScreen />);

    expect(queryByTestId('plan-monthly-badge')).toBeNull();

    fireEvent.press(getByTestId('plan-monthly'));

    expect(queryByTestId('billing-helper-text')).toBeNull();
    expect(queryByTestId('billing-helper-reason')).toBeNull();
  });

  it('shows monthly trial badge before the user selects the monthly plan', () => {
    mockPremiumState.monthlyTrial = {
      isEligible: true,
      offerToken: null,
      reasonKey: null,
    };

    const { getByTestId, queryByTestId } = render(<PremiumScreen />);

    expect(getByTestId('plan-monthly-badge')).toHaveTextContent('7-day trial');
    expect(getByTestId('plan-yearly-badge')).toBeTruthy();
    expect(queryByTestId('billing-helper-text')).toBeNull();
  });

  it('shows generic restore error message when restore fails without an error message', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockRestorePurchases.mockRejectedValueOnce({});
    const { getByText } = render(<PremiumScreen />);

    fireEvent.press(getByText('Restore'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Restore Failed', 'Something went wrong');
    });

    alertSpy.mockRestore();
  });

  it('prompts for account instead of showing restore alerts when restore requires auth', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const authRequiredError = new Error('AUTH_REQUIRED') as Error & { code: string };
    authRequiredError.code = 'AUTH_REQUIRED';
    mockRestorePurchases.mockRejectedValueOnce(authRequiredError);

    const { getByText } = render(<PremiumScreen />);

    fireEvent.press(getByText('Restore'));

    await waitFor(() => {
      expect(mockRequireAccount).toHaveBeenCalledTimes(1);
    });

    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
