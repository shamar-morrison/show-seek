import { WinbackOfferModal } from '@/src/components/WinbackOfferModal';
import { trackPaywallWinbackDecision } from '@/src/services/analytics';
import {
  getWinbackSubscriptionOption,
  purchaseWinbackOffer,
} from '@/src/services/winbackOffer';
import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Alert, AppState } from 'react-native';

const mockGetWinbackSubscriptionOption = getWinbackSubscriptionOption as jest.Mock;
const mockPurchaseWinbackOffer = purchaseWinbackOffer as jest.Mock;
const mockTrackPaywallWinbackDecision = trackPaywallWinbackDecision as jest.Mock;
const mockRequireAccount = jest.fn(() => false);

jest.mock('@/src/services/winbackOffer', () => ({
  getWinbackSubscriptionOption: jest.fn(),
  purchaseWinbackOffer: jest.fn(),
}));

jest.mock('@/src/services/analytics', () => ({
  trackPaywallWinbackDecision: jest.fn(),
}));

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockRequireAccount,
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#E50914' }),
}));

jest.mock('@/src/components/ui/ModalBackground', () => ({
  ModalBackground: () => null,
}));

const mockOption = {
  id: 'showseek-weekly-plan:win-back-offer',
  productId: 'showseek_weekly_plan',
  pricingPhases: [
    {
      price: {
        formatted: '$0.99',
        amountMicros: 990000,
        currencyCode: 'USD',
      },
    },
  ],
} as any;

describe('WinbackOfferModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetWinbackSubscriptionOption.mockResolvedValue(mockOption);
    mockPurchaseWinbackOffer.mockResolvedValue(true);
    mockRequireAccount.mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders discount offer details and initial 5-minute countdown', async () => {
    const { getByText } = render(
      <WinbackOfferModal
        visible={true}
        onDecline={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByText('Wait! Unlock ShowSeek Premium for Less')).toBeTruthy();
    expect(getByText('$0.99')).toBeTruthy();
    expect(getByText('05:00')).toBeTruthy();
    expect(getByText('Claim Special Offer')).toBeTruthy();
    expect(getByText('No thanks, exit app')).toBeTruthy();
  });

  it('ticks the countdown timer down each second', async () => {
    jest.useFakeTimers();

    const { getByText } = render(
      <WinbackOfferModal
        visible={true}
        onDecline={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByText('05:00')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(65_000); // 1 minute 5 seconds
    });

    expect(getByText('03:55')).toBeTruthy();
  });

  it('recalculates countdown on AppState active transition without resetting to 05:00', async () => {
    let appStateListener: ((state: string) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'change') {
        appStateListener = handler as (state: string) => void;
      }
      return { remove: jest.fn() } as any;
    });

    jest.useFakeTimers();

    const { getByText } = render(
      <WinbackOfferModal
        visible={true}
        onDecline={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Simulate 30s passing while app was backgrounded
    act(() => {
      jest.advanceTimersByTime(30_000);
      appStateListener?.('active');
    });

    expect(getByText('04:30')).toBeTruthy();
  });

  it('shows expired state when countdown hits 00:00', async () => {
    jest.useFakeTimers();

    const { getByText, queryByText } = render(
      <WinbackOfferModal
        visible={true}
        onDecline={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      jest.advanceTimersByTime(300_000); // 5 minutes
    });

    expect(getByText('Offer has expired')).toBeTruthy();
    expect(queryByText('Claim Special Offer')).toBeNull();
    expect(getByText('Exit App')).toBeTruthy();
  });

  it('completes purchase successfully and triggers onSuccess', async () => {
    const onSuccess = jest.fn();
    const { getByText } = render(
      <WinbackOfferModal
        visible={true}
        onDecline={jest.fn()}
        onSuccess={onSuccess}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(getByText('Claim Special Offer'));
    });

    expect(mockPurchaseWinbackOffer).toHaveBeenCalledWith({ subscriptionOption: mockOption });
    expect(mockTrackPaywallWinbackDecision).toHaveBeenCalledWith({
      decision: 'accept',
      screen: 'onboarding-paywall',
      price: 0.99,
      currency: 'USD',
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('handles user cancellation in Play Store sheet without treating as error', async () => {
    mockPurchaseWinbackOffer.mockResolvedValueOnce(false);
    const onSuccess = jest.fn();
    const onDecline = jest.fn();

    const { getByText } = render(
      <WinbackOfferModal
        visible={true}
        onDecline={onDecline}
        onSuccess={onSuccess}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(getByText('Claim Special Offer'));
    });

    expect(mockPurchaseWinbackOffer).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
    expect(mockTrackPaywallWinbackDecision).not.toHaveBeenCalled();
  });

  it('prompts sign-in via useAccountRequired when purchase throws auth required error', async () => {
    const authError = new Error('AUTH_REQUIRED') as any;
    authError.code = 'AUTH_REQUIRED';
    mockPurchaseWinbackOffer.mockRejectedValueOnce(authError);

    const alertSpy = jest.spyOn(Alert, 'alert');

    const { getByText } = render(
      <WinbackOfferModal
        visible={true}
        onDecline={jest.fn()}
        onSuccess={jest.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(getByText('Claim Special Offer'));
    });

    expect(mockRequireAccount).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('alerts user and allows exit on unexpected purchase error', async () => {
    mockPurchaseWinbackOffer.mockRejectedValueOnce(new Error('Network payment failed'));
    const alertSpy = jest.spyOn(Alert, 'alert');
    const onDecline = jest.fn();

    const { getByText } = render(
      <WinbackOfferModal
        visible={true}
        onDecline={onDecline}
        onSuccess={jest.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.press(getByText('Claim Special Offer'));
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Purchase Failed',
      'Network payment failed',
      expect.arrayContaining([expect.objectContaining({ text: 'OK' })])
    );
  });

  it('calls onDecline when decline button is pressed', async () => {
    const onDecline = jest.fn();

    const { getByText } = render(
      <WinbackOfferModal
        visible={true}
        onDecline={onDecline}
        onSuccess={jest.fn()}
      />
    );

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(getByText('No thanks, exit app'));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });
});
