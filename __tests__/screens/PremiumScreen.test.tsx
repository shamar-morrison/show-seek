import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

const mockPurchasePremium = jest.fn();
const mockRestorePurchases = jest.fn();
const mockResetTestPurchase = jest.fn();
const mockGetOfferings = jest.fn();

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
    isEligible: false,
    offerToken: null as string | null,
    reasonKey: null as string | null,
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

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
  },
}));

import PremiumScreen from '@/src/screens/PremiumScreen';

describe('PremiumScreen', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;

  beforeEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    mockPurchasePremium.mockReset().mockResolvedValue(true);
    mockRestorePurchases.mockReset().mockResolvedValue(false);
    mockResetTestPurchase.mockReset().mockResolvedValue(undefined);
    mockPremiumState.monthlyTrial = {
      isEligible: false,
      offerToken: null,
      reasonKey: null,
    };
    mockPremiumState.prices = {
      monthly: '$3.00',
      yearly: '$12.00',
    };
    mockGetOfferings.mockReset().mockResolvedValue({
      all: {
        Premium: {
          availablePackages: [{ identifier: '$rc_monthly' }, { identifier: '$rc_annual' }],
        },
      },
      current: {
        availablePackages: [{ identifier: '$rc_monthly' }, { identifier: '$rc_annual' }],
        identifier: 'Premium',
      },
    });
  });

  afterAll(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
  });

  it('defaults to yearly selection when subscribing', () => {
    const { getByTestId, getByText } = render(<PremiumScreen />);

    expect(getByText('ShowSeek Premium')).toBeTruthy();
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

  it('shows monthly trial-eligible helper text when monthly is selected and eligible', () => {
    mockPremiumState.monthlyTrial = {
      isEligible: true,
      offerToken: null,
      reasonKey: null,
    };

    const { getByTestId, queryByTestId } = render(<PremiumScreen />);
    fireEvent.press(getByTestId('plan-monthly'));

    expect(getByTestId('billing-helper-text')).toHaveTextContent('Eligible for a 7-day free trial.');
    expect(queryByTestId('billing-helper-reason')).toBeNull();
  });

  it('shows monthly ineligible text when monthly trial is unavailable', () => {
    mockPremiumState.monthlyTrial = {
      isEligible: false,
      offerToken: null,
      reasonKey: 'premium.freeTrialUsedMessage',
    };

    const { getByTestId, queryByTestId } = render(<PremiumScreen />);
    fireEvent.press(getByTestId('plan-monthly'));

    expect(getByTestId('billing-helper-text')).toHaveTextContent(
      'Free trial not available for this account.'
    );
    expect(queryByTestId('billing-helper-reason')).toBeNull();
  });

  it('runs manual offerings fetch from the dev debug button', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const { getByTestId } = render(<PremiumScreen />);

    fireEvent.press(getByTestId('test-offerings-button'));

    await waitFor(() => {
      expect(mockGetOfferings).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith('Offerings', '2');
    });
  });

  it('shows pending-specific restore message when restore throws LEGACY_RESTORE_PENDING', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    const pendingError = Object.assign(new Error('pending'), {
      code: 'LEGACY_RESTORE_PENDING',
    });
    mockRestorePurchases.mockRejectedValueOnce(pendingError);
    const { getByText } = render(<PremiumScreen />);

    fireEvent.press(getByText('Restore Purchases'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Purchase Pending Verification',
        'Your purchase is still pending in Google Play. Please wait for completion and try restoring again.'
      );
    });
  });

  it('shows generic restore error message when restore fails without an error message', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    mockRestorePurchases.mockRejectedValueOnce({});
    const { getByText } = render(<PremiumScreen />);

    fireEvent.press(getByText('Restore Purchases'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Restore Failed', 'Something went wrong');
    });
  });
});
