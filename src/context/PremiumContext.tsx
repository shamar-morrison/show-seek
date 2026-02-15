import {
  getProductIdForPlan,
  SUBSCRIPTION_PRODUCT_IDS,
  type PremiumPlan,
} from '@/src/context/premiumBilling';
import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import { auth, db } from '@/src/firebase/config';
import { createUserDocument } from '@/src/firebase/user';
import i18n from '@/src/i18n';
import { auditedOnSnapshot } from '@/src/services/firestoreReadAudit';
import { configureRevenueCat } from '@/src/services/revenueCat';
import { getCachedUserDocument } from '@/src/services/UserDocumentCache';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

const PREMIUM_ENTITLEMENT_ID = 'premium';
const OFFERING_NAME = 'Premium';

interface PremiumPrices {
  monthly: string | null;
  yearly: string | null;
}

interface MonthlyTrialAvailability {
  isEligible: boolean;
  offerToken: string | null;
  reasonKey: string | null;
}

interface PremiumState {
  isPremium: boolean;
  isLoading: boolean;
  purchasePremium: (plan: PremiumPlan, options?: { useTrial?: boolean }) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  resetTestPurchase: () => Promise<void>;
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

const resolveOffering = (offeringData: {
  current: PurchasesOffering | null;
  all: Record<string, PurchasesOffering>;
}): PurchasesOffering | null => {
  if (offeringData.current) {
    return offeringData.current;
  }

  if (offeringData.all[OFFERING_NAME]) {
    return offeringData.all[OFFERING_NAME];
  }

  const allOfferings = Object.values(offeringData.all);
  return allOfferings.length > 0 ? allOfferings[0] : null;
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

  const monthly =
    offering.availablePackages.find(
      (pkg) => pkg.product.identifier === SUBSCRIPTION_PRODUCT_IDS.monthly
    ) ?? null;
  const yearly =
    offering.availablePackages.find(
      (pkg) => pkg.product.identifier === SUBSCRIPTION_PRODUCT_IDS.yearly
    ) ?? null;

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

  const [prices, setPrices] = useState<PremiumPrices>({
    monthly: null,
    yearly: null,
  });
  const [packagesByPlan, setPackagesByPlan] = useState<Record<PremiumPlan, PurchasesPackage | null>>(
    {
      monthly: null,
      yearly: null,
    }
  );

  const [user, setUser] = useState<User | null>(auth.currentUser);

  const applyCustomerInfo = useCallback(
    async (customerInfo: CustomerInfo, userId?: string) => {
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
    },
    []
  );

  const refreshOfferings = useCallback(async () => {
    const offerings = await Purchases.getOfferings();
    const resolvedOffering = resolveOffering(offerings);
    const nextPackages = resolvePackagesByPlan(resolvedOffering);

    setPackagesByPlan(nextPackages);
    setPrices({
      monthly: nextPackages.monthly?.product.priceString ?? null,
      yearly: nextPackages.yearly?.product.priceString ?? null,
    });
  }, []);

  const syncRevenueCatForUser = useCallback(
    async (nextUser: User) => {
      if (Platform.OS !== 'android') {
        setIsRevenueCatLoading(false);
        return;
      }

      setIsRevenueCatLoading(true);
      try {
        const configured = await configureRevenueCat();
        if (!configured) {
          return;
        }

        await Purchases.logIn(nextUser.uid);

        const [customerInfo] = await Promise.all([
          Purchases.getCustomerInfo(),
          refreshOfferings(),
        ]);

        await applyCustomerInfo(customerInfo, nextUser.uid);
      } catch (err) {
        console.error('RevenueCat sync failed:', err);
      } finally {
        setIsRevenueCatLoading(false);
      }
    },
    [applyCustomerInfo, refreshOfferings]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (newUser) => {
      setUser(newUser);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setIsPremiumFromRevenueCat(false);
      setHasUsedTrialFromRevenueCat(false);
      setIsRevenueCatLoading(false);
      setPrices({ monthly: null, yearly: null });
      setPackagesByPlan({ monthly: null, yearly: null });

      if (Platform.OS === 'android') {
        void Purchases.logOut().catch(() => {
          // Ignore logOut failures when SDK is not configured yet.
        });
      }
      return;
    }

    let isCancelled = false;

    const initializeForUser = async () => {
      await createUserDocument(user);
      await syncRevenueCatForUser(user);
      if (isCancelled) {
        return;
      }
    };

    void initializeForUser();

    return () => {
      isCancelled = true;
    };
  }, [syncRevenueCatForUser, user]);

  useEffect(() => {
    if (!user || Platform.OS !== 'android') {
      return;
    }

    const listener = (customerInfo: CustomerInfo) => {
      void applyCustomerInfo(customerInfo, user.uid);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [applyCustomerInfo, user]);

  useEffect(() => {
    if (!user?.uid || Platform.OS !== 'android') {
      return;
    }

    const appStateSubscription = AppState?.addEventListener?.('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      void Purchases.getCustomerInfo()
        .then((customerInfo) => applyCustomerInfo(customerInfo, user.uid))
        .catch((err) => {
          console.warn('Failed to refresh customer info on foreground:', err);
        });
    });

    return () => {
      appStateSubscription?.remove?.();
    };
  }, [applyCustomerInfo, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setIsPremiumFromFirestore(false);
      setHasUsedTrialFromFirestore(false);
      setIsFirestoreLoading(false);
      return;
    }

    const userId = user.uid;

    if (READ_OPTIMIZATION_FLAGS.enablePremiumRealtimeListener) {
      setIsFirestoreLoading(true);

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
          const hasTrialHistory =
            premiumData?.hasUsedTrial === true ||
            premiumData?.trialConsumedAt != null ||
            premiumData?.trialStartAt != null;

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

    const refreshPremiumFromFirestore = async (forceRefresh = false) => {
      if (isCancelled) {
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

        if (!userData) {
          setIsFirestoreLoading(false);
          return;
        }

        const premiumData = userData.premium as Record<string, unknown> | undefined;
        const premiumStatus = premiumData?.isPremium === true;
        const hasTrialHistory =
          premiumData?.hasUsedTrial === true ||
          premiumData?.trialConsumedAt != null ||
          premiumData?.trialStartAt != null;

        setIsPremiumFromFirestore(premiumStatus);
        setHasUsedTrialFromFirestore(hasTrialHistory);
        setIsFirestoreLoading(false);

        try {
          await AsyncStorage.setItem(`isPremium_${userId}`, String(premiumStatus));
        } catch (cacheError) {
          console.warn('Failed to write premium cache:', cacheError);
        }
      } catch (err) {
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
  }, [user?.uid]);

  const purchasePremium = useCallback(
    async (plan: PremiumPlan): Promise<boolean> => {
      if (Platform.OS !== 'android') {
        throw new Error('Subscriptions are only configured on Android right now.');
      }

      if (!user) {
        throw new Error('User must be signed in to purchase premium.');
      }

      try {
        const configured = await configureRevenueCat();
        if (!configured) {
          throw new Error('RevenueCat SDK key is missing.');
        }

        let selectedPackage = packagesByPlan[plan];
        if (!selectedPackage) {
          await refreshOfferings();
          const refreshedProductId = getProductIdForPlan(plan);
          const refreshedOfferings = await Purchases.getOfferings();
          const resolvedOffering = resolveOffering(refreshedOfferings);
          selectedPackage =
            resolvedOffering?.availablePackages.find(
              (pkg) => pkg.product.identifier === refreshedProductId
            ) ?? null;
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
      return false;
    }

    const configured = await configureRevenueCat();
    if (!configured) {
      return false;
    }

    const customerInfo = await Purchases.restorePurchases();
    await applyCustomerInfo(customerInfo, user.uid);

    return customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] != null;
  }, [applyCustomerInfo, user]);

  const resetTestPurchase = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      const configured = await configureRevenueCat();
      if (!configured) {
        throw new Error('RevenueCat SDK key is missing.');
      }

      const customerInfo = await Purchases.getCustomerInfo();
      if (customerInfo.managementURL) {
        await Linking.openURL(customerInfo.managementURL);
        return;
      }

      Alert.alert(
        i18n.t('premium.noPurchaseFoundTitle'),
        i18n.t('premium.noPurchaseFoundMessage')
      );
    } catch (err: any) {
      console.error('Reset error:', err);
      Alert.alert(i18n.t('premium.resetFailedTitle'), err.message || i18n.t('errors.generic'));
    }
  }, []);

  const isPremium = isPremiumFromRevenueCat || isPremiumFromFirestore;
  const hasUsedTrial = hasUsedTrialFromRevenueCat || hasUsedTrialFromFirestore;
  const isLoading = user
    ? isRevenueCatLoading && isFirestoreLoading
    : isRevenueCatLoading || isFirestoreLoading;

  const monthlyTrial = useMemo<MonthlyTrialAvailability>(() => {
    if (hasUsedTrial) {
      return {
        isEligible: false,
        offerToken: null,
        reasonKey: 'premium.freeTrialUsedMessage',
      };
    }

    return {
      isEligible: false,
      offerToken: null,
      reasonKey: null,
    };
  }, [hasUsedTrial]);

  return {
    isPremium,
    isLoading,
    purchasePremium,
    restorePurchases,
    resetTestPurchase,
    prices,
    monthlyTrial,
    checkPremiumFeature: (_featureName: string) => isPremium,
  };
});
