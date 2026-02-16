import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import {
  getProductIdForPlan,
  SUBSCRIPTION_PRODUCT_IDS,
  type PremiumPlan,
} from '@/src/context/premiumBilling';
import { auth, db } from '@/src/firebase/config';
import { createUserDocument } from '@/src/firebase/user';
import i18n from '@/src/i18n';
import { auditedOnSnapshot } from '@/src/services/firestoreReadAudit';
import {
  findLegacyLifetimePurchases,
  type LegacyLifetimePurchase,
  restoreLegacyLifetimeViaCallable,
} from '@/src/services/legacyLifetimeRestore';
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
const LEGACY_LIFETIME_PRODUCT_ID = 'premium_unlock';
const LEGACY_RESTORE_NON_FATAL_REASONS = new Set([
  'LIFETIME_PURCHASE_PENDING',
  'LIFETIME_PURCHASE_NOT_PURCHASED',
  'PURCHASE_NOT_FOUND_OR_EXPIRED',
]);
const LEGACY_RESTORE_PENDING_ERROR_CODE = 'LEGACY_RESTORE_PENDING';
const KNOWN_SUBSCRIPTION_PRODUCT_IDS = new Set([
  SUBSCRIPTION_PRODUCT_IDS.monthly,
  SUBSCRIPTION_PRODUCT_IDS.yearly,
]);

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

const isLegacyLifetimePremium = (premiumData?: Record<string, unknown>): boolean => {
  const entitlementType = String(premiumData?.entitlementType ?? '')
    .trim()
    .toLowerCase();
  const productId = String(premiumData?.productId ?? '').trim();

  return entitlementType === 'lifetime' || productId === LEGACY_LIFETIME_PRODUCT_ID;
};

const hasKnownSubscriptionMarker = (premiumData?: Record<string, unknown>): boolean => {
  const entitlementType = String(premiumData?.entitlementType ?? '')
    .trim()
    .toLowerCase();
  const productId = String(premiumData?.productId ?? '').trim();

  return entitlementType === 'subscription' || KNOWN_SUBSCRIPTION_PRODUCT_IDS.has(productId);
};

const shouldRunLegacyPreflight = (premiumData?: Record<string, unknown>): boolean => {
  return !isLegacyLifetimePremium(premiumData) && !hasKnownSubscriptionMarker(premiumData);
};

const resolveFirestoreTrialHistory = (premiumData?: Record<string, unknown>): boolean =>
  premiumData?.hasUsedTrial === true ||
  premiumData?.trialConsumedAt != null ||
  premiumData?.trialStartAt != null;

const toRedactedTokenPrefix = (purchaseToken: string): string => purchaseToken.slice(0, 8);

const extractRevenueCatPurchaseToken = (error: unknown): string | null => {
  const errorRecord = error as {
    message?: unknown;
    underlyingErrorMessage?: unknown;
    userInfo?: unknown;
  };

  const userInfo = errorRecord?.userInfo;
  const userInfoMessage =
    userInfo && typeof userInfo === 'object'
      ? String((userInfo as { underlyingErrorMessage?: unknown }).underlyingErrorMessage ?? '')
      : '';

  const rawErrorText = [
    String(errorRecord?.message ?? ''),
    String(errorRecord?.underlyingErrorMessage ?? ''),
    userInfoMessage,
    String(error ?? ''),
  ]
    .join('\n')
    .trim();
  if (!rawErrorText) {
    return null;
  }

  const directTokenMatch = rawErrorText.match(/purchaseToken=([A-Za-z0-9._-]+)/);
  if (directTokenMatch?.[1]) {
    return directTokenMatch[1];
  }

  const jsonTokenMatch = rawErrorText.match(/"purchaseToken":"([^"]+)"/);
  if (jsonTokenMatch?.[1]) {
    return jsonTokenMatch[1];
  }

  return null;
};

interface LegacyRestoreReasonContext {
  hasLegacyLifetimeEvidence?: boolean;
}

const getLegacyRestoreReason = (
  error: unknown,
  context: LegacyRestoreReasonContext = {}
): string | null => {
  const errorRecord = error as { details?: unknown; message?: unknown; reason?: unknown };
  if (typeof errorRecord?.reason === 'string') {
    return errorRecord.reason;
  }

  const details = errorRecord?.details;
  if (details && typeof details === 'object') {
    const reason = (details as { reason?: unknown }).reason;
    if (typeof reason === 'string') {
      return reason;
    }
  }

  const message = String(errorRecord?.message ?? '').toLowerCase();
  if (message.includes('pending')) {
    if (!context.hasLegacyLifetimeEvidence) {
      return null;
    }
    return 'LIFETIME_PURCHASE_PENDING';
  }

  if (message.includes('not purchased')) {
    return 'LIFETIME_PURCHASE_NOT_PURCHASED';
  }

  return null;
};

const isRecoverableLegacyRestoreError = (
  error: unknown,
  context: LegacyRestoreReasonContext = {}
): boolean => {
  const reason = getLegacyRestoreReason(error, context);
  if (reason) {
    return LEGACY_RESTORE_NON_FATAL_REASONS.has(reason);
  }

  const message = String((error as { message?: unknown })?.message ?? '').toLowerCase();
  return message.includes('legacy lifetime validation did not return premium success');
};

interface LegacyRestoreDiagnostics {
  hadAnyLegacyCandidate: boolean;
  hadNotPurchasedLegacyFailure: boolean;
  hadPendingLegacyFailure: boolean;
}

interface LegacyRestoreAttemptResult extends LegacyRestoreDiagnostics {
  attemptedCount: number;
  restored: boolean;
}

const createPendingLegacyRestoreError = (): Error & { code: string } => {
  const pendingError = new Error(i18n.t('premium.restorePendingMessage')) as Error & {
    code: string;
  };
  pendingError.code = LEGACY_RESTORE_PENDING_ERROR_CODE;
  return pendingError;
};

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
  console.debug('=== OFFERINGS DEBUG ===');
  console.debug('[RevenueCat Debug] Offerings summary:', {
    allOfferingKeys: Object.keys(offerings.all),
    context,
    currentOfferingIdentifier: offerings.current?.identifier ?? null,
    premiumOfferingFound: premiumOffering != null,
    premiumPackageCount: packageSummaries.length,
    premiumPackages: packageSummaries,
  });
  console.debug('==================');
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
  const [isRevenueCatBypassed, setIsRevenueCatBypassed] = useState(false);

  const [isPremiumFromFirestore, setIsPremiumFromFirestore] = useState(false);
  const [hasUsedTrialFromFirestore, setHasUsedTrialFromFirestore] = useState(false);
  const [isFirestoreLoading, setIsFirestoreLoading] = useState(true);

  const [prices, setPrices] = useState<PremiumPrices>({
    monthly: null,
    yearly: null,
  });
  const [packagesByPlan, setPackagesByPlan] = useState<
    Record<PremiumPlan, PurchasesPackage | null>
  >({
    monthly: null,
    yearly: null,
  });

  const [user, setUser] = useState<User | null>(auth.currentUser);

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
    ): Record<PremiumPlan, PurchasesPackage | null> => {
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
    async (context = 'refreshOfferings'): Promise<Record<PremiumPlan, PurchasesPackage | null>> => {
      const offerings = await Purchases.getOfferings();
      return applyOfferingsState(offerings, context);
    },
    [applyOfferingsState]
  );

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

        console.log('[RevenueCat] Purchases.logIn start for user:', nextUser.uid);
        await Purchases.logIn(nextUser.uid);
        console.log('[RevenueCat] Purchases.logIn completed for user:', nextUser.uid);

        const customerInfo = await Purchases.getCustomerInfo();
        await applyCustomerInfo(customerInfo, nextUser.uid);

        try {
          await refreshOfferings('syncRevenueCatForUser');
        } catch (offeringsError) {
          console.error('[RevenueCat] Offerings refresh failed during user sync:', offeringsError);
        }
      } catch (err) {
        console.error('RevenueCat sync failed:', err);
      } finally {
        setIsRevenueCatLoading(false);
      }
    },
    [applyCustomerInfo, refreshOfferings]
  );

  const attemptLegacyLifetimeRestoreCandidates = useCallback(
    async (
      userId: string,
      context: 'startup-preflight' | 'manual-restore'
    ): Promise<LegacyRestoreAttemptResult> => {
      const legacyLifetimePurchases = await findLegacyLifetimePurchases();
      if (legacyLifetimePurchases.length === 0) {
        console.log(`[PremiumContext] ${context}: no legacy lifetime purchase candidates found.`);
        return {
          attemptedCount: 0,
          hadAnyLegacyCandidate: false,
          hadNotPurchasedLegacyFailure: false,
          hadPendingLegacyFailure: false,
          restored: false,
        };
      }

      let hadPendingLegacyFailure = false;
      let hadNotPurchasedLegacyFailure = false;
      for (const [index, purchase] of legacyLifetimePurchases.entries()) {
        console.log(`[PremiumContext] ${context}: validating legacy lifetime candidate.`, {
          candidateIndex: index + 1,
          purchaseState: purchase.purchaseState,
          tokenPrefix: toRedactedTokenPrefix(purchase.purchaseToken),
          totalCandidates: legacyLifetimePurchases.length,
        });

        try {
          const restoredLifetime = await restoreLegacyLifetimeViaCallable(userId, purchase);
          if (restoredLifetime) {
            console.log(`[PremiumContext] ${context}: legacy lifetime restore succeeded.`, {
              candidateIndex: index + 1,
              purchaseState: purchase.purchaseState,
              tokenPrefix: toRedactedTokenPrefix(purchase.purchaseToken),
              totalCandidates: legacyLifetimePurchases.length,
            });
            return {
              attemptedCount: index + 1,
              hadAnyLegacyCandidate: true,
              hadNotPurchasedLegacyFailure,
              hadPendingLegacyFailure,
              restored: true,
            };
          }
        } catch (error) {
          if (
            isRecoverableLegacyRestoreError(error, {
              hasLegacyLifetimeEvidence: true,
            })
          ) {
            const reason = getLegacyRestoreReason(error, {
              hasLegacyLifetimeEvidence: true,
            });
            hadPendingLegacyFailure =
              hadPendingLegacyFailure || reason === 'LIFETIME_PURCHASE_PENDING';
            hadNotPurchasedLegacyFailure =
              hadNotPurchasedLegacyFailure || reason === 'LIFETIME_PURCHASE_NOT_PURCHASED';
            console.warn(`[PremiumContext] ${context}: recoverable legacy candidate validation failure.`, {
              candidateIndex: index + 1,
              purchaseState: purchase.purchaseState,
              reason,
              tokenPrefix: toRedactedTokenPrefix(purchase.purchaseToken),
              totalCandidates: legacyLifetimePurchases.length,
            });
            continue;
          }

          console.error(`[PremiumContext] ${context}: fatal legacy candidate validation failure.`, error);
          throw error;
        }
      }

      console.log(`[PremiumContext] ${context}: legacy candidates exhausted without restorable lifetime.`);
      return {
        attemptedCount: legacyLifetimePurchases.length,
        hadAnyLegacyCandidate: true,
        hadNotPurchasedLegacyFailure,
        hadPendingLegacyFailure,
        restored: false,
      };
    },
    []
  );

  const attemptLegacyRestoreFromRevenueCatError = useCallback(
    async (userId: string, error: unknown): Promise<LegacyRestoreAttemptResult> => {
      const purchaseToken = extractRevenueCatPurchaseToken(error);
      if (!purchaseToken) {
        console.log(
          '[PremiumContext] RevenueCat restore error did not include a purchase token for legacy validation.'
        );
        return {
          attemptedCount: 0,
          hadAnyLegacyCandidate: false,
          hadNotPurchasedLegacyFailure: false,
          hadPendingLegacyFailure: false,
          restored: false,
        };
      }

      const candidate: LegacyLifetimePurchase = {
        productId: LEGACY_LIFETIME_PRODUCT_ID,
        purchaseState: 'unknown',
        purchaseToken,
        transactionDate: Date.now(),
        transactionId: null,
      };
      console.log(
        '[PremiumContext] Attempting legacy lifetime validation using purchase token from RevenueCat restore error.',
        {
          tokenPrefix: toRedactedTokenPrefix(purchaseToken),
        }
      );

      try {
        const restored = await restoreLegacyLifetimeViaCallable(userId, candidate);
        if (restored) {
          console.log(
            '[PremiumContext] Legacy lifetime restore succeeded using purchase token from RevenueCat restore error.'
          );
          return {
            attemptedCount: 1,
            hadAnyLegacyCandidate: true,
            hadNotPurchasedLegacyFailure: false,
            hadPendingLegacyFailure: false,
            restored: true,
          };
        }
      } catch (restoreError) {
        if (
          isRecoverableLegacyRestoreError(restoreError, {
            hasLegacyLifetimeEvidence: true,
          })
        ) {
          const reason = getLegacyRestoreReason(restoreError, {
            hasLegacyLifetimeEvidence: true,
          });
          console.warn(
            '[PremiumContext] RevenueCat-derived legacy token failed validation with recoverable reason.',
            {
              reason,
              tokenPrefix: toRedactedTokenPrefix(purchaseToken),
            }
          );
          return {
            attemptedCount: 1,
            hadAnyLegacyCandidate: true,
            hadNotPurchasedLegacyFailure: reason === 'LIFETIME_PURCHASE_NOT_PURCHASED',
            hadPendingLegacyFailure: reason === 'LIFETIME_PURCHASE_PENDING',
            restored: false,
          };
        }

        console.error(
          '[PremiumContext] RevenueCat-derived legacy token failed validation with fatal reason.',
          restoreError
        );
        throw restoreError;
      }

      return {
        attemptedCount: 1,
        hadAnyLegacyCandidate: true,
        hadNotPurchasedLegacyFailure: false,
        hadPendingLegacyFailure: false,
        restored: false,
      };
    },
    []
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
      setIsRevenueCatBypassed(false);
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
      if (isCancelled) {
        return;
      }

      if (Platform.OS === 'android') {
        if (isRevenueCatBypassed) {
          console.log('[PremiumContext] Startup sync: RevenueCat bypass already active.');
          setIsRevenueCatLoading(false);
          return;
        }

        try {
          const userData = await getCachedUserDocument(user.uid, {
            forceRefresh: true,
            callsite: 'PremiumContext.initializeForUser.preflight',
          });
          if (isCancelled) {
            return;
          }
          const premiumData = userData?.premium as Record<string, unknown> | undefined;

          if (isLegacyLifetimePremium(premiumData)) {
            console.log(
              '[PremiumContext] Startup preflight: lifetime marker detected in Firestore, bypassing RevenueCat sync.'
            );
            setIsRevenueCatBypassed(true);
            setIsPremiumFromFirestore(true);
            setHasUsedTrialFromFirestore(resolveFirestoreTrialHistory(premiumData));
            setIsRevenueCatLoading(false);
            return;
          }

          if (shouldRunLegacyPreflight(premiumData)) {
            console.log(
              '[PremiumContext] Startup preflight: checking legacy lifetime purchase before RevenueCat sync.'
            );
            try {
              const legacyRestoreResult = await attemptLegacyLifetimeRestoreCandidates(
                user.uid,
                'startup-preflight'
              );
              if (isCancelled) {
                return;
              }
              if (legacyRestoreResult.restored) {
                console.log(
                  '[PremiumContext] Startup preflight: restored legacy lifetime, enabling RevenueCat bypass.'
                );
                setIsPremiumFromFirestore(true);
                setIsRevenueCatBypassed(true);
                setIsRevenueCatLoading(false);
                return;
              }

              if (legacyRestoreResult.attemptedCount === 0) {
                console.log(
                  '[PremiumContext] Startup preflight: no legacy lifetime purchase found, falling back to RevenueCat.'
                );
              } else {
                console.log(
                  '[PremiumContext] Startup preflight: no restorable legacy lifetime purchase found, falling back to RevenueCat.'
                );
              }
            } catch (preflightError) {
              if (isCancelled) {
                return;
              }
              console.warn(
                '[PremiumContext] Startup preflight failed; continuing with RevenueCat sync:',
                preflightError
              );
            }
          } else {
            console.log(
              '[PremiumContext] Startup preflight skipped due known subscription markers in premium data.'
            );
          }
        } catch (preflightLoadError) {
          if (isCancelled) {
            return;
          }
          console.warn(
            '[PremiumContext] Startup preflight data load failed; continuing with RevenueCat sync:',
            preflightLoadError
          );
        }
      }

      if (isCancelled) {
        return;
      }
      await syncRevenueCatForUser(user);
      if (isCancelled) {
        return;
      }
    };

    void initializeForUser();

    return () => {
      isCancelled = true;
    };
  }, [attemptLegacyLifetimeRestoreCandidates, isRevenueCatBypassed, syncRevenueCatForUser, user]);

  useEffect(() => {
    if (!user || Platform.OS !== 'android' || isRevenueCatBypassed || isRevenueCatLoading) {
      if (isRevenueCatBypassed) {
        console.log('[PremiumContext] RevenueCat customer info listener bypassed for legacy lifetime.');
      }
      return;
    }

    const listener = (customerInfo: CustomerInfo) => {
      void applyCustomerInfo(customerInfo, user.uid);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [applyCustomerInfo, isRevenueCatBypassed, isRevenueCatLoading, user]);

  useEffect(() => {
    if (!user?.uid || Platform.OS !== 'android' || isRevenueCatBypassed || isRevenueCatLoading) {
      if (isRevenueCatBypassed) {
        console.log('[PremiumContext] RevenueCat foreground refresh bypassed for legacy lifetime.');
      }
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
  }, [applyCustomerInfo, isRevenueCatBypassed, isRevenueCatLoading, user?.uid]);

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
          const lifetimeMarker = isLegacyLifetimePremium(premiumData);
          const premiumStatus = premiumData?.isPremium === true || lifetimeMarker;
          const hasTrialHistory = resolveFirestoreTrialHistory(premiumData);

          setIsPremiumFromFirestore(premiumStatus);
          setHasUsedTrialFromFirestore(hasTrialHistory);
          if (lifetimeMarker) {
            setIsRevenueCatBypassed(true);
          }
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
        const lifetimeMarker = isLegacyLifetimePremium(premiumData);
        const premiumStatus = premiumData?.isPremium === true || lifetimeMarker;
        const hasTrialHistory = resolveFirestoreTrialHistory(premiumData);

        setIsPremiumFromFirestore(premiumStatus);
        setHasUsedTrialFromFirestore(hasTrialHistory);
        if (lifetimeMarker) {
          setIsRevenueCatBypassed(true);
        }
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

        const requestedProductId = getProductIdForPlan(plan);
        let selectedPackage = packagesByPlan[plan];
        if (!selectedPackage) {
          console.log('[RevenueCat] No cached package found for plan. Refreshing offerings.', {
            plan,
            requestedProductId,
          });
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
      return false;
    }

    console.log('[PremiumContext] Attempting legacy lifetime restore...');
    const legacyRestoreResult = await attemptLegacyLifetimeRestoreCandidates(user.uid, 'manual-restore');
    let hadPendingLegacyFailure = legacyRestoreResult.hadPendingLegacyFailure;
    let hadNotPurchasedLegacyFailure = legacyRestoreResult.hadNotPurchasedLegacyFailure;
    let hadAnyLegacyCandidate = legacyRestoreResult.hadAnyLegacyCandidate;

    if (legacyRestoreResult.restored) {
      setIsPremiumFromFirestore(true);
      setIsRevenueCatBypassed(true);
      return true;
    }

    if (legacyRestoreResult.attemptedCount === 0) {
      console.log('[PremiumContext] No legacy lifetime purchase found in Google Play.');
    } else {
      console.log('[PremiumContext] No restorable legacy lifetime purchase found.');
    }

    if (isRevenueCatBypassed) {
      console.log(
        '[PremiumContext] RevenueCat restore skipped because legacy lifetime bypass is active for this user.'
      );
      return false;
    }

    const configured = await configureRevenueCat();
    if (!configured) {
      return false;
    }

    console.log('[PremiumContext] Falling back to RevenueCat restore for subscriptions.');
    try {
      const customerInfo = await Purchases.restorePurchases();
      await applyCustomerInfo(customerInfo, user.uid);
      const hasRevenueCatPremium = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] != null;
      console.log('[PremiumContext] RevenueCat restore result:', {
        hasRevenueCatPremium,
      });
      if (hasRevenueCatPremium) {
        return true;
      }
    } catch (error) {
      console.warn('[PremiumContext] RevenueCat restore failed:', error);
      const revenueCatFallbackResult = await attemptLegacyRestoreFromRevenueCatError(user.uid, error);
      if (revenueCatFallbackResult.restored) {
        setIsPremiumFromFirestore(true);
        setIsRevenueCatBypassed(true);
        return true;
      }

      const revenueCatRestoreReason = getLegacyRestoreReason(error, {
        hasLegacyLifetimeEvidence: revenueCatFallbackResult.hadAnyLegacyCandidate,
      });
      hadPendingLegacyFailure =
        hadPendingLegacyFailure ||
        revenueCatFallbackResult.hadPendingLegacyFailure ||
        revenueCatRestoreReason === 'LIFETIME_PURCHASE_PENDING';
      hadNotPurchasedLegacyFailure =
        hadNotPurchasedLegacyFailure ||
        revenueCatFallbackResult.hadNotPurchasedLegacyFailure ||
        revenueCatRestoreReason === 'LIFETIME_PURCHASE_NOT_PURCHASED';
      hadAnyLegacyCandidate = hadAnyLegacyCandidate || revenueCatFallbackResult.hadAnyLegacyCandidate;
    }

    if (hadPendingLegacyFailure) {
      console.warn('[PremiumContext] Restore concluded with pending legacy purchase state.', {
        hadAnyLegacyCandidate,
        hadNotPurchasedLegacyFailure,
      });
      throw createPendingLegacyRestoreError();
    }

    return false;
  }, [
    applyCustomerInfo,
    attemptLegacyLifetimeRestoreCandidates,
    attemptLegacyRestoreFromRevenueCatError,
    isRevenueCatBypassed,
    user,
  ]);

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

      Alert.alert(i18n.t('premium.noPurchaseFoundTitle'), i18n.t('premium.noPurchaseFoundMessage'));
    } catch (err: any) {
      console.error('Reset error:', err);
      Alert.alert(i18n.t('premium.resetFailedTitle'), err.message || i18n.t('errors.generic'));
    }
  }, []);

  const isPremium = isPremiumFromRevenueCat || isPremiumFromFirestore;
  const hasUsedTrial = hasUsedTrialFromRevenueCat || hasUsedTrialFromFirestore;
  const isLoading = user
    ? isRevenueCatLoading || isFirestoreLoading
    : isRevenueCatLoading || isFirestoreLoading;

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
    resetTestPurchase,
    prices,
    monthlyTrial,
    checkPremiumFeature: (_featureName: string) => isPremium,
  };
});
