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
  type PremiumPurchaseType,
} from '@/src/context/premiumBilling';
import {
  CLIENT_FINISH_TRANSACTION_FAILED,
  getPendingValidationMessageKey,
  getPendingValidationRetryDelayMs,
  getPurchaseValidationErrorDetails,
  MAX_PENDING_VALIDATION_RETRY_ATTEMPTS_PER_SESSION,
  normalizePendingValidationQueue,
  PENDING_VALIDATION_QUEUE_STORAGE_KEY,
  PURCHASE_NOT_AVAILABLE_FOR_FINISH,
  type PurchaseValidationErrorDetails,
  type PendingValidationPurchase,
  type PendingValidationQueue,
} from '@/src/context/purchaseValidationRetry';
import { auth, db, functions } from '@/src/firebase/config';
import i18n from '@/src/i18n';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const PENDING_VALIDATION_ALERT_COOLDOWN_MS = 12000;

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
  const pendingValidationQueueRef = useRef<PendingValidationQueue>({});
  const pendingValidationQueueLoadedRef = useRef(false);
  const pendingValidationRetryTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {}
  );
  const inFlightValidationTokensRef = useRef<Set<string>>(new Set());
  const sessionRetryAttemptsRef = useRef<Record<string, number>>({});
  const recentPurchasesRef = useRef<Record<string, Purchase>>({});
  const retryPendingValidationPurchasesRef = useRef<((trigger: string) => Promise<void>) | null>(
    null
  );
  const processPurchaseRef = useRef<
    ((
      purchase: Purchase,
      options?: { syncAfterSuccess?: boolean }
    ) => Promise<ProcessPurchaseResult>) | null
  >(null);
  const lastPendingValidationAlertAtRef = useRef(0);

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

  const clearPendingValidationRetryTimeout = useCallback((purchaseToken: string) => {
    const existingTimeout = pendingValidationRetryTimeoutsRef.current[purchaseToken];
    if (!existingTimeout) {
      return;
    }

    clearTimeout(existingTimeout);
    delete pendingValidationRetryTimeoutsRef.current[purchaseToken];
  }, []);

  const clearAllPendingValidationRetryTimeouts = useCallback(() => {
    Object.values(pendingValidationRetryTimeoutsRef.current).forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    pendingValidationRetryTimeoutsRef.current = {};
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (newUser) => {
      // Reset pending validation queue state when user changes to prevent
      // tokens from one user leaking into another user's session.
      pendingValidationQueueRef.current = {};
      pendingValidationQueueLoadedRef.current = false;
      clearAllPendingValidationRetryTimeouts();
      sessionRetryAttemptsRef.current = {};
      inFlightValidationTokensRef.current.clear();
      recentPurchasesRef.current = {};

      setUser(newUser);
    });
    return () => unsubscribe();
  }, [clearAllPendingValidationRetryTimeouts]);

  const persistPendingValidationQueue = useCallback(async () => {
    if (!user) return;
    try {
      await AsyncStorage.setItem(
        `${PENDING_VALIDATION_QUEUE_STORAGE_KEY}_${user.uid}`,
        JSON.stringify(pendingValidationQueueRef.current)
      );
    } catch (err) {
      console.warn('Failed to persist pending purchase validation queue:', err);
    }
  }, [user]);

  const ensurePendingValidationQueueLoaded = useCallback(async () => {
    if (pendingValidationQueueLoadedRef.current) {
      return;
    }
    if (!user) return;

    try {
      const storedQueue = await AsyncStorage.getItem(
        `${PENDING_VALIDATION_QUEUE_STORAGE_KEY}_${user.uid}`
      );
      if (storedQueue) {
        pendingValidationQueueRef.current = normalizePendingValidationQueue(
          JSON.parse(storedQueue)
        );
      }
    } catch (err) {
      console.warn('Failed to load pending purchase validation queue:', err);
      pendingValidationQueueRef.current = {};
    } finally {
      pendingValidationQueueLoadedRef.current = true;
    }
  }, [user]);

  const upsertPendingValidationPurchase = useCallback(
    async (
      purchase: Omit<PendingValidationPurchase, 'createdAt' | 'updatedAt'> & {
        createdAt?: number;
        updatedAt?: number;
      }
    ) => {
      await ensurePendingValidationQueueLoaded();

      const now = Date.now();
      const existingPurchase = pendingValidationQueueRef.current[purchase.purchaseToken];
      pendingValidationQueueRef.current[purchase.purchaseToken] = {
        ...existingPurchase,
        ...purchase,
        createdAt: existingPurchase?.createdAt ?? purchase.createdAt ?? now,
        updatedAt: purchase.updatedAt ?? now,
      };

      await persistPendingValidationQueue();
    },
    [ensurePendingValidationQueueLoaded, persistPendingValidationQueue]
  );

  const removePendingValidationPurchase = useCallback(
    async (purchaseToken: string) => {
      await ensurePendingValidationQueueLoaded();

      if (pendingValidationQueueRef.current[purchaseToken]) {
        delete pendingValidationQueueRef.current[purchaseToken];
      }

      delete sessionRetryAttemptsRef.current[purchaseToken];
      delete recentPurchasesRef.current[purchaseToken];
      inFlightValidationTokensRef.current.delete(purchaseToken);
      clearPendingValidationRetryTimeout(purchaseToken);
      await persistPendingValidationQueue();
    },
    [
      clearPendingValidationRetryTimeout,
      ensurePendingValidationQueueLoaded,
      persistPendingValidationQueue,
    ]
  );

  const showPendingValidationAlert = useCallback((messageKey: string) => {
    const now = Date.now();
    if (now - lastPendingValidationAlertAtRef.current < PENDING_VALIDATION_ALERT_COOLDOWN_MS) {
      return;
    }

    lastPendingValidationAlertAtRef.current = now;
    Alert.alert(
      i18n.t('premium.purchasePendingVerificationTitle'),
      i18n.t(messageKey || 'premium.purchasePendingVerificationNotice')
    );
  }, []);

  const schedulePendingValidationRetry = useCallback(
    (purchaseToken: string, nextRetryAt: number) => {
      clearPendingValidationRetryTimeout(purchaseToken);

      const delay = Math.max(nextRetryAt - Date.now(), 0);
      pendingValidationRetryTimeoutsRef.current[purchaseToken] = setTimeout(() => {
        delete pendingValidationRetryTimeoutsRef.current[purchaseToken];
        const retryFn = retryPendingValidationPurchasesRef.current;
        if (retryFn) {
          void retryFn(`scheduled:${purchaseToken}`);
        }
      }, delay);
    },
    [clearPendingValidationRetryTimeout]
  );

  const enqueueRetryableValidationFailure = useCallback(
    async ({
      purchaseToken,
      productId,
      purchaseType,
      errorDetails,
    }: {
      purchaseToken: string;
      productId: string;
      purchaseType: PremiumPurchaseType;
      errorDetails: PurchaseValidationErrorDetails;
    }) => {
      const nextAttempt = (sessionRetryAttemptsRef.current[purchaseToken] ?? 0) + 1;
      sessionRetryAttemptsRef.current[purchaseToken] = nextAttempt;
      const nextRetryAt = Date.now() + getPendingValidationRetryDelayMs(nextAttempt);

      await upsertPendingValidationPurchase({
        purchaseToken,
        productId,
        purchaseType,
        nextRetryAt,
        lastReason: errorDetails.reason,
      });

      if (nextAttempt < MAX_PENDING_VALIDATION_RETRY_ATTEMPTS_PER_SESSION) {
        schedulePendingValidationRetry(purchaseToken, nextRetryAt);
      }

      showPendingValidationAlert(getPendingValidationMessageKey(errorDetails));
    },
    [schedulePendingValidationRetry, showPendingValidationAlert, upsertPendingValidationPurchase]
  );

  const validatePurchaseWithServer = useCallback(
    async (purchase: {
      productId: string;
      purchaseToken: string;
      purchaseType: PremiumPurchaseType;
    }): Promise<ValidationResponse> => {
      const validatePurchaseFn = httpsCallable(functions, 'validatePurchase');
      const validationResult = await validatePurchaseFn({
        purchaseToken: purchase.purchaseToken,
        productId: purchase.productId,
        purchaseType: purchase.purchaseType,
      });

      return validationResult.data as ValidationResponse;
    },
    []
  );

  const findPurchaseByToken = useCallback(
    async (purchaseToken: string): Promise<Purchase | null> => {
      const cachedPurchase = recentPurchasesRef.current[purchaseToken];
      if (cachedPurchase) {
        return cachedPurchase;
      }

      try {
        const purchases = await RNIap.getAvailablePurchases();
        const matchedPurchase = purchases.find(
          (purchase) => purchase.purchaseToken === purchaseToken
        );
        if (!matchedPurchase) {
          return null;
        }

        recentPurchasesRef.current[purchaseToken] = matchedPurchase;
        return matchedPurchase;
      } catch (err) {
        console.warn('Failed to fetch available purchases while finishing transaction:', err);
        return null;
      }
    },
    []
  );

  const retryPendingValidationPurchases = useCallback(
    async (trigger: string) => {
      await ensurePendingValidationQueueLoaded();

      const now = Date.now();
      const queuedPurchases = Object.values(pendingValidationQueueRef.current);
      if (queuedPurchases.length === 0) {
        return;
      }

      const duePurchases = queuedPurchases.filter((purchase) => purchase.nextRetryAt <= now);
      if (duePurchases.length === 0) {
        const nextQueuedPurchase = queuedPurchases.reduce<PendingValidationPurchase | null>(
          (earliestPurchase, purchase) => {
            if (!earliestPurchase || purchase.nextRetryAt < earliestPurchase.nextRetryAt) {
              return purchase;
            }
            return earliestPurchase;
          },
          null
        );

        if (nextQueuedPurchase) {
          schedulePendingValidationRetry(
            nextQueuedPurchase.purchaseToken,
            nextQueuedPurchase.nextRetryAt
          );
        }
        return;
      }

      for (const queuedPurchase of duePurchases) {
        const { purchaseToken } = queuedPurchase;

        if (inFlightValidationTokensRef.current.has(purchaseToken)) {
          continue;
        }

        const sessionAttempts = sessionRetryAttemptsRef.current[purchaseToken] ?? 0;
        if (sessionAttempts >= MAX_PENDING_VALIDATION_RETRY_ATTEMPTS_PER_SESSION) {
          console.warn(
            'Skipping pending purchase validation retry for this app session; max attempts reached.',
            { purchaseTokenPrefix: purchaseToken.slice(0, 8), trigger }
          );
          continue;
        }

        inFlightValidationTokensRef.current.add(purchaseToken);

        try {
          const validationResponse = await validatePurchaseWithServer({
            productId: queuedPurchase.productId,
            purchaseToken: queuedPurchase.purchaseToken,
            purchaseType: queuedPurchase.purchaseType,
          });

          if (validationResponse?.success !== true) {
            throw new Error('Purchase validation returned unsuccessful response.');
          }

          const isPremiumValidation = validationResponse?.isPremium === true;
          setIsPremium(isPremiumValidation);
          const purchaseForFinishing = await findPurchaseByToken(purchaseToken);
          if (!purchaseForFinishing) {
            const errorDetails: PurchaseValidationErrorDetails = {
              reason: PURCHASE_NOT_AVAILABLE_FOR_FINISH,
              retryable: true,
            };
            await enqueueRetryableValidationFailure({
              purchaseToken,
              productId: queuedPurchase.productId,
              purchaseType: queuedPurchase.purchaseType,
              errorDetails,
            });
            console.error('Pending purchase acknowledgment retry queued:', {
              flow: 'retryPendingValidationPurchases',
              error: new Error('Purchase unavailable for finishTransaction.'),
              productId: queuedPurchase.productId,
              purchaseTokenPrefix: purchaseToken.slice(0, 8),
              reason: errorDetails.reason,
              retryable: errorDetails.retryable,
              trigger,
            });
            continue;
          }

          try {
            await RNIap.finishTransaction({
              purchase: purchaseForFinishing,
              isConsumable: false,
            });
          } catch (finishError) {
            const errorDetails: PurchaseValidationErrorDetails = {
              reason: CLIENT_FINISH_TRANSACTION_FAILED,
              retryable: true,
            };
            await enqueueRetryableValidationFailure({
              purchaseToken,
              productId: queuedPurchase.productId,
              purchaseType: queuedPurchase.purchaseType,
              errorDetails,
            });
            console.error('Pending purchase acknowledgment retry queued:', {
              flow: 'retryPendingValidationPurchases',
              error: finishError,
              productId: queuedPurchase.productId,
              purchaseTokenPrefix: purchaseToken.slice(0, 8),
              reason: errorDetails.reason,
              retryable: errorDetails.retryable,
              trigger,
            });
            continue;
          }

          await removePendingValidationPurchase(purchaseToken);
          await syncPremiumStatus();
        } catch (retryError) {
          if (isTrialAlreadyUsedValidationError(retryError)) {
            setHasUsedTrial(true);
          }

          const errorDetails = getPurchaseValidationErrorDetails(retryError);
          const messageKey = getPendingValidationMessageKey(errorDetails);

          if (errorDetails.retryable) {
            await enqueueRetryableValidationFailure({
              purchaseToken,
              productId: queuedPurchase.productId,
              purchaseType: queuedPurchase.purchaseType,
              errorDetails,
            });
          } else {
            await removePendingValidationPurchase(purchaseToken);
            showPendingValidationAlert(messageKey);
          }

          console.error('Pending purchase validation retry failed:', {
            flow: 'retryPendingValidationPurchases',
            error: retryError,
            productId: queuedPurchase.productId,
            purchaseTokenPrefix: purchaseToken.slice(0, 8),
            reason: errorDetails.reason,
            retryable: errorDetails.retryable,
            trigger,
          });
        } finally {
          inFlightValidationTokensRef.current.delete(purchaseToken);
        }
      }
    },
    [
      enqueueRetryableValidationFailure,
      ensurePendingValidationQueueLoaded,
      findPurchaseByToken,
      removePendingValidationPurchase,
      schedulePendingValidationRetry,
      showPendingValidationAlert,
      syncPremiumStatus,
      validatePurchaseWithServer,
    ]
  );

  useEffect(() => {
    retryPendingValidationPurchasesRef.current = retryPendingValidationPurchases;
  }, [retryPendingValidationPurchases]);

  // Process a purchase: validate with server and finish transaction
  const processPurchase = useCallback(
    async (
      purchase: Purchase,
      options?: { syncAfterSuccess?: boolean }
    ): Promise<ProcessPurchaseResult> => {
      const syncAfterSuccess = options?.syncAfterSuccess ?? true;

      try {
        console.log('Processing purchase:', purchase.productId);

        const purchaseToken = purchase.purchaseToken;
        if (!purchaseToken) {
          console.error('Purchase missing token', purchase);
          return {
            isPremium: false,
            validationSucceeded: false,
          };
        }

        recentPurchasesRef.current[purchaseToken] = purchase;
        const purchaseType = inferPurchaseType(purchase.productId);
        const validationResponse = await validatePurchaseWithServer({
          purchaseToken,
          productId: purchase.productId,
          purchaseType,
        });
        console.log('Validation response:', validationResponse);

        if (validationResponse?.success !== true) {
          throw new Error('Purchase validation returned unsuccessful response.');
        }

        const isPremiumValidation = validationResponse?.isPremium === true;
        setIsPremium(isPremiumValidation);
        try {
          // Acknowledge/finish transaction after successful validation.
          await RNIap.finishTransaction({
            purchase,
            isConsumable: false,
          });
          console.log('Transaction finished successfully');
        } catch (finishErr) {
          const errorDetails: PurchaseValidationErrorDetails = {
            reason: CLIENT_FINISH_TRANSACTION_FAILED,
            retryable: true,
          };

          await enqueueRetryableValidationFailure({
            purchaseToken,
            productId: purchase.productId,
            purchaseType,
            errorDetails,
          });

          console.error('Error finishing transaction; queued for retry:', {
            flow: 'processPurchase',
            error: finishErr,
            productId: purchase.productId,
            purchaseTokenPrefix: purchaseToken.slice(0, 8),
            reason: errorDetails.reason,
            retryable: errorDetails.retryable,
          });

          if (syncAfterSuccess) {
            await syncPremiumStatus();
          }

          return {
            isPremium: isPremiumValidation,
            validationSucceeded: true,
          };
        }

        await removePendingValidationPurchase(purchaseToken);
        if (syncAfterSuccess) {
          await syncPremiumStatus();
        }

        return {
          isPremium: isPremiumValidation,
          validationSucceeded: true,
        };
      } catch (err) {
        if (isTrialAlreadyUsedValidationError(err)) {
          setHasUsedTrial(true);
        }

        const purchaseToken = purchase.purchaseToken;
        if (purchaseToken) {
          const errorDetails = getPurchaseValidationErrorDetails(err);
          const inlineMessageKey = getPendingValidationMessageKey(errorDetails);

          if (errorDetails.retryable) {
            await enqueueRetryableValidationFailure({
              purchaseToken,
              productId: purchase.productId,
              purchaseType: inferPurchaseType(purchase.productId),
              errorDetails,
            });
          } else {
            await removePendingValidationPurchase(purchaseToken);
            if (!isTrialAlreadyUsedValidationError(err)) {
              showPendingValidationAlert(inlineMessageKey);
            }
          }

          console.error('Error processing purchase:', {
            flow: 'processPurchase',
            error: err,
            productId: purchase.productId,
            purchaseTokenPrefix: purchaseToken.slice(0, 8),
            reason: errorDetails.reason,
            retryable: errorDetails.retryable,
          });
        } else {
          console.error('Error processing purchase:', err);
        }

        return {
          isPremium: false,
          validationSucceeded: false,
        };
      }
    },
    [
      enqueueRetryableValidationFailure,
      removePendingValidationPurchase,
      showPendingValidationAlert,
      syncPremiumStatus,
      validatePurchaseWithServer,
    ]
  );

  useEffect(() => {
    processPurchaseRef.current = processPurchase;
  }, [processPurchase]);

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
            const processPurchaseFn = processPurchaseRef.current;
            const retryPendingValidationPurchasesFn = retryPendingValidationPurchasesRef.current;

            if (!processPurchaseFn || !retryPendingValidationPurchasesFn) {
              console.warn(
                'Purchase update handlers are unavailable; skipping purchase processing for this event.'
              );
              return;
            }

            await processPurchaseFn(purchase);
            await retryPendingValidationPurchasesFn('purchase-updated-listener');
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

        const retryPendingValidationPurchasesFn = retryPendingValidationPurchasesRef.current;
        if (retryPendingValidationPurchasesFn) {
          await retryPendingValidationPurchasesFn('iap-init');
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
      clearAllPendingValidationRetryTimeouts();
      RNIap.endConnection();
    };
  }, [clearAllPendingValidationRetryTimeouts]);

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
      await retryPendingValidationPurchases('app-open');

      if (isCancelled) {
        return;
      }
    };

    syncOnAppOpen();

    return () => {
      isCancelled = true;
    };
  }, [retryPendingValidationPurchases, syncPremiumStatus, user]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      console.log('Starting restorePurchases...');
      await retryPendingValidationPurchases('restore-start');
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
          await retryPendingValidationPurchases('restore-success');
          await syncPremiumStatus();
          return true;
        }
      }

      await retryPendingValidationPurchases('restore-complete');
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
  }, [processPurchase, retryPendingValidationPurchases, syncPremiumStatus]);

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
