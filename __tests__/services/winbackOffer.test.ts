import {
  getWinbackSubscriptionOption,
  isWinbackSubscriptionOption,
  purchaseWinbackOffer,
  WINBACK_BASE_PLAN_ID,
  WINBACK_OFFER_ID,
  WINBACK_OFFERING_IDENTIFIER,
  WINBACK_PACKAGE_IDENTIFIER,
  WINBACK_PRODUCT_ID,
  WinbackOfferNotFoundError,
} from '@/src/services/winbackOffer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const mockConfigureRevenueCat = jest.fn();
const mockGetOfferings = jest.fn();
const mockPurchaseSubscriptionOption = jest.fn();
const mockTrackPurchaseSuccess = jest.fn();
const mockTrackPurchaseFailure = jest.fn();
const mockRecordReviewNegativeEvent = jest.fn();

let mockCurrentUser: { uid: string; email?: string | null; isAnonymous?: boolean } | null = {
  uid: 'test-user-id',
  email: 'test@example.com',
  isAnonymous: false,
};

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
}));

jest.mock('@/src/services/revenueCat', () => ({
  configureRevenueCat: (...args: unknown[]) => mockConfigureRevenueCat(...args),
}));

jest.mock('@/src/services/analytics', () => ({
  trackPurchaseSuccess: (...args: unknown[]) => mockTrackPurchaseSuccess(...args),
  trackPurchaseFailure: (...args: unknown[]) => mockTrackPurchaseFailure(...args),
}));

jest.mock('@/src/services/reviewPromptService', () => ({
  recordNegativeEvent: (...args: unknown[]) => mockRecordReviewNegativeEvent(...args),
}));

jest.mock('react-native-purchases', () => {
  const defaultExport = {
    getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
    purchaseSubscriptionOption: (...args: unknown[]) => mockPurchaseSubscriptionOption(...args),
  };

  return {
    __esModule: true,
    default: defaultExport,
    PURCHASES_ERROR_CODE: {
      PURCHASE_CANCELLED_ERROR: '1',
    },
  };
});

const mockWinbackOption = {
  id: `${WINBACK_BASE_PLAN_ID}:${WINBACK_OFFER_ID}`,
  storeProductId: `${WINBACK_PRODUCT_ID}:${WINBACK_BASE_PLAN_ID}`,
  productId: WINBACK_PRODUCT_ID,
  isBasePlan: false,
  tags: [WINBACK_OFFER_ID],
  pricingPhases: [
    {
      billingPeriod: { iso8601: 'P1W', unit: 'WEEK', value: 1 },
      recurrenceMode: 2,
      billingCycleCount: 4,
      price: {
        amountMicros: 990000,
        currencyCode: 'USD',
        formatted: '$0.99',
      },
      offerPaymentMode: 'DISCOUNTED_RECURRING_PAYMENT',
    },
  ],
} as any;

const mockBasePlanOption = {
  id: WINBACK_BASE_PLAN_ID,
  storeProductId: `${WINBACK_PRODUCT_ID}:${WINBACK_BASE_PLAN_ID}`,
  productId: WINBACK_PRODUCT_ID,
  isBasePlan: true,
  tags: [],
  pricingPhases: [
    {
      billingPeriod: { iso8601: 'P1W', unit: 'WEEK', value: 1 },
      recurrenceMode: 1,
      billingCycleCount: null,
      price: {
        amountMicros: 2990000,
        currencyCode: 'USD',
        formatted: '$2.99',
      },
      offerPaymentMode: null,
    },
  ],
} as any;

const mockWinbackOfferings = {
  all: {
    [WINBACK_OFFERING_IDENTIFIER]: {
      identifier: WINBACK_OFFERING_IDENTIFIER,
      serverDescription: 'Paywall Winback',
      metadata: {},
      availablePackages: [
        {
          identifier: WINBACK_PACKAGE_IDENTIFIER,
          packageType: 'WEEKLY',
          product: {
            identifier: `${WINBACK_PRODUCT_ID}:${WINBACK_BASE_PLAN_ID}`,
            description: 'Weekly Plan with Winback Offer',
            title: 'Weekly Subscription',
            price: 2.99,
            priceString: '$2.99',
            subscriptionOptions: [mockBasePlanOption, mockWinbackOption],
          },
        },
      ],
      weekly: null,
      monthly: null,
      annual: null,
      lifetime: null,
      sixMonth: null,
      threeMonth: null,
      twoMonth: null,
      webCheckoutUrl: null,
    },
  },
  current: null,
};

describe('winbackOffer service', () => {
  const originalPlatform = Platform.OS;

  beforeEach(async () => {
    Platform.OS = 'android';
    jest.clearAllMocks();
    await AsyncStorage.clear();

    mockCurrentUser = {
      uid: 'test-user-id',
      email: 'test@example.com',
      isAnonymous: false,
    };
    mockConfigureRevenueCat.mockResolvedValue(true);
    mockGetOfferings.mockResolvedValue(mockWinbackOfferings);
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
  });

  describe('isWinbackSubscriptionOption', () => {
    it('returns false for null, undefined, or base plan options', () => {
      expect(isWinbackSubscriptionOption(null)).toBe(false);
      expect(isWinbackSubscriptionOption(undefined)).toBe(false);
      expect(isWinbackSubscriptionOption(mockBasePlanOption)).toBe(false);
    });

    it('returns true when id matches WINBACK_OFFER_ID exactly', () => {
      const option = {
        id: WINBACK_OFFER_ID,
        isBasePlan: false,
        tags: [],
      } as any;
      expect(isWinbackSubscriptionOption(option)).toBe(true);
    });

    it('returns true when id matches basePlan:offerId format', () => {
      const option = {
        id: `${WINBACK_BASE_PLAN_ID}:${WINBACK_OFFER_ID}`,
        isBasePlan: false,
        tags: [],
      } as any;
      expect(isWinbackSubscriptionOption(option)).toBe(true);
    });

    it('returns true when id ends with :win-back-offer', () => {
      const option = {
        id: `custom-prefix:${WINBACK_OFFER_ID}`,
        isBasePlan: false,
        tags: [],
      } as any;
      expect(isWinbackSubscriptionOption(option)).toBe(true);
    });

    it('returns true when offer tags contain WINBACK_OFFER_ID', () => {
      const option = {
        id: 'some-other-id',
        isBasePlan: false,
        tags: ['promo', WINBACK_OFFER_ID],
      } as any;
      expect(isWinbackSubscriptionOption(option)).toBe(true);
    });

    it('returns false when id and tags do not match win-back offer', () => {
      const option = {
        id: 'standard-discount',
        isBasePlan: false,
        tags: ['regular'],
      } as any;
      expect(isWinbackSubscriptionOption(option)).toBe(false);
    });
  });

  describe('getWinbackSubscriptionOption', () => {
    it('returns null on non-Android platform', async () => {
      Platform.OS = 'ios';
      const option = await getWinbackSubscriptionOption();
      expect(option).toBeNull();
    });

    it('returns null when RevenueCat configuration fails', async () => {
      mockConfigureRevenueCat.mockResolvedValueOnce(false);
      const option = await getWinbackSubscriptionOption();
      expect(option).toBeNull();
    });

    it('returns null when paywall_winback offering is not in RevenueCat offerings', async () => {
      mockGetOfferings.mockResolvedValueOnce({ all: {}, current: null });
      const option = await getWinbackSubscriptionOption();
      expect(option).toBeNull();
    });

    it('returns null when $rc_weekly package is missing from offering', async () => {
      mockGetOfferings.mockResolvedValueOnce({
        all: {
          [WINBACK_OFFERING_IDENTIFIER]: {
            ...mockWinbackOfferings.all[WINBACK_OFFERING_IDENTIFIER],
            availablePackages: [],
          },
        },
        current: null,
      });
      const option = await getWinbackSubscriptionOption();
      expect(option).toBeNull();
    });

    it('returns null when subscriptionOptions has no matching winback offer', async () => {
      mockGetOfferings.mockResolvedValueOnce({
        all: {
          [WINBACK_OFFERING_IDENTIFIER]: {
            ...mockWinbackOfferings.all[WINBACK_OFFERING_IDENTIFIER],
            availablePackages: [
              {
                identifier: WINBACK_PACKAGE_IDENTIFIER,
                product: {
                  identifier: `${WINBACK_PRODUCT_ID}:${WINBACK_BASE_PLAN_ID}`,
                  subscriptionOptions: [mockBasePlanOption],
                },
              },
            ],
          },
        },
        current: null,
      });
      const option = await getWinbackSubscriptionOption();
      expect(option).toBeNull();
    });

    it('returns matching SubscriptionOption when offering and package exist', async () => {
      const option = await getWinbackSubscriptionOption();
      expect(option).toEqual(mockWinbackOption);
      expect(mockGetOfferings).toHaveBeenCalledTimes(1);
    });

    it('uses passed-in offering without calling Purchases.getOfferings()', async () => {
      const preloadedOffering = mockWinbackOfferings.all[WINBACK_OFFERING_IDENTIFIER] as any;
      const option = await getWinbackSubscriptionOption({ offering: preloadedOffering });
      expect(option).toEqual(mockWinbackOption);
      expect(mockGetOfferings).not.toHaveBeenCalled();
    });
  });

  describe('purchaseWinbackOffer', () => {
    it('throws error when run on non-Android platform', async () => {
      Platform.OS = 'ios';
      await expect(purchaseWinbackOffer()).rejects.toThrow(
        'Win-back subscription offer is only configured on Android.'
      );
    });

    it('throws auth required error when user is not logged in', async () => {
      mockCurrentUser = null;
      await expect(purchaseWinbackOffer()).rejects.toThrow('AUTH_REQUIRED');
    });

    it('throws auth required error when user is anonymous', async () => {
      mockCurrentUser = { uid: 'guest-user', isAnonymous: true };
      await expect(purchaseWinbackOffer()).rejects.toThrow('AUTH_REQUIRED');
    });

    it('throws error when RevenueCat is not configured', async () => {
      mockConfigureRevenueCat.mockResolvedValueOnce(false);
      await expect(purchaseWinbackOffer()).rejects.toThrow('RevenueCat SDK is not configured.');
    });

    it('throws WinbackOfferNotFoundError when winback subscription option cannot be found', async () => {
      mockGetOfferings.mockResolvedValueOnce({ all: {}, current: null });

      await expect(purchaseWinbackOffer()).rejects.toThrow(WinbackOfferNotFoundError);
    });

    it('purchases the winback option and updates premium status & analytics on success', async () => {
      mockPurchaseSubscriptionOption.mockResolvedValueOnce({
        customerInfo: {
          entitlements: {
            active: {
              premium: {
                identifier: 'premium',
                isActive: true,
              },
            },
          },
        },
      });

      const result = await purchaseWinbackOffer();
      expect(result).toBe(true);
      expect(mockPurchaseSubscriptionOption).toHaveBeenCalledWith(mockWinbackOption);

      const cachedStatus = await AsyncStorage.getItem('isPremium_test-user-id');
      expect(cachedStatus).toBe('true');

      expect(mockTrackPurchaseSuccess).toHaveBeenCalledWith({
        plan: 'winback',
        productId: WINBACK_PRODUCT_ID,
        price: 0.99,
        currency: 'USD',
      });
    });

    it('returns false on user cancellation without tracking failure or recording negative event', async () => {
      mockPurchaseSubscriptionOption.mockRejectedValueOnce({
        userCancelled: true,
      });

      const result = await purchaseWinbackOffer();
      expect(result).toBe(false);
      expect(mockTrackPurchaseFailure).not.toHaveBeenCalled();
      expect(mockRecordReviewNegativeEvent).not.toHaveBeenCalled();
    });

    it('tracks purchase failure and records negative review event on genuine purchase error', async () => {
      const purchaseError = new Error('Payment declined');
      (purchaseError as any).code = 'PAYMENT_DECLINED';

      mockPurchaseSubscriptionOption.mockRejectedValueOnce(purchaseError);

      await expect(purchaseWinbackOffer()).rejects.toThrow('Payment declined');
      expect(mockTrackPurchaseFailure).toHaveBeenCalledWith({
        plan: 'winback',
        productId: WINBACK_PRODUCT_ID,
        reason: 'Payment declined',
        code: 'PAYMENT_DECLINED',
      });
      expect(mockRecordReviewNegativeEvent).toHaveBeenCalledTimes(1);
    });

    it('uses explicitly provided subscriptionOption if passed in options', async () => {
      mockPurchaseSubscriptionOption.mockResolvedValueOnce({
        customerInfo: {
          entitlements: {
            active: {
              premium: {},
            },
          },
        },
      });

      const customOption = {
        ...mockWinbackOption,
        id: 'custom-winback-option',
      };

      const result = await purchaseWinbackOffer({ subscriptionOption: customOption });
      expect(result).toBe(true);
      expect(mockPurchaseSubscriptionOption).toHaveBeenCalledWith(customOption);
      expect(mockGetOfferings).not.toHaveBeenCalled();
    });
  });
});
