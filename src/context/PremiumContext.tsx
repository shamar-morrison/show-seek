import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import {
  createPremiumAuthRequiredError,
  getProductIdForPlan,
  SUBSCRIPTION_PRODUCT_IDS,
  type PremiumPlan,
} from '@/src/context/premiumBilling';
import { auth, db } from '@/src/firebase/config';
import { createUserDocument } from '@/src/firebase/user';
import { auditedOnSnapshot } from '@/src/services/firestoreReadAudit';
import { configureRevenueCat } from '@/src/services/revenueCat';
import { getCachedUserDocument } from '@/src/services/UserDocumentCache';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

const PREMIUM_ENTITLEMENT_ID = 'premium';
const OFFERING_NAME = 'Premium';
const EMPTY_PRICES: PremiumPrices = {
  monthly: null,
  yearly: null,
};
const EMPTY_PACKAGES_BY_PLAN: PackagesByPlan = {
  monthly: null,
  yearly: null,
};

interface PremiumPrices {
  monthly: string | null;
  yearly: string | null;
}

interface MonthlyTrialAvailability {
  isEligible: boolean;
  offerToken: string | null;
  reasonKey: string | null;
}

type PackagesByPlan = Record<PremiumPlan, PurchasesPackage | null>;

interface PremiumState {
  isPremium: boolean;
  isLoading: boolean;
  purchasePremium: (plan: PremiumPlan, options?: { useTrial?: boolean }) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  prices: PremiumPrices;
  monthlyTrial: MonthlyTrialAvailability;
  checkPremiumFeature: (featureName: string) => boolean;
}

const resolveHasTrialHistory = (customerInfo: CustomerInfo): boolean => {
  const entitlement = customerInfo.entitlements.all[PREMIUM_ENTITLEMENT_ID];
  if (entitlement?.periodType === 'TRIAL') {
    return true;
  }

  const subscriptions = Object.values(customerInfo.subscriptionsByProductIdentifier ?? {});
  return subscriptions.some((subscription) => subscription.periodType === 'TRIAL');
};

const resolveFirestoreTrialHistory = (premiumData?: Record<string, unknown>): boolean =>
  premiumData?.hasUsedTrial === true ||
  premiumData?.trialConsumedAt != null ||
  premiumData?.trialStartAt != null;

const resolveOffering = (offeringData: {
  current: PurchasesOffering | null;
  all: Record<string, PurchasesOffering>;
}): PurchasesOffering | null => {
  return offeringData.all[OFFERING_NAME] ?? null;
};

const normalizeStoreProductId = (productId?: string | null): string =>
  String(productId ?? '')
    .split(':')[0]
    .trim();

const findPackageByProductId = (
  packages: PurchasesPackage[],
  expectedProductId: string
): PurchasesPackage | null => {
  const normalizedExpectedProductId = normalizeStoreProductId(expectedProductId);
  return (
    packages.find((pkg) => {
      const packageProductId = pkg.product.identifier;
      return (
        packageProductId === expectedProductId ||
        normalizeStoreProductId(packageProductId) === normalizedExpectedProductId
      );
    }) ?? null
  );
};

const logOfferingsDebug = (
  offerings: {
    current: PurchasesOffering | null;
    all: Record<string, PurchasesOffering>;
  },
  context: string
): void => {
  const premiumOffering = offerings.all[OFFERING_NAME] ?? null;
  const packageSummaries = (premiumOffering?.availablePackages ?? []).map((pkg) => ({
    identifier: pkg.identifier,
    normalizedProductId: normalizeStoreProductId(pkg.product.identifier),
    productId: pkg.product.identifier,
    productType: (pkg.product as { productType?: unknown }).productType ?? null,
  }));
};

const resolvePackagesByPlan = (
  offering: PurchasesOffering | null
): Record<PremiumPlan, PurchasesPackage | null> => {
  if (!offering) {
    return {
      monthly: null,
      yearly: null,
    };
  }

  const monthly = findPackageByProductId(
    offering.availablePackages,
    SUBSCRIPTION_PRODUCT_IDS.monthly
  );
  const yearly = findPackageByProductId(
    offering.availablePackages,
    SUBSCRIPTION_PRODUCT_IDS.yearly
  );

  return {
    monthly,
    yearly,
  };
};

export const [PremiumProvider, usePremium] = createContextHook<PremiumState>(() => {
  const [isPremiumFromRevenueCat, setIsPremiumFromRevenueCat] = useState(false);
  const [hasUsedTrialFromRevenueCat, setHasUsedTrialFromRevenueCat] = useState(false);
  const [isRevenueCatLoading, setIsRevenueCatLoading] = useState(Platform.OS === 'android');

  const [isPremiumFromFirestore, setIsPremiumFromFirestore] = useState(false);
  const [hasUsedTrialFromFirestore, setHasUsedTrialFromFirestore] = useState(false);
  const [isFirestoreLoading, setIsFirestoreLoading] = useState(true);
  const [cachedPremiumStatus, setCachedPremiumStatus] = useState<boolean | null>(null);
  const [isCachedPremiumLoading, setIsCachedPremiumLoading] = useState(false);

  const [prices, setPrices] = useState<PremiumPrices>({
    ...EMPTY_PRICES,
  });
  const [packagesByPlan, setPackagesByPlan] = useState<
    Record<PremiumPlan, PurchasesPackage | null>
  >(EMPTY_PACKAGES_BY_PLAN);

  const [user, setUser] = useState<User | null>(auth.currentUser);
  const latestUserRef = useRef<User | null>(auth.currentUser);

  useEffect(() => {
    latestUserRef.current = user;
  }, [user]);

  const isExpectedAuthenticatedUser = useCallback((expectedUserId: string): boolean => {
    const liveUser = latestUserRef.current;
    return liveUser != null && !liveUser.isAnonymous && liveUser.uid === expectedUserId;
  }, []);

  const resetPremiumStateForUser = useCallback((nextUser: User | null) => {
    const isAuthenticatedUser = nextUser != null && !nextUser.isAnonymous;

    setIsPremiumFromRevenueCat(false);
    setHasUsedTrialFromRevenueCat(false);
    setIsRevenueCatLoading(isAuthenticatedUser && Platform.OS === 'android');
    setIsPremiumFromFirestore(false);
    setHasUsedTrialFromFirestore(false);
    setIsFirestoreLoading(isAuthenticatedUser);
    setCachedPremiumStatus(null);
    setIsCachedPremiumLoading(isAuthenticatedUser);
    setPrices(EMPTY_PRICES);
    setPackagesByPlan(EMPTY_PACKAGES_BY_PLAN);
  }, []);

  const applyCustomerInfo = useCallback(async (customerInfo: CustomerInfo, userId?: string) => {
    const isPremium = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] != null;
    const hasTrialHistory = resolveHasTrialHistory(customerInfo);

    setIsPremiumFromRevenueCat(isPremium);
    setHasUsedTrialFromRevenueCat(hasTrialHistory);

    if (userId) {
      try {
        await AsyncStorage.setItem(`isPremium_${userId}`, String(isPremium));
      } catch (err) {
        console.warn('Failed to write premium cache:', err);
      }
    }
  }, []);

  const applyOfferingsState = useCallback(
    (
      offerings: {
        current: PurchasesOffering | null;
        all: Record<string, PurchasesOffering>;
      },
      context: string
    ): PackagesByPlan => {
      logOfferingsDebug(offerings, `${context}:before-resolve`);

      const resolvedOffering = resolveOffering(offerings);
      if (!resolvedOffering) {
        const clearedPackages = {
          monthly: null,
          yearly: null,
        };
        setPackagesByPlan(clearedPackages);
        setPrices({
          monthly: null,
          yearly: null,
        });

        console.error(`RevenueCat offering "${OFFERING_NAME}" not found. Available offerings:`, {
          availableOfferingKeys: Object.keys(offerings.all),
        });
        throw new Error(`RevenueCat offering "${OFFERING_NAME}" not found`);
      }

      const nextPackages = resolvePackagesByPlan(resolvedOffering);
      setPackagesByPlan(nextPackages);
      setPrices({
        monthly: nextPackages.monthly?.product.priceString ?? null,
        yearly: nextPackages.yearly?.product.priceString ?? null,
      });
      return nextPackages;
    },
    []
  );

  const refreshOfferings = useCallback(
    async (context = 'refreshOfferings', shouldApplyState?: () => boolean): Promise<PackagesByPlan> => {
      const offerings = await Purchases.getOfferings();
      if (shouldApplyState && !shouldApplyState()) {
        return {
          monthly: null,
          yearly: null,
        };
      }
      return applyOfferingsState(offerings, context);
    },
    [applyOfferingsState]
  );

  const syncRevenueCatForUser = useCallback(
    async (nextUser: User, shouldApplyState: () => boolean = () => true) => {
      if (Platform.OS !== 'android') {
        if (shouldApplyState()) {
          setIsRevenueCatLoading(false);
        }
        return;
      }

      if (!shouldApplyState()) {
        return;
      }

      setIsRevenueCatLoading(true);
      try {
        const configured = await configureRevenueCat();
        if (!shouldApplyState()) {
          return;
        }
        if (!configured) {
          return;
        }

        await Purchases.logIn(nextUser.uid);
        if (!shouldApplyState()) {
          return;
        }

        const customerInfo = await Purchases.getCustomerInfo();
        if (!shouldApplyState()) {
          return;
        }
        await applyCustomerInfo(customerInfo, nextUser.uid);
        if (!shouldApplyState()) {
          return;
        }

        try {
          await refreshOfferings('syncRevenueCatForUser', shouldApplyState);
        } catch (offeringsError) {}
      } catch (err) {
        console.error('RevenueCat sync failed:', err);
      } finally {
        if (shouldApplyState()) {
          setIsRevenueCatLoading(false);
        }
      }
    },
    [applyCustomerInfo, refreshOfferings]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (newUser) => {
      resetPremiumStateForUser(newUser);
      latestUserRef.current = newUser;
      setUser(newUser);
    });

    return () => unsubscribe();
  }, [resetPremiumStateForUser]);

  useEffect(() => {
    if (!user || user.isAnonymous) {
      resetPremiumStateForUser(null);

      if (Platform.OS === 'android') {
        void Purchases.logOut().catch(() => {
          // Ignore logOut failures when SDK is not configured yet.
        });
      }
      return;
    }

    let isCancelled = false;
    const currentUserId = user.uid;
    const shouldApplyForCurrentUser = () =>
      !isCancelled && isExpectedAuthenticatedUser(currentUserId);

    resetPremiumStateForUser(user);

    void AsyncStorage.getItem(`isPremium_${currentUserId}`)
      .then((storedValue) => {
        if (!shouldApplyForCurrentUser()) {
          return;
        }

        if (storedValue === 'true') {
          setCachedPremiumStatus(true);
          return;
        }

        if (storedValue === 'false') {
          setCachedPremiumStatus(false);
          return;
        }

        setCachedPremiumStatus(null);
      })
      .catch((error) => {
        if (!shouldApplyForCurrentUser()) {
          return;
        }
        console.warn('[PremiumContext] Failed to read premium cache:', error);
      })
      .finally(() => {
        if (shouldApplyForCurrentUser()) {
          setIsCachedPremiumLoading(false);
        }
      });

    void createUserDocument(user);
    void syncRevenueCatForUser(user, shouldApplyForCurrentUser);

    return () => {
      isCancelled = true;
    };
  }, [isExpectedAuthenticatedUser, resetPremiumStateForUser, syncRevenueCatForUser, user]);

  useEffect(() => {
    if (!user || user.isAnonymous || Platform.OS !== 'android' || isRevenueCatLoading) {
      return;
    }

    const listener = (customerInfo: CustomerInfo) => {
      void applyCustomerInfo(customerInfo, user.uid);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [applyCustomerInfo, isRevenueCatLoading, user]);

  useEffect(() => {
    if (!user?.uid || user.isAnonymous || Platform.OS !== 'android' || isRevenueCatLoading) {
      return;
    }

    const refreshCustomerInfoOnForeground = async (nextState: AppStateStatus): Promise<void> => {
      if (nextState !== 'active') {
        return;
      }

      const capturedUid = user.uid;

      try {
        const customerInfo = await Purchases.getCustomerInfo();
        if (!isExpectedAuthenticatedUser(capturedUid)) {
          return;
        }

        await applyCustomerInfo(customerInfo, capturedUid);
      } catch (err) {
        if (!isExpectedAuthenticatedUser(capturedUid)) {
          return;
        }

        console.warn('Failed to refresh customer info on foreground:', err);
      }
    };

    const appStateSubscription = AppState?.addEventListener?.('change', (nextState) => {
      void refreshCustomerInfoOnForeground(nextState);
    });

    return () => {
      appStateSubscription?.remove?.();
    };
  }, [applyCustomerInfo, isExpectedAuthenticatedUser, isRevenueCatLoading, user?.isAnonymous, user?.uid]);

  useEffect(() => {
    if (!user?.uid || user.isAnonymous) {
      setIsPremiumFromFirestore(false);
      setHasUsedTrialFromFirestore(false);
      setIsFirestoreLoading(false);
      return;
    }

    const userId = user.uid;
    setIsPremiumFromFirestore(false);
    setHasUsedTrialFromFirestore(false);
    setIsFirestoreLoading(true);

    if (READ_OPTIMIZATION_FLAGS.enablePremiumRealtimeListener) {
      const unsubscribe = auditedOnSnapshot(
        doc(db, 'users', userId),
        async (snapshot) => {
          if (!snapshot.exists()) {
            setIsPremiumFromFirestore(false);
            setHasUsedTrialFromFirestore(false);
            setIsFirestoreLoading(false);
            return;
          }

          const data = snapshot.data() as Record<string, unknown> | undefined;
          const premiumData = data?.premium as Record<string, unknown> | undefined;
          const premiumStatus = premiumData?.isPremium === true;
          const hasTrialHistory = resolveFirestoreTrialHistory(premiumData);

          setIsPremiumFromFirestore(premiumStatus);
          setHasUsedTrialFromFirestore(hasTrialHistory);
          setIsFirestoreLoading(false);

          try {
            await AsyncStorage.setItem(`isPremium_${userId}`, String(premiumStatus));
          } catch (cacheError) {
            console.warn('[PremiumContext] Cache write failed:', cacheError);
          }
        },
        (error) => {
          console.error('[PremiumContext] Premium listener error:', error);
          setIsPremiumFromFirestore(false);
          setHasUsedTrialFromFirestore(false);
          setIsFirestoreLoading(false);
        },
        {
          path: `users/${userId}`,
          queryKey: 'premium-status',
          callsite: 'PremiumContext.premiumListener',
        }
      );

      return () => unsubscribe();
    }

    let isCancelled = false;
    let lastForegroundRefresh = 0;
    const FOREGROUND_REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
    const shouldApplyForCurrentUser = () => !isCancelled && isExpectedAuthenticatedUser(userId);

    const refreshPremiumFromFirestore = async (forceRefresh = false) => {
      if (!shouldApplyForCurrentUser()) {
        return;
      }

      const now = Date.now();
      if (!forceRefresh && now - lastForegroundRefresh < FOREGROUND_REFRESH_COOLDOWN_MS) {
        return;
      }
      lastForegroundRefresh = now;

      try {
        const userData = await getCachedUserDocument(userId, {
          forceRefresh,
          callsite: 'PremiumContext.refreshPremiumFromFirestore',
        });

        if (!shouldApplyForCurrentUser()) {
          return;
        }

        if (!userData) {
          setIsFirestoreLoading(false);
          return;
        }

        const premiumData = userData.premium as Record<string, unknown> | undefined;
        const premiumStatus = premiumData?.isPremium === true;
        const hasTrialHistory = resolveFirestoreTrialHistory(premiumData);

        setIsPremiumFromFirestore(premiumStatus);
        setHasUsedTrialFromFirestore(hasTrialHistory);
        setIsFirestoreLoading(false);

        try {
          await AsyncStorage.setItem(`isPremium_${userId}`, String(premiumStatus));
        } catch (cacheError) {
          console.warn('Failed to write premium cache:', cacheError);
        }
      } catch (err) {
        if (!shouldApplyForCurrentUser()) {
          return;
        }
        console.error('Error fetching premium status:', err);
        setIsFirestoreLoading(false);
      }
    };

    void refreshPremiumFromFirestore(true);

    const appStateSubscription = AppState?.addEventListener?.('change', (nextState) => {
      if (nextState === 'active') {
        void refreshPremiumFromFirestore();
      }
    });

    return () => {
      isCancelled = true;
      appStateSubscription?.remove?.();
    };
  }, [isExpectedAuthenticatedUser, user?.isAnonymous, user?.uid]);

  const purchasePremium = useCallback(
    async (plan: PremiumPlan): Promise<boolean> => {
      if (Platform.OS !== 'android') {
        throw new Error('Subscriptions are only configured on Android right now.');
      }

      if (!user) {
        throw new Error('User must be signed in to purchase premium.');
      }

      if (user.isAnonymous) {
        throw new Error('Anonymous users cannot purchase premium.');
      }

      try {
        const configured = await configureRevenueCat();
        if (!configured) {
          throw new Error('RevenueCat SDK key is missing.');
        }

        const requestedProductId = getProductIdForPlan(plan);
        let selectedPackage = packagesByPlan[plan];
        if (!selectedPackage) {
          const refreshedPackagesByPlan = await refreshOfferings('purchasePremium:fallback');
          selectedPackage = refreshedPackagesByPlan[plan];
        }

        if (!selectedPackage) {
          throw new Error('No subscription package available for selected plan.');
        }

        const { customerInfo } = await Purchases.purchasePackage(selectedPackage);
        await applyCustomerInfo(customerInfo, user.uid);

        return customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] != null;
      } catch (err: unknown) {
        const purchaseError = err as { code?: string; userCancelled?: boolean };
        if (
          purchaseError.userCancelled === true ||
          purchaseError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
        ) {
          return false;
        }

        throw err;
      }
    },
    [applyCustomerInfo, packagesByPlan, refreshOfferings, user]
  );

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return false;
    }

    if (!user) {
      throw createPremiumAuthRequiredError();
    }

    if (user.isAnonymous) {
      throw createPremiumAuthRequiredError();
    }

    const configured = await configureRevenueCat();
    if (!configured) {
      return false;
    }

    try {
      const customerInfo = await Purchases.restorePurchases();
      await applyCustomerInfo(customerInfo, user.uid);
      const hasRevenueCatPremium = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] != null;
      return hasRevenueCatPremium;
    } catch (error) {
      console.error('[PremiumContext] Restore failed:', error);
      throw error;
    }
  }, [applyCustomerInfo, user]);

  const livePremium = isPremiumFromRevenueCat || isPremiumFromFirestore;
  const isPremium =
    livePremium ||
    (cachedPremiumStatus === true &&
      (isRevenueCatLoading || isFirestoreLoading || isCachedPremiumLoading));
  const hasUsedTrial = hasUsedTrialFromRevenueCat || hasUsedTrialFromFirestore;
  const isLoading = isRevenueCatLoading || isFirestoreLoading || isCachedPremiumLoading;

  const monthlyTrial = useMemo<MonthlyTrialAvailability>(() => {
    const monthlyPackage = packagesByPlan.monthly;
    const hasMonthlyIntroOffer = monthlyPackage?.product.introPrice != null;

    if (hasUsedTrial) {
      return {
        isEligible: false,
        offerToken: null,
        reasonKey: 'premium.freeTrialUsedMessage',
      };
    }

    if (!hasMonthlyIntroOffer) {
      return {
        isEligible: false,
        offerToken: null,
        reasonKey: 'premium.freeTrialUnavailableMessage',
      };
    }

    return {
      isEligible: true,
      offerToken: null,
      reasonKey: null,
    };
  }, [hasUsedTrial, packagesByPlan.monthly]);

  return {
    isPremium,
    isLoading,
    purchasePremium,
    restorePurchases,
    prices,
    monthlyTrial,
    checkPremiumFeature: (_featureName: string) => isPremium,
  };
});
