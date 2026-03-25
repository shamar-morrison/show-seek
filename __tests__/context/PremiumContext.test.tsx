import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { AppState, Platform } from 'react-native';

const mockConfigureRevenueCat = jest.fn();
const mockCreateUserDocument = jest.fn();
const mockGetCachedUserDocument = jest.fn();
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
const mockAppStateListenerRemove = jest.fn();
let mockEnablePremiumRealtimeListener = true;
let mockCurrentUser:
  | { uid: string; email?: string | null; isAnonymous?: boolean }
  | null = {
  uid: 'test-user-id',
  email: 'test@example.com',
  isAnonymous: false,
};
let authStateChangeCallback:
  | ((user: { uid: string; email?: string | null; isAnonymous?: boolean } | null) => void)
  | null = null;
let appStateChangeHandler: ((nextState: string) => void) | null = null;

process.env.EXPO_PUBLIC_ENABLE_PREMIUM_REALTIME_LISTENER = 'true';

jest.mock('@/src/config/readOptimization', () => ({
  READ_OPTIMIZATION_FLAGS: {
    get enablePremiumRealtimeListener() {
      return mockEnablePremiumRealtimeListener;
    },
  },
}));

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
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

jest.mock('@/src/services/UserDocumentCache', () => ({
  getCachedUserDocument: (...args: unknown[]) => mockGetCachedUserDocument(...args),
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

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

describe('PremiumContext', () => {
  const { PremiumProvider, usePremium } = require('@/src/context/PremiumContext');
  const originalPlatform = Platform.OS;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <PremiumProvider>{children}</PremiumProvider>
  );

  const emitAuthStateChange = (
    nextUser: { uid: string; email?: string | null; isAnonymous?: boolean } | null
  ) => {
    mockCurrentUser = nextUser;
    act(() => {
      authStateChangeCallback?.(nextUser);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = 'android';
    mockEnablePremiumRealtimeListener = true;
    mockCurrentUser = {
      uid: 'test-user-id',
      email: 'test@example.com',
      isAnonymous: false,
    };
    authStateChangeCallback = null;
    appStateChangeHandler = null;

    mockConfigureRevenueCat.mockResolvedValue(true);
    mockCreateUserDocument.mockResolvedValue(undefined);
    mockGetCachedUserDocument.mockResolvedValue({
      premium: { hasUsedTrial: false, isPremium: false },
    });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
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
      authStateChangeCallback = callback;
      callback(mockCurrentUser);
      return jest.fn();
    });

    mockAppStateListenerRemove.mockReset();
    (AppState.addEventListener as jest.Mock).mockImplementation((_event, callback) => {
      appStateChangeHandler = callback as (nextState: string) => void;
      return { remove: mockAppStateListenerRemove };
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

  it('uses cached premium during startup while live checks are still loading', async () => {
    const configureDeferred = createDeferred<boolean>();
    let snapshotCallback: ((snapshot: ReturnType<typeof createSnapshot>) => void) | null = null;

    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
    mockConfigureRevenueCat.mockImplementation(() => configureDeferred.promise);
    mockAuditedOnSnapshot.mockImplementation((_ref, onNext) => {
      snapshotCallback = onNext;
      return jest.fn();
    });

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isLoading).toBe(true);
    });

    expect(mockLogIn).not.toHaveBeenCalled();

    await act(async () => {
      snapshotCallback?.(createSnapshot({ hasUsedTrial: false, isPremium: true }));
      configureDeferred.resolve(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('clears cached premium once live startup checks settle as non-premium', async () => {
    let snapshotCallback: ((snapshot: ReturnType<typeof createSnapshot>) => void) | null = null;

    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');
    mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo(false));
    mockLogIn.mockResolvedValue({ customerInfo: makeCustomerInfo(false), created: false });
    mockAuditedOnSnapshot.mockImplementation((_ref, onNext) => {
      snapshotCallback = onNext;
      return jest.fn();
    });

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isLoading).toBe(true);
    });

    await act(async () => {
      snapshotCallback?.(createSnapshot({ hasUsedTrial: false, isPremium: false }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('clears previous premium state immediately when auth changes users', async () => {
    const userA = {
      uid: 'user-a',
      email: 'user-a@example.com',
      isAnonymous: false,
    };
    const userB = {
      uid: 'user-b',
      email: 'user-b@example.com',
      isAnonymous: false,
    };
    const userBConfigure = createDeferred<boolean>();

    mockCurrentUser = userA;
    mockConfigureRevenueCat.mockImplementation(() =>
      mockCurrentUser?.uid === userB.uid ? userBConfigure.promise : Promise.resolve(true)
    );

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    emitAuthStateChange(userB);

    expect(result.current.isPremium).toBe(false);
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      userBConfigure.resolve(false);
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('keeps loading true until cache and live startup checks finish', async () => {
    const cacheDeferred = createDeferred<string | null>();
    let snapshotCallback: ((snapshot: ReturnType<typeof createSnapshot>) => void) | null = null;

    (AsyncStorage.getItem as jest.Mock).mockImplementation(() => cacheDeferred.promise);
    mockConfigureRevenueCat.mockResolvedValue(false);
    mockAuditedOnSnapshot.mockImplementation((_ref, onNext) => {
      snapshotCallback = onNext;
      return jest.fn();
    });

    const { result } = renderHook(() => usePremium(), { wrapper });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      cacheDeferred.resolve(null);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      snapshotCallback?.(createSnapshot({ hasUsedTrial: false, isPremium: false }));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isPremium).toBe(false);
    });
  });

  it('ignores stale startup sync results after the auth user changes', async () => {
    const userA = {
      uid: 'user-a',
      email: 'user-a@example.com',
      isAnonymous: false,
    };
    const userB = {
      uid: 'user-b',
      email: 'user-b@example.com',
      isAnonymous: false,
    };
    const staleConfigure = createDeferred<boolean>();

    mockCurrentUser = userA;
    mockConfigureRevenueCat.mockImplementation(() =>
      mockCurrentUser?.uid === userA.uid ? staleConfigure.promise : Promise.resolve(true)
    );

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockConfigureRevenueCat).toHaveBeenCalledTimes(1);
    });

    emitAuthStateChange(userB);

    await waitFor(() => {
      expect(mockLogIn).toHaveBeenCalledWith(userB.uid);
      expect(result.current.prices.monthly).toBe('$3.00');
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      staleConfigure.resolve(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockLogIn).not.toHaveBeenCalledWith(userA.uid);
    expect(mockGetCustomerInfo).toHaveBeenCalledTimes(1);
    expect(result.current.prices.monthly).toBe('$3.00');
    expect(result.current.isPremium).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('ignores stale non-realtime firestore refresh results after the auth user changes', async () => {
    const userA = {
      uid: 'user-a',
      email: 'user-a@example.com',
      isAnonymous: false,
    };
    const userB = {
      uid: 'user-b',
      email: 'user-b@example.com',
      isAnonymous: false,
    };
    const userARefresh = createDeferred<{ premium: Record<string, unknown> } | null>();
    const userBRefresh = createDeferred<{ premium: Record<string, unknown> } | null>();

    mockEnablePremiumRealtimeListener = false;
    mockCurrentUser = userA;
    mockConfigureRevenueCat.mockResolvedValue(false);
    mockGetCachedUserDocument.mockImplementation((userId: string) => {
      if (userId === userA.uid) {
        return userARefresh.promise;
      }

      if (userId === userB.uid) {
        return userBRefresh.promise;
      }

      return Promise.resolve(null);
    });

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockGetCachedUserDocument).toHaveBeenCalledWith(
        userA.uid,
        expect.objectContaining({
          callsite: 'PremiumContext.refreshPremiumFromFirestore',
          forceRefresh: true,
        })
      );
    });

    emitAuthStateChange(userB);

    await waitFor(() => {
      expect(mockGetCachedUserDocument).toHaveBeenCalledWith(
        userB.uid,
        expect.objectContaining({
          callsite: 'PremiumContext.refreshPremiumFromFirestore',
          forceRefresh: true,
        })
      );
    });

    await act(async () => {
      userBRefresh.resolve({
        premium: {
          hasUsedTrial: false,
          isPremium: false,
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      userARefresh.resolve({
        premium: {
          hasUsedTrial: true,
          isPremium: true,
        },
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isPremium).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('ignores stale realtime firestore snapshot callbacks after the auth user changes', async () => {
    const userA = {
      uid: 'user-a',
      email: 'user-a@example.com',
      isAnonymous: false,
    };
    const userB = {
      uid: 'user-b',
      email: 'user-b@example.com',
      isAnonymous: false,
    };
    const staleUnsubscribe = jest.fn();
    let staleSnapshotCallback: ((snapshot: ReturnType<typeof createSnapshot>) => void) | null = null;

    mockCurrentUser = userA;
    mockConfigureRevenueCat.mockResolvedValue(false);
    mockAuditedOnSnapshot.mockImplementation((_ref, onNext) => {
      if (!staleSnapshotCallback) {
        staleSnapshotCallback = onNext;
        return staleUnsubscribe;
      }

      onNext(createSnapshot({ hasUsedTrial: false, isPremium: false }));
      return jest.fn();
    });

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockAuditedOnSnapshot).toHaveBeenCalledTimes(1);
    });

    emitAuthStateChange(userB);

    await waitFor(() => {
      expect(staleUnsubscribe).toHaveBeenCalledTimes(1);
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      staleSnapshotCallback?.(createSnapshot({ hasUsedTrial: true, isPremium: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isPremium).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('ignores stale realtime firestore listener errors after the auth user changes', async () => {
    const userA = {
      uid: 'user-a',
      email: 'user-a@example.com',
      isAnonymous: false,
    };
    const userB = {
      uid: 'user-b',
      email: 'user-b@example.com',
      isAnonymous: false,
    };
    const staleUnsubscribe = jest.fn();
    let staleErrorCallback: ((error: Error) => void) | null = null;
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    mockCurrentUser = userA;
    mockConfigureRevenueCat.mockResolvedValue(false);
    mockAuditedOnSnapshot.mockImplementation((_ref, onNext, onError) => {
      if (!staleErrorCallback) {
        staleErrorCallback = onError;
        return staleUnsubscribe;
      }

      onNext(createSnapshot({ hasUsedTrial: true, isPremium: true }));
      return jest.fn();
    });

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockAuditedOnSnapshot).toHaveBeenCalledTimes(1);
    });

    emitAuthStateChange(userB);

    await waitFor(() => {
      expect(staleUnsubscribe).toHaveBeenCalledTimes(1);
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      staleErrorCallback?.(new Error('stale listener failure'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isPremium).toBe(true);
    expect(result.current.isLoading).toBe(false);

    consoleSpy.mockRestore();
  });

  it('ignores stale foreground customer info refresh results after the auth user changes', async () => {
    const userA = {
      uid: 'user-a',
      email: 'user-a@example.com',
      isAnonymous: false,
    };
    const userB = {
      uid: 'user-b',
      email: 'user-b@example.com',
      isAnonymous: false,
    };
    const foregroundRefresh = createDeferred<ReturnType<typeof makeCustomerInfo>>();

    mockCurrentUser = userA;
    mockConfigureRevenueCat.mockResolvedValue(false);

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    mockGetCustomerInfo.mockImplementation(() => foregroundRefresh.promise);

    act(() => {
      appStateChangeHandler?.('active');
    });

    await waitFor(() => {
      expect(mockGetCustomerInfo).toHaveBeenCalledTimes(1);
    });

    emitAuthStateChange(userB);

    await waitFor(() => {
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      foregroundRefresh.resolve(makeCustomerInfo(true));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isPremium).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('ignores stale customer info listener callbacks after the auth user changes', async () => {
    const userA = {
      uid: 'user-a',
      email: 'user-a@example.com',
      isAnonymous: false,
    };
    const userB = {
      uid: 'user-b',
      email: 'user-b@example.com',
      isAnonymous: false,
    };

    mockCurrentUser = userA;
    mockConfigureRevenueCat.mockResolvedValue(false);

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockAddCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    const staleListener = mockAddCustomerInfoUpdateListener.mock.calls[0]?.[0] as
      | ((customerInfo: ReturnType<typeof makeCustomerInfo>) => void)
      | undefined;

    if (!staleListener) {
      throw new Error('Expected a registered customer info listener for the initial user.');
    }

    emitAuthStateChange(userB);

    await waitFor(() => {
      expect(mockRemoveCustomerInfoUpdateListener).toHaveBeenCalledWith(staleListener);
      expect(mockAddCustomerInfoUpdateListener).toHaveBeenCalledTimes(2);
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      staleListener(makeCustomerInfo(true));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isPremium).toBe(false);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('does not leak cached premium across users when auth changes during startup', async () => {
    const userA = {
      uid: 'user-a',
      email: 'user-a@example.com',
      isAnonymous: false,
    };
    const userB = {
      uid: 'user-b',
      email: 'user-b@example.com',
      isAnonymous: false,
    };
    const userACache = createDeferred<string | null>();

    mockCurrentUser = userA;
    mockConfigureRevenueCat.mockResolvedValue(false);
    (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) => {
      if (key === `isPremium_${userA.uid}`) {
        return userACache.promise;
      }

      if (key === `isPremium_${userB.uid}`) {
        return Promise.resolve('false');
      }

      return Promise.resolve(null);
    });

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(AsyncStorage.getItem).toHaveBeenCalledWith(`isPremium_${userA.uid}`);
    });

    emitAuthStateChange(userB);

    await waitFor(() => {
      expect(AsyncStorage.getItem).toHaveBeenCalledWith(`isPremium_${userB.uid}`);
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      userACache.resolve('true');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isPremium).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('starts RevenueCat sync without waiting for createUserDocument to finish', async () => {
    const createUserDocumentDeferred = createDeferred<void>();

    mockCreateUserDocument.mockImplementation(() => createUserDocumentDeferred.promise);

    renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(mockCreateUserDocument).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'test-user-id' })
      );
      expect(mockConfigureRevenueCat).toHaveBeenCalled();
      expect(mockLogIn).toHaveBeenCalledWith('test-user-id');
    });

    await act(async () => {
      createUserDocumentDeferred.resolve(undefined);
      await Promise.resolve();
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

  it('rejects anonymous purchase attempts before RevenueCat flow starts', async () => {
    mockCurrentUser = {
      uid: 'anon-user',
      email: 'anon@example.com',
      isAnonymous: true,
    };

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

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
        message: 'Anonymous users cannot purchase premium.',
      })
    );
    expect(mockConfigureRevenueCat).not.toHaveBeenCalled();
    expect(mockPurchasePackage).not.toHaveBeenCalled();
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

  it('throws an auth-required error for anonymous restore attempts before RevenueCat flow starts', async () => {
    mockCurrentUser = {
      uid: 'anon-user',
      email: 'anon@example.com',
      isAnonymous: true,
    };

    const { result } = renderHook(() => usePremium(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

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
        code: 'AUTH_REQUIRED',
        message: 'AUTH_REQUIRED',
      })
    );
    expect(mockConfigureRevenueCat).not.toHaveBeenCalled();
    expect(mockRestorePurchases).not.toHaveBeenCalled();
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
