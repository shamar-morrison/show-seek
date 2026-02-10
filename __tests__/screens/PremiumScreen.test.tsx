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
  });

  it('defaults to yearly selection when subscribing', () => {
    const { getByTestId, getByText, queryByText } = render(<PremiumScreen />);

    expect(getByText('ShowSeek Premium')).toBeTruthy();
    expect(queryByText('star')).toBeNull();
    expect(getByTestId('plan-yearly-badge')).toBeTruthy();

    fireEvent.press(getByTestId('subscribe-button'));

    expect(mockPurchasePremium).toHaveBeenCalledWith('yearly');
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
});
