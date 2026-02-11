import { auth, db, functions } from '@/src/firebase/config';
import {
  getProductIdForPlan,
  getProductPriority,
  inferPurchaseType,
  isKnownPremiumProductId,
  LEGACY_LIFETIME_PRODUCT_ID,
  type PremiumPlan,
  SUBSCRIPTION_PRODUCT_ID_LIST,
  SUBSCRIPTION_PRODUCT_IDS as SUBSCRIPTION_ID_MAP,
} from '@/src/context/premiumBilling';
import i18n from '@/src/i18n';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import type { Product, ProductSubscription, Purchase } from 'react-native-iap';
import * as RNIap from 'react-native-iap';

const AVAILABLE_SUBSCRIPTION_PRODUCT_IDS = Platform.select({
  android: SUBSCRIPTION_PRODUCT_ID_LIST,
  default: [],
});

interface PremiumPrices {
  monthly: string | null;
  yearly: string | null;
}

interface PremiumState {
  isPremium: boolean;
  isLoading: boolean;
  purchasePremium: (plan: PremiumPlan) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  resetTestPurchase: () => Promise<void>;
  prices: PremiumPrices;
  checkPremiumFeature: (featureName: string) => boolean;
}

interface ValidationResponse {
  success: boolean;
  isPremium?: boolean;
  message?: string;
}

interface SyncPremiumStatusResponse {
  success: boolean;
  isPremium: boolean;
}

const getDisplayPrice = (product: Product | ProductSubscription | undefined): string | null => {
  if (!product) {
    return null;
  }

  if (product.platform === 'android' && product.type === 'subs') {
    const offerDetails = product.subscriptionOfferDetailsAndroid;
    if (Array.isArray(offerDetails) && offerDetails.length > 0) {
      const formattedPrice = offerDetails[0]?.pricingPhases?.pricingPhaseList?.[0]?.formattedPrice;
      if (formattedPrice) {
        return formattedPrice;
      }
    }
  }

  return product.displayPrice || null;
};

const isCancelledPurchaseError = (error: unknown): boolean => {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').toLowerCase();

  return (
    code === 'e_user_cancelled' ||
    code === 'user-cancelled' ||
    message === 'user canceled' ||
    message.includes('user cancelled')
  );
};

const isAlreadyOwnedError = (error: unknown): boolean => {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').toLowerCase();

  return code === 'e_already_owned' || code === 'already-owned' || message.includes('already own');
};

export const [PremiumProvider, usePremium] = createContextHook<PremiumState>(() => {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [prices, setPrices] = useState<PremiumPrices>({
    monthly: null,
    yearly: null,
  });
  const [user, setUser] = useState<User | null>(auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  const syncPremiumStatus = useCallback(async (): Promise<boolean> => {
    if (!user) {
      return false;
    }

    try {
      const syncPremiumStatusFn = httpsCallable(functions, 'syncPremiumStatus');
      const syncResult = await syncPremiumStatusFn();
      const data = syncResult.data as SyncPremiumStatusResponse;

      if (typeof data?.isPremium === 'boolean') {
        setIsPremium(data.isPremium);
        return data.isPremium;
      }

      return false;
    } catch (err) {
      console.error('Error syncing premium status:', err);
      return false;
    }
  }, [user]);

  // Process a purchase: validate with server and finish transaction
  const processPurchase = useCallback(
    async (purchase: Purchase, options?: { syncAfterSuccess?: boolean }): Promise<boolean> => {
      const syncAfterSuccess = options?.syncAfterSuccess ?? true;

      try {
        console.log('Processing purchase:', purchase.productId);

        if (!purchase.purchaseToken) {
          console.error('Purchase missing token', purchase);
          return false;
        }

        const validatePurchaseFn = httpsCallable(functions, 'validatePurchase');
        const validationResult = await validatePurchaseFn({
          purchaseToken: purchase.purchaseToken,
          productId: purchase.productId,
          purchaseType: inferPurchaseType(purchase.productId),
        });
        const data = validationResult.data as ValidationResponse;
        console.log('Validation response:', data);

        if (data?.success === true) {
          setIsPremium(data?.isPremium === true);
          try {
            // Acknowledge/finish transaction
            await RNIap.finishTransaction({
              purchase,
              isConsumable: false,
            });
            console.log('Transaction finished successfully');
          } catch (finishErr) {
            console.error('Error finishing transaction:', finishErr);
          }

          if (syncAfterSuccess) {
            await syncPremiumStatus();
          }

          return true;
        }

        console.error('Validation failed:', data);
        return false;
      } catch (err) {
        console.error('Error processing purchase:', err);
        return false;
      }
    },
    [syncPremiumStatus]
  );

  // Initialize IAP listeners
  useEffect(() => {
    let purchaseUpdateSubscription: { remove: () => void } | undefined;
    let purchaseErrorSubscription: { remove: () => void } | undefined;

    const initListeners = async () => {
      try {
        await RNIap.initConnection();

        // Listen for successful purchases
        purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(async (purchase: Purchase) => {
          console.log('Purchase Updated Listener triggered:', purchase);

          if (purchase.purchaseToken || (purchase as any).transactionReceipt) {
            console.log('Receipt/Token found, processing...');
            await processPurchase(purchase);
          } else {
            console.log('No transaction receipt/token in purchase object');
          }
        });

        // Listen for purchase errors
        purchaseErrorSubscription = RNIap.purchaseErrorListener((error: unknown) => {
          console.warn('Purchase notification error:', error);
          // We don't necessarily update state here as UI handles specific errors from requestPurchase
        });

        if (
          AVAILABLE_SUBSCRIPTION_PRODUCT_IDS &&
          AVAILABLE_SUBSCRIPTION_PRODUCT_IDS.length > 0
        ) {
          const products = await RNIap.fetchProducts({
            skus: AVAILABLE_SUBSCRIPTION_PRODUCT_IDS,
            type: 'subs',
          });

          if (products) {
            const monthlyProduct = products.find((p) => p.id === SUBSCRIPTION_ID_MAP.monthly);
            const yearlyProduct = products.find((p) => p.id === SUBSCRIPTION_ID_MAP.yearly);

            setPrices({
              monthly: getDisplayPrice(monthlyProduct),
              yearly: getDisplayPrice(yearlyProduct),
            });
          }
        }
      } catch (err) {
        console.warn('IAP initialization error:', err);
      }
    };

    initListeners();

    return () => {
      if (purchaseUpdateSubscription) {
        purchaseUpdateSubscription.remove();
      }
      if (purchaseErrorSubscription) {
        purchaseErrorSubscription.remove();
      }
      RNIap.endConnection();
    };
  }, [processPurchase]);

  // Listen to user's premium status in Firestore
  useEffect(() => {
    if (!user) {
      setIsPremium(false);
      setIsLoading(false);
      return;
    }

    const checkLocalCache = async () => {
      try {
        const cached = await AsyncStorage.getItem(`isPremium_${user.uid}`);
        if (cached === 'true') {
          setIsPremium(true);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('Failed to read premium cache:', err);
      }
    };

    checkLocalCache();

    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      async (docSync) => {
        const data = docSync.data();
        const premiumStatus = data?.premium?.isPremium === true;
        setIsPremium(premiumStatus);
        setIsLoading(false);

        // Update local cache
        try {
          await AsyncStorage.setItem(`isPremium_${user.uid}`, String(premiumStatus));
        } catch (err) {
          console.warn('Failed to write premium cache:', err);
        }
      },
      (err) => {
        console.error('Error fetching premium status:', err);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let isCancelled = false;

    const syncOnAppOpen = async () => {
      await syncPremiumStatus();

      if (isCancelled) {
        return;
      }
    };

    syncOnAppOpen();

    return () => {
      isCancelled = true;
    };
  }, [syncPremiumStatus, user]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      console.log('Starting restorePurchases...');
      const purchases = await RNIap.getAvailablePurchases();
      console.log('Available purchases found:', purchases.length);

      const knownPurchases = purchases
        .filter((purchase) => isKnownPremiumProductId(purchase.productId))
        .sort((a, b) => getProductPriority(a.productId) - getProductPriority(b.productId));

      if (knownPurchases.length === 0) {
        console.log('No known premium purchase found in history');
        await syncPremiumStatus();
        return false;
      }

      for (const purchase of knownPurchases) {
        const restored = await processPurchase(purchase, { syncAfterSuccess: false });

        if (restored) {
          await syncPremiumStatus();
          return true;
        }
      }

      await syncPremiumStatus();
      return false;
    } catch (err: any) {
      console.error('Restore error detail:', err);
      // Ensure we treat Cloud Function errors clearly
      if (
        err.code === 'functions/internal' ||
        err.code === 'functions/unknown' ||
        err.code === 'internal'
      ) {
        throw new Error('Cloud Function Error: ' + err.message + ' check Firebase console logs');
      }
      throw err;
    }
  }, [processPurchase, syncPremiumStatus]);

  const purchasePremium = useCallback(
    async (plan: PremiumPlan) => {
      try {
        if (Platform.OS !== 'android') {
          throw new Error('Subscriptions are only configured on Android right now.');
        }

        if (
          !AVAILABLE_SUBSCRIPTION_PRODUCT_IDS ||
          AVAILABLE_SUBSCRIPTION_PRODUCT_IDS.length === 0
        ) {
          throw new Error('No subscription products available');
        }

        const subscriptionProductId = getProductIdForPlan(plan);

        // Note: We rely on purchaseUpdatedListener for final validation and unlock.
        await RNIap.requestPurchase({
          type: 'subs',
          request: {
            android: {
              skus: [subscriptionProductId],
            },
          },
        });

        // We return true indicating the REQUEST was successful.
        // Actual success (premium unlock) happens asynchronously via listener.
        return true;
      } catch (err: any) {
        // User cancelled - silently return false without error
        if (isCancelledPurchaseError(err)) {
          return false;
        }

        // Already-owned subscription - attempt restore/sync
        if (isAlreadyOwnedError(err)) {
          try {
            console.log('User already owns a subscription, attempting restore...');
            const restored = await restorePurchases();
            if (!restored) {
              throw new Error('restorePurchases() returned false after already-owned error');
            }
            console.log('Restore successful after already-owned error');
            return true;
          } catch (restoreErr: any) {
            console.error('Failed to restore after already-owned:', restoreErr);
            throw new Error(
              'Restoration failed: ' + (restoreErr.message || JSON.stringify(restoreErr))
            );
          }
        }

        console.error('Purchase error:', err);
        throw err;
      }
    },
    [restorePurchases]
  );

  const resetTestPurchase = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const purchases = await RNIap.getAvailablePurchases();
        const legacyPurchase = purchases.find((p) => p.productId === LEGACY_LIFETIME_PRODUCT_ID);

        if (legacyPurchase && legacyPurchase.purchaseToken) {
          await RNIap.consumePurchaseAndroid(legacyPurchase.purchaseToken);
          setIsPremium(false);
          Alert.alert(i18n.t('premium.resetCompleteTitle'), i18n.t('premium.resetCompleteMessage'));
        } else {
          Alert.alert(
            i18n.t('premium.noPurchaseFoundTitle'),
            i18n.t('premium.noPurchaseFoundMessage')
          );
        }
      }
    } catch (err: any) {
      console.error('Reset error:', err);
      Alert.alert(i18n.t('premium.resetFailedTitle'), err.message);
    }
  }, []);

  return {
    isPremium,
    isLoading,
    purchasePremium,
    restorePurchases,
    resetTestPurchase,
    prices,
    checkPremiumFeature: (_featureName: string) => {
      // For now, all premium features require isPremium to be true
      // We can add more granular logic here later if needed
      return isPremium;
    },
  };
});
