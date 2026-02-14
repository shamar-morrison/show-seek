import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import type { Purchase } from 'react-native-iap';
import {
  CLIENT_FINISH_TRANSACTION_FAILED,
  PENDING_VALIDATION_QUEUE_STORAGE_KEY,
} from '@/src/context/purchaseValidationRetry';

const mockValidatePurchaseCallable = jest.fn();
const mockSyncPremiumStatusCallable = jest.fn();
const mockInitConnection = jest.fn();
const mockEndConnection = jest.fn();
const mockPurchaseUpdatedListener = jest.fn();
const mockPurchaseErrorListener = jest.fn();
const mockFetchProducts = jest.fn();
const mockGetAvailablePurchases = jest.fn();
const mockFinishTransaction = jest.fn();
const mockRequestPurchase = jest.fn();
const mockConsumePurchaseAndroid = jest.fn();
const mockDeepLinkToSubscriptions = jest.fn();
let mockPurchaseUpdatedCallback: ((purchase: Purchase) => Promise<void>) | null = null;

jest.mock('react-native-iap', () => ({
  initConnection: mockInitConnection,
  endConnection: mockEndConnection,
  purchaseUpdatedListener: mockPurchaseUpdatedListener,
  purchaseErrorListener: mockPurchaseErrorListener,
  fetchProducts: mockFetchProducts,
  getAvailablePurchases: mockGetAvailablePurchases,
  finishTransaction: mockFinishTransaction,
  requestPurchase: mockRequestPurchase,
  consumePurchaseAndroid: mockConsumePurchaseAndroid,
  deepLinkToSubscriptions: mockDeepLinkToSubscriptions,
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn((_functions: unknown, callableName: string) => {
    if (callableName === 'validatePurchase') {
      return mockValidatePurchaseCallable;
    }
    if (callableName === 'syncPremiumStatus') {
      return mockSyncPremiumStatusCallable;
    }
    return jest.fn();
  }),
}));

const { PremiumProvider, usePremium } = require('@/src/context/PremiumContext');

describe('PremiumContext', () => {
  const TEST_UID = 'test-user-id';
  const queueStorageKey = `${PENDING_VALIDATION_QUEUE_STORAGE_KEY}_${TEST_UID}`;

  const getQueuePayload = () => {
    const queueWrites = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
      ([key]) => key === queueStorageKey
    );
    if (queueWrites.length === 0) {
      return null;
    }
    return JSON.parse(queueWrites[queueWrites.length - 1][1] as string) as Record<
      string,
      {
        lastReason: string | null;
        nextRetryAt: number;
        productId: string;
        purchaseToken: string;
        purchaseType: 'in-app' | 'subs';
      }
    >;
  };

  const createSubscriptionPurchase = (overrides: Partial<Purchase> = {}): Purchase => ({
    id: 'purchase-id',
    isAutoRenewing: true,
    platform: 'android',
    productId: 'monthly_showseek_sub',
    purchaseState: 'purchased',
    purchaseToken: 'monthly-token',
    quantity: 1,
    store: 'google',
    transactionDate: Date.now(),
    ...overrides,
  });

  const getPurchaseUpdatedCallback = () => {
    const callback = mockPurchaseUpdatedCallback;
    if (!callback) {
      throw new Error('purchaseUpdatedListener callback was not registered.');
    }
    return callback;
  };

  const waitForProviderInit = async () => {
    await waitFor(() => expect(mockInitConnection).toHaveBeenCalled());
    await waitFor(() => expect(mockPurchaseUpdatedListener).toHaveBeenCalled());
    await waitFor(() => expect(mockPurchaseUpdatedCallback).toBeTruthy());
  };

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PremiumProvider>{children}</PremiumProvider>
  );

  let alertSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPurchaseUpdatedCallback = null;
    await AsyncStorage.clear();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

    mockValidatePurchaseCallable.mockResolvedValue({
      data: { success: true, isPremium: true },
    });
    mockSyncPremiumStatusCallable.mockResolvedValue({
      data: { success: true, isPremium: true },
    });

    mockInitConnection.mockResolvedValue(undefined);
    mockEndConnection.mockResolvedValue(undefined);
    mockFetchProducts.mockResolvedValue([
      {
        id: 'monthly_showseek_sub',
        platform: 'android',
        type: 'subs',
        displayPrice: '$3.00',
        subscriptionOfferDetailsAndroid: [
          {
            offerId: 'one-week-trial',
            offerToken: 'trial-token',
            offerTags: ['one-week-trial'],
            pricingPhases: {
              pricingPhaseList: [
                {
                  priceAmountMicros: '0',
                  billingPeriod: 'P1W',
                  recurrenceMode: 2,
                  formattedPrice: '$0.00',
                },
                {
                  priceAmountMicros: '3000000',
                  billingPeriod: 'P1M',
                  recurrenceMode: 1,
                  formattedPrice: '$3.00',
                },
              ],
            },
          },
          {
            offerId: 'standard-monthly',
            offerToken: 'standard-token',
            offerTags: ['standard'],
            pricingPhases: {
              pricingPhaseList: [
                {
                  priceAmountMicros: '3000000',
                  billingPeriod: 'P1M',
                  recurrenceMode: 1,
                  formattedPrice: '$3.00',
                },
              ],
            },
          },
        ],
      },
      {
        id: 'showseek_yearly_sub',
        platform: 'android',
        type: 'subs',
        displayPrice: '$12.00',
      },
    ]);
    mockGetAvailablePurchases.mockResolvedValue([]);
    mockFinishTransaction.mockResolvedValue(undefined);
    mockPurchaseUpdatedListener.mockImplementation((listener) => {
      mockPurchaseUpdatedCallback = listener;
      return {
        remove: jest.fn(),
        listener,
      };
    });
    mockPurchaseErrorListener.mockImplementation(() => ({
      remove: jest.fn(),
    }));
    mockRequestPurchase.mockResolvedValue(undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('handles validation + finish success by removing pending queue entry and syncing', async () => {
    const { unmount } = renderHook(() => usePremium(), { wrapper });
    await waitForProviderInit();

    jest.clearAllMocks();

    await act(async () => {
      await getPurchaseUpdatedCallback()(
        createSubscriptionPurchase({ purchaseToken: 'success-token' })
      );
    });

    expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
      purchaseToken: 'success-token',
      productId: 'monthly_showseek_sub',
      purchaseType: 'subs',
    });
    expect(mockFinishTransaction).toHaveBeenCalled();
    expect(getQueuePayload()).toEqual({});
    expect(mockSyncPremiumStatusCallable).toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();

    unmount();
  });

  it('queues retryable ack failures in processPurchase and keeps validation success', async () => {
    mockFinishTransaction.mockRejectedValueOnce(new Error('finish failed'));
    mockSyncPremiumStatusCallable.mockResolvedValue({
      data: { success: true, isPremium: true },
    });

    const { result, unmount } = renderHook(() => usePremium(), { wrapper });
    await waitForProviderInit();

    jest.clearAllMocks();

    await act(async () => {
      await getPurchaseUpdatedCallback()(
        createSubscriptionPurchase({ purchaseToken: 'ack-fail-token' })
      );
    });

    const queuePayload = getQueuePayload();
    expect(queuePayload?.['ack-fail-token']).toBeDefined();
    expect(queuePayload?.['ack-fail-token']?.lastReason).toBe(CLIENT_FINISH_TRANSACTION_FAILED);
    expect(queuePayload?.['ack-fail-token']?.nextRetryAt).toBeGreaterThan(Date.now());
    expect(result.current.isPremium).toBe(true);
    expect(mockSyncPremiumStatusCallable).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();

    unmount();
  });

  it('keeps queued purchase when retry worker validation succeeds but finishTransaction fails', async () => {
    const queuedPurchaseToken = 'queued-ack-fail-token';
    await AsyncStorage.setItem(
      queueStorageKey,
      JSON.stringify({
        [queuedPurchaseToken]: {
          purchaseToken: queuedPurchaseToken,
          productId: 'monthly_showseek_sub',
          purchaseType: 'subs',
          createdAt: Date.now() - 1000,
          updatedAt: Date.now() - 1000,
          nextRetryAt: Date.now() - 500,
          lastReason: null,
        },
      })
    );
    mockGetAvailablePurchases.mockResolvedValue([
      createSubscriptionPurchase({ purchaseToken: queuedPurchaseToken }),
    ]);
    mockFinishTransaction.mockRejectedValueOnce(new Error('finish failed'));

    const { unmount } = renderHook(() => usePremium(), { wrapper });
    await waitForProviderInit();

    await waitFor(() => {
      expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
        purchaseToken: queuedPurchaseToken,
        productId: 'monthly_showseek_sub',
        purchaseType: 'subs',
      });
    });

    const queuePayload = getQueuePayload();
    expect(queuePayload?.[queuedPurchaseToken]).toBeDefined();
    expect(queuePayload?.[queuedPurchaseToken]?.lastReason).toBe(CLIENT_FINISH_TRANSACTION_FAILED);
    expect(queuePayload?.[queuedPurchaseToken]?.nextRetryAt).toBeGreaterThan(Date.now());
    expect(alertSpy).toHaveBeenCalled();

    unmount();
  });

  it('removes pending entry on non-retryable validation error', async () => {
    mockValidatePurchaseCallable.mockRejectedValueOnce({
      code: 'functions/failed-precondition',
      details: {
        reason: 'PURCHASE_NOT_FOUND_OR_EXPIRED',
        retryable: false,
      },
    });

    const { unmount } = renderHook(() => usePremium(), { wrapper });
    await waitForProviderInit();

    jest.clearAllMocks();

    await act(async () => {
      await getPurchaseUpdatedCallback()(
        createSubscriptionPurchase({ purchaseToken: 'terminal-validation-token' })
      );
    });

    expect(getQueuePayload()).toEqual({});
    expect(alertSpy).toHaveBeenCalled();

    unmount();
  });

  it('keeps trial lock behavior for TRIAL_ALREADY_USED validation errors', async () => {
    mockValidatePurchaseCallable.mockRejectedValueOnce({
      code: 'functions/failed-precondition',
      details: {
        reason: 'TRIAL_ALREADY_USED',
        retryable: false,
      },
    });

    const { result, unmount } = renderHook(() => usePremium(), { wrapper });
    await waitForProviderInit();

    jest.clearAllMocks();

    await act(async () => {
      await getPurchaseUpdatedCallback()(
        createSubscriptionPurchase({ purchaseToken: 'trial-used-token' })
      );
    });

    await waitFor(() => {
      expect(result.current.monthlyTrial.isEligible).toBe(false);
    });
    expect(result.current.monthlyTrial.reasonKey).toBe('premium.freeTrialUsedMessage');
    expect(alertSpy).not.toHaveBeenCalled();

    unmount();
  });

  it('restores using prioritized purchase order and succeeds on entitled validation', async () => {
    mockGetAvailablePurchases.mockResolvedValue([
      createSubscriptionPurchase({
        purchaseToken: 'monthly-restore-token',
        productId: 'monthly_showseek_sub',
      }),
      createSubscriptionPurchase({
        purchaseToken: 'yearly-restore-token',
        productId: 'showseek_yearly_sub',
      }),
    ]);
    mockValidatePurchaseCallable.mockImplementation(({ productId }: { productId: string }) =>
      Promise.resolve({
        data: {
          success: true,
          isPremium: productId === 'showseek_yearly_sub',
        },
      })
    );

    const { result, unmount } = renderHook(() => usePremium(), { wrapper });
    await waitForProviderInit();

    jest.clearAllMocks();

    let restoreResult = false;
    await act(async () => {
      restoreResult = await result.current.restorePurchases();
    });

    expect(restoreResult).toBe(true);
    expect(mockValidatePurchaseCallable).toHaveBeenCalled();
    expect(mockValidatePurchaseCallable.mock.calls[0][0]).toMatchObject({
      productId: 'showseek_yearly_sub',
      purchaseToken: 'yearly-restore-token',
    });

    unmount();
  });

  it('keeps restore successful when acknowledgment fails and queues retry', async () => {
    mockGetAvailablePurchases.mockResolvedValue([
      createSubscriptionPurchase({
        purchaseToken: 'restore-ack-fail-token',
        productId: 'showseek_yearly_sub',
      }),
    ]);
    mockFinishTransaction.mockRejectedValueOnce(new Error('finish failed'));
    mockValidatePurchaseCallable.mockResolvedValue({
      data: { success: true, isPremium: true },
    });
    mockSyncPremiumStatusCallable.mockResolvedValue({
      data: { success: true, isPremium: true },
    });

    const { result, unmount } = renderHook(() => usePremium(), { wrapper });
    await waitForProviderInit();

    jest.clearAllMocks();

    let restoreResult = false;
    await act(async () => {
      restoreResult = await result.current.restorePurchases();
    });

    expect(restoreResult).toBe(true);
    const queuePayload = getQueuePayload();
    expect(queuePayload?.['restore-ack-fail-token']).toBeDefined();
    expect(queuePayload?.['restore-ack-fail-token']?.lastReason).toBe(
      CLIENT_FINISH_TRANSACTION_FAILED
    );
    expect(alertSpy).toHaveBeenCalled();

    unmount();
  });
});
