import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockPurchasePremium = jest.fn();
const mockRestorePurchases = jest.fn();
const mockResetTestPurchase = jest.fn();

const mockPremiumState = {
  isPremium: false,
  isLoading: false,
  purchasePremium: mockPurchasePremium,
  restorePurchases: mockRestorePurchases,
  resetTestPurchase: mockResetTestPurchase,
  prices: {
    monthly: '$3.00',
    yearly: '$12.00',
  },
  monthlyTrial: {
    isEligible: true,
    offerToken: 'trial-offer-token',
    reasonKey: null,
  },
  checkPremiumFeature: () => true,
};

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
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

import PremiumScreen from '@/src/screens/PremiumScreen';

describe('PremiumScreen', () => {
  beforeEach(() => {
    mockPurchasePremium.mockReset().mockResolvedValue(true);
    mockRestorePurchases.mockReset().mockResolvedValue(false);
    mockResetTestPurchase.mockReset().mockResolvedValue(undefined);
    mockPremiumState.monthlyTrial = {
      isEligible: true,
      offerToken: 'trial-offer-token',
      reasonKey: null,
    };
  });

  it('defaults to yearly selection when subscribing', () => {
    const { getByTestId, getByText, queryByText } = render(<PremiumScreen />);

    expect(getByText('ShowSeek Premium')).toBeTruthy();
    expect(queryByText('star')).toBeNull();
    expect(getByTestId('plan-yearly-badge')).toBeTruthy();

    fireEvent.press(getByTestId('subscribe-button'));

    expect(mockPurchasePremium).toHaveBeenCalledWith('yearly', { useTrial: false });
  });

  it('subscribes to monthly plan when monthly is selected', () => {
    const { getByTestId } = render(<PremiumScreen />);

    fireEvent.press(getByTestId('plan-monthly'));
    fireEvent.press(getByTestId('subscribe-button'));

    expect(mockPurchasePremium).toHaveBeenCalledWith('monthly', { useTrial: false });
  });

  it('subscribes to yearly plan when yearly is selected', () => {
    const { getByTestId } = render(<PremiumScreen />);

    fireEvent.press(getByTestId('plan-monthly'));
    fireEvent.press(getByTestId('plan-yearly'));
    fireEvent.press(getByTestId('subscribe-button'));

    expect(mockPurchasePremium).toHaveBeenCalledWith('yearly', { useTrial: false });
  });

  it('shows disabled trial toggle message for yearly selection', () => {
    const { getByTestId, getByText } = render(<PremiumScreen />);

    expect(getByTestId('free-trial-toggle').props.disabled).toBe(true);
    expect(getByText('Free trial applies to the monthly plan only.')).toBeTruthy();
  });

  it('enables trial for monthly and shows helper text when toggled on', () => {
    const { getByTestId, getByText } = render(<PremiumScreen />);

    fireEvent.press(getByTestId('plan-monthly'));
    fireEvent(getByTestId('free-trial-toggle'), 'valueChange', true);
    fireEvent.press(getByTestId('subscribe-button'));

    expect(getByText(
      'After the 7-day trial period, you will automatically be charged the ongoing monthly subscription.'
    )).toBeTruthy();
    expect(mockPurchasePremium).toHaveBeenCalledWith('monthly', { useTrial: true });
  });

  it('disables trial and shows explanation when trial is ineligible', () => {
    mockPremiumState.monthlyTrial = {
      isEligible: false,
      offerToken: null,
      reasonKey: 'premium.freeTrialUnavailableMessage',
    };

    const { getByTestId, getByText } = render(<PremiumScreen />);

    fireEvent.press(getByTestId('plan-monthly'));

    expect(getByTestId('free-trial-toggle').props.disabled).toBe(true);
    expect(getByText('Free trial not available for this account.')).toBeTruthy();
  });

  it('turns off trial and shows inline rejection message when trial purchase is rejected', async () => {
    mockPurchasePremium.mockRejectedValueOnce({
      code: 'TRIAL_INELIGIBLE',
      message: 'Trial unavailable',
    });

    const { findByText, getByTestId } = render(<PremiumScreen />);

    fireEvent.press(getByTestId('plan-monthly'));
    fireEvent(getByTestId('free-trial-toggle'), 'valueChange', true);
    fireEvent.press(getByTestId('subscribe-button'));

    await findByText(
      "Free trial isn't available for this account. You can continue with a standard monthly subscription."
    );
    expect(getByTestId('free-trial-toggle').props.value).toBe(false);
  });
});
