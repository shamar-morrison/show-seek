import { fireEvent, render, within } from '@testing-library/react-native';
import React from 'react';

const mockPurchasePremium = jest.fn();
const mockRestorePurchases = jest.fn();

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

  it('renders the hero and sticky footer controls', () => {
    const { getByTestId, getByText } = render(<OnboardingPaywallStep onClose={jest.fn()} />);

    expect(getByText('ShowSeek Premium')).toBeTruthy();
    expect(getByText('Unlock a smoother way to use ShowSeek.')).toBeTruthy();

    const footer = getByTestId('premium-footer');
    expect(within(footer).getByTestId('onboarding-plan-monthly')).toBeTruthy();
    expect(within(footer).getByTestId('onboarding-plan-yearly')).toBeTruthy();
    expect(within(footer).getByTestId('onboarding-subscribe-button')).toBeTruthy();
    expect(within(footer).getByText('Subscribe')).toBeTruthy();
  });

  it('expands the feature accordions by default and keeps Lists last', () => {
    const rendered = render(<OnboardingPaywallStep onClose={jest.fn()} />);

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

  it('subscribes to the selected plan from the footer', () => {
    const { getByTestId } = render(<OnboardingPaywallStep onClose={jest.fn()} />);

    fireEvent.press(getByTestId('onboarding-plan-monthly'));
    fireEvent.press(getByTestId('onboarding-subscribe-button'));

    expect(mockPurchasePremium).toHaveBeenCalledWith('monthly');
  });
});
