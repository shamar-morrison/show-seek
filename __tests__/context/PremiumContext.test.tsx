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

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => 'users/test-user-id'),
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

  it('wires customer info listener after startup sync', async () => {
    renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockAddCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps loading true while either RevenueCat or Firestore is still loading', async () => {
    let resolveConfigure: ((value: boolean) => void) | null = null;
    mockConfigureRevenueCat.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveConfigure = resolve;
        })
    );

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockAuditedOnSnapshot).toHaveBeenCalled();
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      resolveConfigure?.(true);
    });
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
    expect(mockRestorePurchases).toHaveBeenCalled();
  });

  it('returns false when RevenueCat restore has no active entitlement', async () => {
    mockRestorePurchases.mockResolvedValue(makeCustomerInfo(false));

    const { result } = renderHook(() => usePremium(), { wrapper });
    await waitFor(() => expect(mockConfigureRevenueCat).toHaveBeenCalled());

    let restored = true;
    await act(async () => {
      restored = await result.current.restorePurchases();
    });

    expect(restored).toBe(false);
    expect(mockRestorePurchases).toHaveBeenCalled();
  });

  it('throws when RevenueCat restore fails', async () => {
    mockRestorePurchases.mockRejectedValueOnce(new Error('restore failed'));

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

    expect(thrownError).toEqual(expect.objectContaining({ message: 'restore failed' }));
  });

  it('does not run restore flow on non-android platform', async () => {
    (Platform as { OS: string }).OS = 'ios';
    const { result } = renderHook(() => usePremium(), { wrapper });

    let restored = true;
    await act(async () => {
      restored = await result.current.restorePurchases();
    });

    expect(restored).toBe(false);
    expect(mockRestorePurchases).not.toHaveBeenCalled();
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

  it('marks monthly trial as eligible when monthly package has intro price and user has no trial history', async () => {
    mockGetOfferings.mockResolvedValue({
      all: {
        Premium: {
          availablePackages: [
            {
              identifier: '$rc_monthly',
              product: {
                identifier: 'monthly_showseek_sub',
                introPrice: {
                  priceString: 'Free',
                },
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
    });

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(result.current.prices.monthly).toBe('$3.00');
      expect(result.current.monthlyTrial).toEqual({
        isEligible: true,
        offerToken: null,
        reasonKey: null,
      });
    });
  });

  it('marks monthly trial as unavailable when monthly package has no intro price and no trial history', async () => {
    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(result.current.prices.monthly).toBe('$3.00');
      expect(result.current.monthlyTrial).toEqual({
        isEligible: false,
        offerToken: null,
        reasonKey: 'premium.freeTrialUnavailableMessage',
      });
    });
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
