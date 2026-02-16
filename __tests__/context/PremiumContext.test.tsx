import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Platform } from 'react-native';

const mockConfigureRevenueCat = jest.fn();
const mockCreateUserDocument = jest.fn();
const mockGetOfferings = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockLogIn = jest.fn();
const mockLogOut = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockAddCustomerInfoUpdateListener = jest.fn();
const mockRemoveCustomerInfoUpdateListener = jest.fn();
const mockAuditedOnSnapshot = jest.fn();
const mockOnAuthStateChanged = jest.fn();
const mockInitConnection = jest.fn();
const mockEndConnection = jest.fn();
const mockGetAvailablePurchases = jest.fn();
const mockGetAvailablePurchasesIncludingHistoryAndroid = jest.fn();
const mockHttpsCallable = jest.fn();
const mockValidatePurchaseCallable = jest.fn();
const mockGetCachedUserDocument = jest.fn();

process.env.EXPO_PUBLIC_ENABLE_PREMIUM_REALTIME_LISTENER = 'true';

jest.mock('@/src/config/readOptimization', () => ({
  READ_OPTIMIZATION_FLAGS: {
    enablePremiumRealtimeListener: true,
  },
}));

jest.mock('@/src/firebase/config', () => ({
  auth: {
    currentUser: { uid: 'test-user-id', email: 'test@example.com' },
  },
  db: {},
  functions: {},
}));

jest.mock('@/src/firebase/user', () => ({
  createUserDocument: (...args: unknown[]) => mockCreateUserDocument(...args),
}));

jest.mock('@/src/services/firestoreReadAudit', () => ({
  auditedOnSnapshot: (...args: unknown[]) => mockAuditedOnSnapshot(...args),
}));

jest.mock('@/src/services/revenueCat', () => ({
  configureRevenueCat: (...args: unknown[]) => mockConfigureRevenueCat(...args),
}));

jest.mock('@/src/services/UserDocumentCache', () => ({
  getCachedUserDocument: (...args: unknown[]) => mockGetCachedUserDocument(...args),
}));

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => 'users/test-user-id'),
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => mockHttpsCallable(...args),
}));

jest.mock('react-native-iap', () => ({
  endConnection: (...args: unknown[]) => mockEndConnection(...args),
  getAvailablePurchases: (...args: unknown[]) => mockGetAvailablePurchases(...args),
  getAvailablePurchasesIncludingHistoryAndroid: (...args: unknown[]) =>
    mockGetAvailablePurchasesIncludingHistoryAndroid(...args),
  initConnection: (...args: unknown[]) => mockInitConnection(...args),
}));

jest.mock('react-native-purchases', () => {
  const defaultExport = {
    addCustomerInfoUpdateListener: (...args: unknown[]) =>
      mockAddCustomerInfoUpdateListener(...args),
    getCustomerInfo: (...args: unknown[]) => mockGetCustomerInfo(...args),
    getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
    logIn: (...args: unknown[]) => mockLogIn(...args),
    logOut: (...args: unknown[]) => mockLogOut(...args),
    purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
    removeCustomerInfoUpdateListener: (...args: unknown[]) =>
      mockRemoveCustomerInfoUpdateListener(...args),
    restorePurchases: (...args: unknown[]) => mockRestorePurchases(...args),
  };

  return {
    __esModule: true,
    default: defaultExport,
    PURCHASES_ERROR_CODE: {
      PURCHASE_CANCELLED_ERROR: '1',
    },
  };
});

const baseOfferings = {
  all: {
    Premium: {
      availablePackages: [
        {
          identifier: '$rc_monthly',
          product: {
            identifier: 'monthly_showseek_sub',
            priceString: '$3.00',
          },
        },
        {
          identifier: '$rc_annual',
          product: {
            identifier: 'showseek_yearly_sub',
            priceString: '$12.00',
          },
        },
      ],
    },
  },
  current: null,
};

const basePlanSuffixOfferings = {
  all: {
    Premium: {
      availablePackages: [
        {
          identifier: '$rc_monthly',
          product: {
            identifier: 'monthly_showseek_sub:monthly-base-plan',
            priceString: '$3.00',
          },
        },
        {
          identifier: '$rc_annual',
          product: {
            identifier: 'showseek_yearly_sub:yearly-base-plan',
            priceString: '$12.00',
          },
        },
      ],
    },
  },
  current: null,
};

const makeCustomerInfo = (isPremium: boolean) => ({
  entitlements: {
    active: isPremium
      ? {
          premium: {
            periodType: 'NORMAL',
            productIdentifier: 'monthly_showseek_sub',
          },
        }
      : {},
    all: isPremium
      ? {
          premium: {
            periodType: 'NORMAL',
            productIdentifier: 'monthly_showseek_sub',
          },
        }
      : {},
  },
  subscriptionsByProductIdentifier: {},
});

const createSnapshot = (premium: Record<string, unknown> = {}) => ({
  data: () => ({ premium }),
  exists: () => true,
});

describe('PremiumContext', () => {
  const { PremiumProvider, usePremium } = require('@/src/context/PremiumContext');
  const originalPlatform = Platform.OS;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PremiumProvider>{children}</PremiumProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = 'android';

    mockConfigureRevenueCat.mockResolvedValue(true);
    mockCreateUserDocument.mockResolvedValue(undefined);
    mockGetOfferings.mockResolvedValue(baseOfferings);
    mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(true));
    mockLogIn.mockResolvedValue({ customerInfo: makeCustomerInfo(true), created: false });
    mockLogOut.mockResolvedValue(makeCustomerInfo(false));
    mockPurchasePackage.mockResolvedValue({
      customerInfo: makeCustomerInfo(true),
      productIdentifier: 'monthly_showseek_sub',
    });
    mockRestorePurchases.mockResolvedValue(makeCustomerInfo(true));
    mockInitConnection.mockResolvedValue(true);
    mockEndConnection.mockResolvedValue(true);
    mockGetAvailablePurchases.mockResolvedValue([]);
    mockGetAvailablePurchasesIncludingHistoryAndroid.mockResolvedValue([]);
    mockGetCachedUserDocument.mockResolvedValue({
      premium: {
        entitlementType: 'subscription',
        productId: 'monthly_showseek_sub',
      },
    });
    mockValidatePurchaseCallable.mockResolvedValue({
      data: {
        entitlementType: 'lifetime',
        isPremium: true,
        success: true,
      },
    });
    mockHttpsCallable.mockImplementation((_functions, functionName) => {
      if (functionName === 'validatePurchase') {
        return (...args: unknown[]) => mockValidatePurchaseCallable(...args);
      }
      return jest.fn();
    });

    mockOnAuthStateChanged.mockImplementation((_auth, callback) => {
      callback({ uid: 'test-user-id', email: 'test@example.com' });
      return jest.fn();
    });

    mockAuditedOnSnapshot.mockImplementation((_ref, onNext) => {
      onNext(createSnapshot({ hasUsedTrial: false, isPremium: false }));
      return jest.fn();
    });
  });

  afterAll(() => {
    (Platform as { OS: string }).OS = originalPlatform;
  });

  it('initializes RevenueCat, logs in user, and loads package pricing', async () => {
    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockConfigureRevenueCat).toHaveBeenCalled();
      expect(mockLogIn).toHaveBeenCalledWith('test-user-id');
      expect(result.current.prices.monthly).toBe('$3.00');
      expect(result.current.prices.yearly).toBe('$12.00');
      expect(result.current.isPremium).toBe(true);
    });
  });

  it('skips RevenueCat startup sync when Firestore premium marker indicates legacy lifetime', async () => {
    mockGetCachedUserDocument.mockResolvedValue({
      premium: {
        entitlementType: 'lifetime',
        productId: 'premium_unlock',
        isPremium: true,
      },
    });

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockCreateUserDocument).toHaveBeenCalled();
      expect(mockGetCachedUserDocument).toHaveBeenCalled();
      expect(result.current.isPremium).toBe(true);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockConfigureRevenueCat).not.toHaveBeenCalled();
    expect(mockLogIn).not.toHaveBeenCalled();
    expect(mockInitConnection).not.toHaveBeenCalled();
  });

  it('runs startup preflight restore and bypasses RevenueCat when legacy lifetime purchase is found', async () => {
    mockGetCachedUserDocument.mockResolvedValue({
      premium: {},
    });
    mockValidatePurchaseCallable
      .mockRejectedValueOnce({
        code: 'functions/failed-precondition',
        details: {
          reason: 'LIFETIME_PURCHASE_PENDING',
        },
        message: 'Lifetime purchase is pending.',
      })
      .mockResolvedValueOnce({
        data: {
          entitlementType: 'lifetime',
          isPremium: true,
          success: true,
        },
      });
    mockGetAvailablePurchases.mockResolvedValue([
      {
        productId: 'premium_unlock',
        purchaseToken: 'legacy-token-pending',
        transactionDate: 1739900000000,
        transactionId: 'GPA.PENDING.5678',
      },
      {
        productId: 'premium_unlock',
        purchaseToken: 'legacy-token-12345',
        transactionDate: 1739800000000,
        transactionId: 'GPA.1234-5678',
      },
    ]);

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockInitConnection).toHaveBeenCalled();
      expect(mockValidatePurchaseCallable).toHaveBeenNthCalledWith(1, {
        productId: 'premium_unlock',
        purchaseToken: 'legacy-token-pending',
        purchaseType: 'in-app',
        source: 'restore',
      });
      expect(mockValidatePurchaseCallable).toHaveBeenNthCalledWith(2, {
        productId: 'premium_unlock',
        purchaseToken: 'legacy-token-12345',
        purchaseType: 'in-app',
        source: 'restore',
      });
      expect(result.current.isPremium).toBe(true);
    });

    expect(mockConfigureRevenueCat).not.toHaveBeenCalled();
    expect(mockLogIn).not.toHaveBeenCalled();
  });

  it('continues to RevenueCat startup sync when startup preflight throws', async () => {
    mockGetCachedUserDocument.mockResolvedValue({
      premium: {},
    });
    mockInitConnection.mockRejectedValue(new Error('billing unavailable'));

    renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockConfigureRevenueCat).toHaveBeenCalled();
      expect(mockLogIn).toHaveBeenCalledWith('test-user-id');
    });
  });

  it('skips legacy startup preflight when known subscription marker exists and runs RevenueCat sync', async () => {
    mockGetCachedUserDocument.mockResolvedValue({
      premium: {
        entitlementType: 'subscription',
        productId: 'showseek_yearly_sub',
        isPremium: true,
      },
    });

    renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockConfigureRevenueCat).toHaveBeenCalled();
      expect(mockLogIn).toHaveBeenCalledWith('test-user-id');
    });

    expect(mockInitConnection).not.toHaveBeenCalled();
  });

  it('skips RevenueCat listener and foreground refresh wiring when bypass is active', async () => {
    mockGetCachedUserDocument.mockResolvedValue({
      premium: {
        entitlementType: 'lifetime',
        productId: 'premium_unlock',
        isPremium: true,
      },
    });

    renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockGetCachedUserDocument).toHaveBeenCalled();
      expect(mockConfigureRevenueCat).not.toHaveBeenCalled();
    });

    expect(mockAddCustomerInfoUpdateListener).not.toHaveBeenCalled();
    expect(mockRemoveCustomerInfoUpdateListener).not.toHaveBeenCalled();
    expect(mockGetCustomerInfo).not.toHaveBeenCalled();
  });

  it('purchases a selected package by plan and returns premium success', async () => {
    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => expect(result.current.prices.monthly).toBe('$3.00'));

    let purchaseResult = false;
    await act(async () => {
      purchaseResult = await result.current.purchasePremium('monthly');
    });

    expect(mockPurchasePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: '$rc_monthly',
      })
    );
    expect(purchaseResult).toBe(true);
  });

  it('returns false for canceled purchases', async () => {
    mockPurchasePackage.mockRejectedValueOnce({
      code: '1',
      userCancelled: true,
    });

    const { result } = renderHook(() => usePremium(), { wrapper });
    await waitFor(() => expect(result.current.prices.monthly).toBe('$3.00'));

    let purchaseResult = true;
    await act(async () => {
      purchaseResult = await result.current.purchasePremium('monthly');
    });

    expect(purchaseResult).toBe(false);
  });

  it('returns true from restore when RevenueCat has active premium entitlement', async () => {
    mockRestorePurchases.mockResolvedValue(makeCustomerInfo(true));
    const { result } = renderHook(() => usePremium(), { wrapper });
    await waitFor(() => expect(mockConfigureRevenueCat).toHaveBeenCalled());

    let restored = false;
    await act(async () => {
      restored = await result.current.restorePurchases();
    });

    expect(restored).toBe(true);
    expect(mockInitConnection).toHaveBeenCalled();
    expect(mockRestorePurchases).toHaveBeenCalled();
    expect(mockValidatePurchaseCallable).not.toHaveBeenCalled();
  });

  it('restores legacy lifetime before RevenueCat when lifetime purchase exists', async () => {
    mockRestorePurchases.mockResolvedValue(makeCustomerInfo(false));
    mockValidatePurchaseCallable
      .mockRejectedValueOnce({
        code: 'functions/failed-precondition',
        details: {
          reason: 'LIFETIME_PURCHASE_PENDING',
        },
        message: 'Lifetime purchase is pending.',
      })
      .mockResolvedValueOnce({
        data: {
          entitlementType: 'lifetime',
          isPremium: true,
          success: true,
        },
      });
    mockGetAvailablePurchases.mockResolvedValue([
      {
        productId: 'premium_unlock',
        purchaseToken: 'legacy-token-pending',
        transactionDate: 1739900000000,
        transactionId: 'GPA.PENDING.5678',
      },
      {
        productId: 'premium_unlock',
        purchaseToken: 'legacy-token-12345',
        transactionDate: 1739800000000,
        transactionId: 'GPA.1234-5678',
      },
    ]);

    const { result } = renderHook(() => usePremium(), { wrapper });
    await waitFor(() => expect(mockConfigureRevenueCat).toHaveBeenCalled());

    let restored = false;
    await act(async () => {
      restored = await result.current.restorePurchases();
    });

    expect(restored).toBe(true);
    expect(mockInitConnection).toHaveBeenCalled();
    expect(mockEndConnection).toHaveBeenCalled();
    expect(mockValidatePurchaseCallable).toHaveBeenNthCalledWith(1, {
      productId: 'premium_unlock',
      purchaseToken: 'legacy-token-pending',
      purchaseType: 'in-app',
      source: 'restore',
    });
    expect(mockValidatePurchaseCallable).toHaveBeenNthCalledWith(2, {
      productId: 'premium_unlock',
      purchaseToken: 'legacy-token-12345',
      purchaseType: 'in-app',
      source: 'restore',
    });
    expect(mockRestorePurchases).not.toHaveBeenCalled();
  });

  it('returns false when no legacy lifetime purchase exists and RevenueCat has no entitlement', async () => {
    mockRestorePurchases.mockResolvedValue(makeCustomerInfo(false));
    mockGetAvailablePurchases.mockResolvedValue([
      {
        productId: 'monthly_showseek_sub',
        purchaseToken: 'sub-token',
        transactionDate: 1739700000000,
      },
    ]);

    const { result } = renderHook(() => usePremium(), { wrapper });
    await waitFor(() => expect(mockConfigureRevenueCat).toHaveBeenCalled());

    let restored = true;
    await act(async () => {
      restored = await result.current.restorePurchases();
    });

    expect(restored).toBe(false);
    expect(mockRestorePurchases).toHaveBeenCalled();
    expect(mockValidatePurchaseCallable).not.toHaveBeenCalled();
  });

  it('throws when legacy lifetime callable restore fails', async () => {
    mockRestorePurchases.mockResolvedValue(makeCustomerInfo(false));
    mockGetAvailablePurchases.mockResolvedValue([
      {
        productId: 'premium_unlock',
        purchaseToken: 'legacy-token-12345',
        transactionDate: 1739700000000,
        transactionId: 'GPA.1234-5678',
      },
    ]);
    mockValidatePurchaseCallable.mockRejectedValue(new Error('callable failed'));

    const { result } = renderHook(() => usePremium(), { wrapper });
    await waitFor(() => expect(mockConfigureRevenueCat).toHaveBeenCalled());

    let thrownError: unknown = null;
    await act(async () => {
      try {
        await result.current.restorePurchases();
      } catch (error) {
        thrownError = error;
      }
    });

    expect(thrownError).toEqual(expect.objectContaining({ message: 'callable failed' }));
    expect(mockRestorePurchases).not.toHaveBeenCalled();
  });

  it('restores legacy lifetime before RevenueCat even when RevenueCat restore would throw', async () => {
    mockRestorePurchases.mockRejectedValue(new Error('Payment is pending'));
    mockGetAvailablePurchases.mockResolvedValue([
      {
        productId: 'premium_unlock',
        purchaseToken: 'legacy-token-12345',
        transactionDate: 1739700000000,
        transactionId: 'GPA.1234-5678',
      },
    ]);

    const { result } = renderHook(() => usePremium(), { wrapper });
    await waitFor(() => expect(mockConfigureRevenueCat).toHaveBeenCalled());

    let restored = false;
    await act(async () => {
      restored = await result.current.restorePurchases();
    });

    expect(restored).toBe(true);
    expect(mockInitConnection).toHaveBeenCalled();
    expect(mockGetAvailablePurchases).toHaveBeenCalled();
    expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
      productId: 'premium_unlock',
      purchaseToken: 'legacy-token-12345',
      purchaseType: 'in-app',
      source: 'restore',
    });
    expect(mockRestorePurchases).not.toHaveBeenCalled();
  });

  it('throws LEGACY_RESTORE_PENDING when RevenueCat restore is pending and no legacy token can be validated', async () => {
    mockRestorePurchases.mockRejectedValue(new Error('Payment is pending'));
    mockGetAvailablePurchases.mockResolvedValue([
      {
        productId: 'monthly_showseek_sub',
        purchaseToken: 'sub-token',
        transactionDate: 1739700000000,
      },
    ]);

    const { result } = renderHook(() => usePremium(), { wrapper });
    await waitFor(() => expect(mockConfigureRevenueCat).toHaveBeenCalled());

    let thrownError: unknown = null;
    await act(async () => {
      try {
        await result.current.restorePurchases();
      } catch (error) {
        thrownError = error;
      }
    });

    expect(thrownError).toEqual(
      expect.objectContaining({
        code: 'LEGACY_RESTORE_PENDING',
      })
    );
    expect(mockRestorePurchases).toHaveBeenCalled();
    expect(mockInitConnection).toHaveBeenCalled();
    expect(mockGetAvailablePurchases).toHaveBeenCalled();
    expect(mockValidatePurchaseCallable).not.toHaveBeenCalled();
  });

  it('restores legacy lifetime using purchase token extracted from RevenueCat restore error', async () => {
    mockRestorePurchases.mockRejectedValue(
      new Error(
        'Error restoring purchase: StoreTransaction(orderId=, productIds=[premium_unlock], purchaseToken=rc-token-from-error.12345). Error: PurchasesError(code=PaymentPendingError, message=\'The payment is pending.\')'
      )
    );
    mockGetAvailablePurchases.mockResolvedValue([
      {
        productId: 'monthly_showseek_sub',
        purchaseToken: 'sub-token',
        transactionDate: 1739700000000,
      },
    ]);

    const { result } = renderHook(() => usePremium(), { wrapper });
    await waitFor(() => expect(mockConfigureRevenueCat).toHaveBeenCalled());

    let restored = false;
    await act(async () => {
      restored = await result.current.restorePurchases();
    });

    expect(restored).toBe(true);
    expect(mockRestorePurchases).toHaveBeenCalled();
    expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
      productId: 'premium_unlock',
      purchaseToken: 'rc-token-from-error.12345',
      purchaseType: 'in-app',
      source: 'restore',
    });
  });

  it('throws LEGACY_RESTORE_PENDING when RevenueCat-derived legacy token is pending/not-purchased', async () => {
    mockRestorePurchases.mockRejectedValue(
      new Error(
        'Error restoring purchase: StoreTransaction(orderId=, productIds=[premium_unlock], purchaseToken=rc-token-pending.99999). Error: PurchasesError(code=PaymentPendingError, message=\'The payment is pending.\')'
      )
    );
    mockValidatePurchaseCallable.mockRejectedValue({
      code: 'functions/failed-precondition',
      details: {
        reason: 'LIFETIME_PURCHASE_PENDING',
      },
      message: 'Lifetime purchase is pending.',
    });
    mockGetAvailablePurchases.mockResolvedValue([
      {
        productId: 'monthly_showseek_sub',
        purchaseToken: 'sub-token',
        transactionDate: 1739700000000,
      },
    ]);

    const { result } = renderHook(() => usePremium(), { wrapper });
    await waitFor(() => expect(mockConfigureRevenueCat).toHaveBeenCalled());

    let thrownError: unknown = null;
    await act(async () => {
      try {
        await result.current.restorePurchases();
      } catch (error) {
        thrownError = error;
      }
    });

    expect(thrownError).toEqual(
      expect.objectContaining({
        code: 'LEGACY_RESTORE_PENDING',
      })
    );
    expect(mockRestorePurchases).toHaveBeenCalled();
    expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
      productId: 'premium_unlock',
      purchaseToken: 'rc-token-pending.99999',
      purchaseType: 'in-app',
      source: 'restore',
    });
  });

  it('throws LEGACY_RESTORE_PENDING when legacy candidates are pending and RevenueCat has no entitlement', async () => {
    mockRestorePurchases.mockResolvedValue(makeCustomerInfo(false));
    mockValidatePurchaseCallable.mockRejectedValue({
      code: 'functions/failed-precondition',
      details: {
        reason: 'LIFETIME_PURCHASE_PENDING',
      },
      message: 'Lifetime purchase is pending.',
    });
    mockGetAvailablePurchases.mockResolvedValue([
      {
        productId: 'premium_unlock',
        purchaseState: 'pending',
        purchaseToken: 'legacy-token-pending',
        transactionDate: 1739800000000,
        transactionId: 'GPA.PENDING.5678',
      },
    ]);

    const { result } = renderHook(() => usePremium(), { wrapper });
    await waitFor(() => expect(mockConfigureRevenueCat).toHaveBeenCalled());

    let thrownError: unknown = null;
    await act(async () => {
      try {
        await result.current.restorePurchases();
      } catch (error) {
        thrownError = error;
      }
    });

    expect(thrownError).toEqual(
      expect.objectContaining({
        code: 'LEGACY_RESTORE_PENDING',
      })
    );
    expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
      productId: 'premium_unlock',
      purchaseToken: 'legacy-token-pending',
      purchaseType: 'in-app',
      source: 'restore',
    });
    expect(mockRestorePurchases).toHaveBeenCalled();
  });

  it('does not run restore fallback flow on non-android platform', async () => {
    (Platform as { OS: string }).OS = 'ios';
    const { result } = renderHook(() => usePremium(), { wrapper });

    let restored = true;
    await act(async () => {
      restored = await result.current.restorePurchases();
    });

    expect(restored).toBe(false);
    expect(mockRestorePurchases).not.toHaveBeenCalled();
    expect(mockInitConnection).not.toHaveBeenCalled();
  });

  it('matches package selection when RevenueCat product IDs include base plan suffixes', async () => {
    mockGetOfferings.mockResolvedValue(basePlanSuffixOfferings);

    const { result } = renderHook(() => usePremium(), { wrapper });
    await waitFor(() => expect(result.current.prices.monthly).toBe('$3.00'));

    let purchaseResult = false;
    await act(async () => {
      purchaseResult = await result.current.purchasePremium('monthly');
    });

    expect(mockPurchasePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        product: expect.objectContaining({
          identifier: 'monthly_showseek_sub:monthly-base-plan',
        }),
      })
    );
    expect(purchaseResult).toBe(true);
  });

  it('throws an explicit error when Premium offering is missing', async () => {
    mockGetOfferings.mockResolvedValue({
      all: {
        Default: {
          availablePackages: [],
        },
      },
      current: null,
    });

    const { result } = renderHook(() => usePremium(), { wrapper });
    await waitFor(() => expect(mockConfigureRevenueCat).toHaveBeenCalled());

    let thrownError: unknown = null;
    await act(async () => {
      try {
        await result.current.purchasePremium('monthly');
      } catch (error) {
        thrownError = error;
      }
    });

    expect(thrownError).toEqual(
      expect.objectContaining({
        message: 'RevenueCat offering "Premium" not found',
      })
    );
  });

  it('keeps premium true from Firestore fallback when RevenueCat is non-premium', async () => {
    mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
    mockLogIn.mockResolvedValue({ customerInfo: makeCustomerInfo(false), created: false });

    mockAuditedOnSnapshot.mockImplementation((_ref, onNext) => {
      onNext(createSnapshot({ hasUsedTrial: true, isPremium: true }));
      return jest.fn();
    });

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(result.current.isPremium).toBe(true);
      expect(result.current.monthlyTrial.reasonKey).toBe('premium.freeTrialUsedMessage');
    });
  });
});
