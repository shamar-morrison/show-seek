const mockInitConnection = jest.fn();
const mockEndConnection = jest.fn();
const mockGetAvailablePurchases = jest.fn();
const mockGetAvailablePurchasesIncludingHistoryAndroid = jest.fn();
const mockHttpsCallable = jest.fn();
const mockValidatePurchaseCallable = jest.fn();

jest.mock('@/src/firebase/config', () => ({
  functions: {},
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

import {
  findLegacyLifetimePurchases,
  findLegacyLifetimePurchase,
  restoreLegacyLifetimeViaCallable,
} from '@/src/services/legacyLifetimeRestore';

describe('legacyLifetimeRestore service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitConnection.mockResolvedValue(true);
    mockEndConnection.mockResolvedValue(true);
    mockGetAvailablePurchases.mockResolvedValue([]);
    mockGetAvailablePurchasesIncludingHistoryAndroid.mockResolvedValue([]);
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
  });

  it('returns ordered lifetime candidates with purchased state prioritized over unknown/pending', async () => {
    mockGetAvailablePurchases.mockResolvedValue([
      {
        productId: 'premium_unlock',
        purchaseState: 'pending',
        purchaseToken: 'pending-new',
        transactionDate: 1900000000000,
        transactionId: 'GPA.PENDING',
      },
      {
        productId: 'premium_unlock',
        purchaseState: 'purchased',
        purchaseToken: 'purchased-old',
        transactionDate: 1700000000000,
        transactionId: 'GPA.PURCHASED',
      },
    ]);
    mockGetAvailablePurchasesIncludingHistoryAndroid.mockResolvedValue([
      {
        productId: 'premium_unlock',
        purchaseState: 'unknown',
        purchaseToken: 'unknown-mid',
        transactionDate: 1800000000000,
        transactionId: 'GPA.UNKNOWN',
      },
    ]);

    const purchases = await findLegacyLifetimePurchases();

    expect(purchases).toEqual([
      {
        productId: 'premium_unlock',
        purchaseState: 'purchased',
        purchaseToken: 'purchased-old',
        transactionDate: 1700000000000,
        transactionId: 'GPA.PURCHASED',
      },
      {
        productId: 'premium_unlock',
        purchaseState: 'unknown',
        purchaseToken: 'unknown-mid',
        transactionDate: 1800000000000,
        transactionId: 'GPA.UNKNOWN',
      },
      {
        productId: 'premium_unlock',
        purchaseState: 'pending',
        purchaseToken: 'pending-new',
        transactionDate: 1900000000000,
        transactionId: 'GPA.PENDING',
      },
    ]);
    expect(mockInitConnection).toHaveBeenCalled();
    expect(mockEndConnection).toHaveBeenCalled();
    expect(mockGetAvailablePurchasesIncludingHistoryAndroid).toHaveBeenCalledWith({
      includeSuspendedAndroid: true,
    });

    const primaryPurchase = await findLegacyLifetimePurchase();
    expect(primaryPurchase).toEqual({
      productId: 'premium_unlock',
      purchaseState: 'purchased',
      purchaseToken: 'purchased-old',
      transactionDate: 1700000000000,
      transactionId: 'GPA.PURCHASED',
    });
  });

  it('deduplicates by purchaseToken and keeps stronger purchase state candidate', async () => {
    mockGetAvailablePurchases.mockResolvedValue([
      {
        productId: 'premium_unlock',
        purchaseState: 'pending',
        purchaseToken: 'dedupe-token',
        transactionDate: 1900000000000,
        transactionId: 'GPA.PENDING.DEDUPE',
      },
    ]);
    mockGetAvailablePurchasesIncludingHistoryAndroid.mockResolvedValue([
      {
        productId: 'premium_unlock',
        purchaseState: 'purchased',
        purchaseToken: 'dedupe-token',
        transactionDate: 1700000000000,
        transactionId: 'GPA.PURCHASED.DEDUPE',
      },
      {
        productId: 'premium_unlock',
        purchaseState: 'purchased',
        purchaseToken: 'other-token',
        transactionDate: 1750000000000,
        transactionId: 'GPA.OTHER',
      },
    ]);

    const purchases = await findLegacyLifetimePurchases();

    expect(purchases).toEqual([
      {
        productId: 'premium_unlock',
        purchaseState: 'purchased',
        purchaseToken: 'other-token',
        transactionDate: 1750000000000,
        transactionId: 'GPA.OTHER',
      },
      {
        productId: 'premium_unlock',
        purchaseState: 'purchased',
        purchaseToken: 'dedupe-token',
        transactionDate: 1700000000000,
        transactionId: 'GPA.PURCHASED.DEDUPE',
      },
    ]);
  });

  it('returns history-aware lifetime candidates even when active purchases are empty', async () => {
    mockGetAvailablePurchases.mockResolvedValue([]);
    mockGetAvailablePurchasesIncludingHistoryAndroid.mockResolvedValue([
      {
        productId: 'premium_unlock',
        purchaseState: 'purchased',
        purchaseToken: 'history-token',
        transactionDate: 1900000000000,
        transactionId: 'GPA.HISTORY',
      },
    ]);

    const purchases = await findLegacyLifetimePurchases();

    expect(purchases).toEqual([
      {
        productId: 'premium_unlock',
        purchaseState: 'purchased',
        purchaseToken: 'history-token',
        transactionDate: 1900000000000,
        transactionId: 'GPA.HISTORY',
      },
    ]);
    expect(mockGetAvailablePurchasesIncludingHistoryAndroid).toHaveBeenCalledWith({
      includeSuspendedAndroid: true,
    });
  });

  it('returns pending-only candidate for classification when no purchased token exists', async () => {
    mockGetAvailablePurchases.mockResolvedValue([
      {
        productId: 'premium_unlock',
        purchaseState: 'pending',
        purchaseToken: 'pending-token',
        transactionDate: 1800000000000,
        transactionId: 'GPA.PENDING.ONLY',
      },
    ]);

    const purchases = await findLegacyLifetimePurchases();

    expect(purchases).toEqual([
      {
        productId: 'premium_unlock',
        purchaseState: 'pending',
        purchaseToken: 'pending-token',
        transactionDate: 1800000000000,
        transactionId: 'GPA.PENDING.ONLY',
      },
    ]);
    expect(mockGetAvailablePurchasesIncludingHistoryAndroid).toHaveBeenCalledWith({
      includeSuspendedAndroid: true,
    });
    expect(mockEndConnection).toHaveBeenCalled();
  });

  it('throws when Google Play purchase query fails', async () => {
    mockInitConnection.mockRejectedValue(new Error('billing unavailable'));

    await expect(findLegacyLifetimePurchase()).rejects.toThrow('billing unavailable');
    expect(mockEndConnection).not.toHaveBeenCalled();
  });

  it('calls validatePurchase callable and returns true for successful lifetime restore', async () => {
    const restored = await restoreLegacyLifetimeViaCallable('test-user-id', {
      productId: 'premium_unlock',
      purchaseState: 'purchased',
      purchaseToken: 'legacy-token-12345',
      transactionDate: 1800000000000,
      transactionId: 'GPA.TEST',
    });

    expect(restored).toBe(true);
    expect(mockValidatePurchaseCallable).toHaveBeenCalledWith({
      productId: 'premium_unlock',
      purchaseToken: 'legacy-token-12345',
      purchaseType: 'in-app',
      source: 'restore',
    });
  });

  it('throws when validatePurchase callable does not confirm premium success', async () => {
    mockValidatePurchaseCallable.mockResolvedValue({
      data: {
        entitlementType: 'none',
        isPremium: false,
        success: true,
      },
    });

    await expect(
      restoreLegacyLifetimeViaCallable('test-user-id', {
        productId: 'premium_unlock',
        purchaseState: 'pending',
        purchaseToken: 'legacy-token-12345',
        transactionDate: 1800000000000,
        transactionId: 'GPA.TEST',
      })
    ).rejects.toThrow('Legacy lifetime validation did not return premium success.');
  });
});
