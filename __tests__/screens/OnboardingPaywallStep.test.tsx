import { act, fireEvent, render, within } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

const mockPurchasePremium = jest.fn();
const mockRestorePurchases = jest.fn();
const mockRequireAccount = jest.fn(() => false);

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

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockRequireAccount,
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({
    accentColor: '#E50914',
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => name,
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

import OnboardingPaywallStep from '@/src/screens/onboarding/OnboardingPaywallStep';

function collectTestIds(node: any, ids: string[] = []): string[] {
  if (!node) return ids;
  if (Array.isArray(node)) {
    node.forEach((child) => collectTestIds(child, ids));
    return ids;
  }
  if (typeof node !== 'object') return ids;
  if (node.props?.testID) {
    ids.push(node.props.testID);
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((child: any) => collectTestIds(child, ids));
  }
  return ids;
}

describe('OnboardingPaywallStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPurchasePremium.mockReset().mockResolvedValue(true);
    mockRestorePurchases.mockReset().mockResolvedValue(false);
    mockRequireAccount.mockReset().mockReturnValue(false);
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

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the personalized hero copy and sticky footer controls', () => {
    const { getByTestId, getByText } = render(
      <OnboardingPaywallStep displayName="Taylor" onClose={jest.fn()} />
    );

    expect(getByText("Taylor, you're all set.")).toBeTruthy();
    expect(getByText('Unlock everything you just set up.')).toBeTruthy();

    const footer = getByTestId('premium-footer');
    expect(within(footer).getByTestId('onboarding-plan-monthly')).toBeTruthy();
    expect(within(footer).getByTestId('onboarding-plan-yearly')).toBeTruthy();
    expect(within(footer).getByTestId('onboarding-subscribe-button')).toBeTruthy();
    expect(within(footer).getByText('Continue')).toBeTruthy();
  });

  it('expands the feature accordions by default and keeps Lists last', () => {
    const rendered = render(<OnboardingPaywallStep displayName="Taylor" onClose={jest.fn()} />);

    expect(rendered.getByTestId('premium-features-section')).toBeTruthy();
    expect(rendered.getByText('Unlimited lists')).toBeTruthy();
    expect(rendered.getByText('Widgets')).toBeTruthy();
    expect(rendered.getByText('Support an indie developer')).toBeTruthy();

    const testIds = collectTestIds(rendered.toJSON());
    expect(testIds.indexOf('premium-category-home-screen')).toBeGreaterThan(-1);
    expect(testIds.indexOf('premium-category-support')).toBeGreaterThan(-1);
    expect(testIds.indexOf('premium-category-lists')).toBeGreaterThan(-1);
    expect(testIds.indexOf('premium-category-home-screen')).toBeLessThan(
      testIds.indexOf('premium-category-lists')
    );
    expect(testIds.indexOf('premium-category-support')).toBeLessThan(
      testIds.indexOf('premium-category-lists')
    );
  });

  it('falls back to the generic ready title when the onboarding name is blank', () => {
    const { getByText, queryByText } = render(
      <OnboardingPaywallStep displayName="   " onClose={jest.fn()} />
    );

    expect(getByText("You're all set.")).toBeTruthy();
    expect(queryByText(/, you're all set\./)).toBeNull();
  });

  it('keeps the close button hidden and untappable until the reveal delay finishes', () => {
    jest.useFakeTimers();
    const onClose = jest.fn();
    const { getByTestId } = render(<OnboardingPaywallStep displayName="Taylor" onClose={onClose} />);

    const closeButton = getByTestId('onboarding-paywall-close-button');

    expect(closeButton.props.disabled).toBe(true);
    fireEvent.press(closeButton);
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(2999);
    });

    expect(getByTestId('onboarding-paywall-close-button').props.disabled).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(getByTestId('onboarding-paywall-close-button').props.disabled).toBe(false);

    fireEvent.press(getByTestId('onboarding-paywall-close-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('subscribes to the selected plan from the footer', () => {
    const { getByTestId } = render(
      <OnboardingPaywallStep displayName="Taylor" onClose={jest.fn()} />
    );

    fireEvent.press(getByTestId('onboarding-plan-monthly'));
    fireEvent.press(getByTestId('onboarding-subscribe-button'));

    expect(mockPurchasePremium).toHaveBeenCalledWith('monthly');
  });

  it('prompts for account instead of showing restore alerts when restore requires auth', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const authRequiredError = new Error('AUTH_REQUIRED') as Error & { code: string };
    authRequiredError.code = 'AUTH_REQUIRED';
    mockRestorePurchases.mockRejectedValueOnce(authRequiredError);

    const { getByText } = render(
      <OnboardingPaywallStep displayName="Taylor" onClose={jest.fn()} />
    );

    fireEvent.press(getByText('Restore'));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockRequireAccount).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
