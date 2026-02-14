import {
  getDisplayPriceForSubscriptionProduct,
  getProductIdForPlan,
  inferPurchaseType,
  isKnownPremiumProductId,
  LEGACY_LIFETIME_PRODUCT_ID,
  resolveMonthlyStandardOffer,
  resolveMonthlyTrialOffer,
  shouldTreatRestoreAsSuccess,
  sortPurchasesByPremiumPriority,
  SUBSCRIPTION_PRODUCT_IDS as SUBSCRIPTION_ID_MAP,
  SUBSCRIPTION_PRODUCT_ID_LIST,
  type PremiumPlan,
} from '@/src/context/premiumBilling';
import { auth, db, functions } from '@/src/firebase/config';
import i18n from '@/src/i18n';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';
import type { Purchase } from 'react-native-iap';
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
  purchasePremium: (plan: PremiumPlan, options?: { useTrial?: boolean }) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  resetTestPurchase: () => Promise<void>;
  prices: PremiumPrices;
  monthlyTrial: MonthlyTrialAvailability;
  checkPremiumFeature: (featureName: string) => boolean;
}

interface MonthlyTrialAvailability {
  isEligible: boolean;
  offerToken: string | null;
  reasonKey: string | null;
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

interface ProcessPurchaseResult {
  isPremium: boolean;
  validationSucceeded: boolean;
}

const TRIAL_INELIGIBLE_ERROR_CODE = 'TRIAL_INELIGIBLE';
const TRIAL_UNAVAILABLE_REASON_KEY = 'premium.freeTrialUnavailableMessage';
const TRIAL_USED_REASON_KEY = 'premium.freeTrialUsedMessage';
const TRIAL_ALREADY_USED_REASON = 'TRIAL_ALREADY_USED';

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

const isTrialIneligiblePurchaseError = (error: unknown): boolean => {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').toLowerCase();

  if (code === 'e_item_unavailable' || code === 'item_unavailable') {
    return true;
  }

  return (
    (message.includes('trial') &&
      (message.includes('ineligible') ||
        message.includes('not eligible') ||
        message.includes('unavailable'))) ||
    (message.includes('offer') &&
      (message.includes('token') ||
        message.includes('ineligible') ||
        message.includes('not eligible')))
  );
};

const isTrialAlreadyUsedValidationError = (error: unknown): boolean => {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  const details = (error as { details?: { code?: string; reason?: string } })?.details;
  const reason = String(details?.reason || details?.code || '').toUpperCase();

  if (reason === TRIAL_ALREADY_USED_REASON) {
    return true;
  }

  return code === 'functions/failed-precondition' && message.includes('trial');
};

const createTrialIneligibleError = (
  cause: unknown,
  messageKey = 'premium.freeTrialRejectedMessage'
): Error => {
  const trialError = new Error(i18n.t(messageKey)) as Error & {
    cause?: unknown;
    code?: string;
    reasonKey?: string;
  };
  trialError.code = TRIAL_INELIGIBLE_ERROR_CODE;
  trialError.cause = cause;
  trialError.reasonKey = messageKey;
  return trialError;
};

export const [PremiumProvider, usePremium] = createContextHook<PremiumState>(() => {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [prices, setPrices] = useState<PremiumPrices>({
    monthly: null,
    yearly: null,
  });
  const [playMonthlyTrial, setPlayMonthlyTrial] = useState<MonthlyTrialAvailability>({
    isEligible: false,
    offerToken: null,
    reasonKey: null,
  });
  const [monthlyStandardOfferToken, setMonthlyStandardOfferToken] = useState<string | null>(null);
  const [hasUsedTrial, setHasUsedTrial] = useState(false);
  const [user, setUser] = useState<User | null>(auth.currentUser);

  const monthlyTrial = useMemo<MonthlyTrialAvailability>(() => {
    if (hasUsedTrial) {
      return {
        isEligible: false,
        offerToken: null,
        reasonKey: TRIAL_USED_REASON_KEY,
      };
    }

    if (playMonthlyTrial.isEligible) {
      return {
        isEligible: true,
        offerToken: playMonthlyTrial.offerToken,
        reasonKey: null,
      };
    }

    return {
      isEligible: false,
      offerToken: null,
      reasonKey: playMonthlyTrial.reasonKey ?? TRIAL_UNAVAILABLE_REASON_KEY,
    };
  }, [hasUsedTrial, playMonthlyTrial]);

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
    async (
      purchase: Purchase,
      options?: { syncAfterSuccess?: boolean }
    ): Promise<ProcessPurchaseResult> => {
      const syncAfterSuccess = options?.syncAfterSuccess ?? true;

      try {
        console.log('Processing purchase:', purchase.productId);

        if (!purchase.purchaseToken) {
          console.error('Purchase missing token', purchase);
          return {
            isPremium: false,
            validationSucceeded: false,
          };
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
          const isPremiumValidation = data?.isPremium === true;
          setIsPremium(isPremiumValidation);
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

          return {
            isPremium: isPremiumValidation,
            validationSucceeded: true,
          };
        }

        console.error('Validation failed:', data);
        return {
          isPremium: false,
          validationSucceeded: false,
        };
      } catch (err) {
        if (isTrialAlreadyUsedValidationError(err)) {
          setHasUsedTrial(true);
        }

        console.error('Error processing purchase:', err);
        return {
          isPremium: false,
          validationSucceeded: false,
        };
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

        if (AVAILABLE_SUBSCRIPTION_PRODUCT_IDS && AVAILABLE_SUBSCRIPTION_PRODUCT_IDS.length > 0) {
          const products = await RNIap.fetchProducts({
            skus: AVAILABLE_SUBSCRIPTION_PRODUCT_IDS,
            type: 'subs',
          });

          if (products) {
            const monthlyProduct = products.find((p) => p.id === SUBSCRIPTION_ID_MAP.monthly) as
              | RNIap.ProductSubscriptionAndroid
              | undefined;
            const yearlyProduct = products.find((p) => p.id === SUBSCRIPTION_ID_MAP.yearly) as
              | RNIap.ProductSubscriptionAndroid
              | undefined;
            const monthlyTrialOffer = resolveMonthlyTrialOffer(
              monthlyProduct?.subscriptionOfferDetailsAndroid
            );
            const monthlyStandardOffer = resolveMonthlyStandardOffer(
              monthlyProduct?.subscriptionOfferDetailsAndroid
            );

            setPrices({
              monthly: getDisplayPriceForSubscriptionProduct(monthlyProduct),
              yearly: getDisplayPriceForSubscriptionProduct(yearlyProduct),
            });

            setPlayMonthlyTrial({
              isEligible: monthlyTrialOffer.isEligible,
              offerToken: monthlyTrialOffer.offerToken,
              reasonKey: monthlyTrialOffer.isEligible ? null : TRIAL_UNAVAILABLE_REASON_KEY,
            });
            setMonthlyStandardOfferToken(monthlyStandardOffer.offerToken);
          }
        }
      } catch (err) {
        console.warn('IAP initialization error:', err);
        setPlayMonthlyTrial({
          isEligible: false,
          offerToken: null,
          reasonKey: TRIAL_UNAVAILABLE_REASON_KEY,
        });
        setMonthlyStandardOfferToken(null);
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
      setHasUsedTrial(false);
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
        const premiumData = data?.premium;
        const premiumStatus = premiumData?.isPremium === true;
        const hasTrialHistory =
          premiumData?.hasUsedTrial === true ||
          premiumData?.trialConsumedAt != null ||
          premiumData?.trialStartAt != null;
        setIsPremium(premiumStatus);
        setHasUsedTrial(hasTrialHistory);
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

      const knownPurchases = sortPurchasesByPremiumPriority(
        purchases.filter((purchase) => isKnownPremiumProductId(purchase.productId))
      );

      if (knownPurchases.length === 0) {
        console.log('No known premium purchase found in history');
        await syncPremiumStatus();
        return false;
      }

      for (const purchase of knownPurchases) {
        const restoreResult = await processPurchase(purchase, { syncAfterSuccess: false });

        if (shouldTreatRestoreAsSuccess(restoreResult)) {
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
    async (plan: PremiumPlan, options?: { useTrial?: boolean }) => {
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
        const shouldUseTrial = plan === 'monthly' && options?.useTrial === true;
        const shouldUseStandardMonthlyOffer = plan === 'monthly' && !shouldUseTrial;

        if (shouldUseTrial && hasUsedTrial) {
          throw createTrialIneligibleError(
            new Error('Monthly trial already used for this account.'),
            TRIAL_USED_REASON_KEY
          );
        }

        if (shouldUseTrial && !monthlyTrial.offerToken) {
          setPlayMonthlyTrial({
            isEligible: false,
            offerToken: null,
            reasonKey: TRIAL_UNAVAILABLE_REASON_KEY,
          });
          throw createTrialIneligibleError(
            new Error('Monthly trial offer token is unavailable for this account.'),
            TRIAL_UNAVAILABLE_REASON_KEY
          );
        }

        const androidPurchaseRequest: RNIap.RequestSubscriptionAndroidProps = {
          skus: [subscriptionProductId],
        };

        if (shouldUseTrial && monthlyTrial.offerToken) {
          androidPurchaseRequest.subscriptionOffers = [
            {
              sku: subscriptionProductId,
              offerToken: monthlyTrial.offerToken,
            },
          ];
        } else if (shouldUseStandardMonthlyOffer) {
          if (monthlyStandardOfferToken) {
            androidPurchaseRequest.subscriptionOffers = [
              {
                sku: subscriptionProductId,
                offerToken: monthlyStandardOfferToken,
              },
            ];
          } else {
            console.warn(
              'No standard monthly offer token found; falling back to skus-only monthly purchase request.'
            );
          }
        }

        // Note: We rely on purchaseUpdatedListener for final validation and unlock.
        await RNIap.requestPurchase({
          type: 'subs',
          request: {
            android: androidPurchaseRequest,
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

        if (options?.useTrial === true && isTrialIneligiblePurchaseError(err)) {
          setPlayMonthlyTrial({
            isEligible: false,
            offerToken: null,
            reasonKey: TRIAL_UNAVAILABLE_REASON_KEY,
          });
          throw createTrialIneligibleError(err);
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
    [hasUsedTrial, monthlyStandardOfferToken, monthlyTrial.offerToken, restorePurchases]
  );

  const resetTestPurchase = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const purchases = await RNIap.getAvailablePurchases();
        const legacyPurchases = purchases.filter(
          (purchase) =>
            purchase.productId === LEGACY_LIFETIME_PRODUCT_ID && !!purchase.purchaseToken
        );
        const subscriptionPurchase = purchases.filter((purchase) =>
          SUBSCRIPTION_PRODUCT_ID_LIST.includes(purchase.productId)
        );
        const prioritizedSubscriptions = sortPurchasesByPremiumPriority(subscriptionPurchase);
        const topSubscriptionPurchase = prioritizedSubscriptions[0];

        let didConsumeLegacy = false;
        for (const legacyPurchase of legacyPurchases) {
          if (legacyPurchase.purchaseToken) {
            await RNIap.consumePurchaseAndroid(legacyPurchase.purchaseToken);
            didConsumeLegacy = true;
          }
        }

        if (didConsumeLegacy) {
          await syncPremiumStatus();
        }

        if (topSubscriptionPurchase) {
          Alert.alert(
            i18n.t('premium.subscriptionManageTitle'),
            i18n.t('premium.subscriptionManageMessage'),
            [
              { text: i18n.t('common.cancel'), style: 'cancel' },
              {
                text: i18n.t('premium.openSubscriptions'),
                onPress: async () => {
                  try {
                    await RNIap.deepLinkToSubscriptions({
                      skuAndroid: topSubscriptionPurchase.productId,
                    });
                  } catch (linkErr: any) {
                    console.error('Subscription management deep link error:', linkErr);
                    Alert.alert(i18n.t('premium.resetFailedTitle'), linkErr.message);
                  }
                },
              },
            ]
          );
          return;
        }

        if (didConsumeLegacy) {
          setIsPremium(false);
          Alert.alert(i18n.t('premium.resetCompleteTitle'), i18n.t('premium.resetCompleteMessage'));
          return;
        }

        Alert.alert(
          i18n.t('premium.noPurchaseFoundTitle'),
          i18n.t('premium.noPurchaseFoundMessage')
        );
      }
    } catch (err: any) {
      console.error('Reset error:', err);
      Alert.alert(i18n.t('premium.resetFailedTitle'), err.message);
    }
  }, [syncPremiumStatus]);

  return {
    isPremium,
    isLoading,
    purchasePremium,
    restorePurchases,
    resetTestPurchase,
    prices,
    monthlyTrial,
    checkPremiumFeature: (_featureName: string) => {
      // For now, all premium features require isPremium to be true
      // We can add more granular logic here later if needed
      return isPremium;
    },
  };
});
