import type { PremiumPurchaseType } from '@/src/context/premiumBilling';

export const PENDING_VALIDATION_QUEUE_STORAGE_KEY = 'premium_pending_validation_queue_v1';
export const MAX_PENDING_VALIDATION_RETRY_ATTEMPTS_PER_SESSION = 5;
export const PENDING_VALIDATION_RETRY_BASE_MS = 5000;
export const PENDING_VALIDATION_RETRY_MAX_MS = 5 * 60 * 1000;

export interface PurchaseValidationErrorDetails {
  reason: string | null;
  retryable: boolean;
}

export interface PendingValidationPurchase {
  createdAt: number;
  lastReason: string | null;
  nextRetryAt: number;
  productId: string;
  purchaseToken: string;
  purchaseType: PremiumPurchaseType;
  updatedAt: number;
}

export type PendingValidationQueue = Record<string, PendingValidationPurchase>;

export const getPurchaseValidationErrorDetails = (
  error: unknown
): PurchaseValidationErrorDetails => {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const details = (error as { details?: { reason?: string; retryable?: boolean; code?: string } })
    ?.details;
  const reason =
    typeof details?.reason === 'string'
      ? details.reason
      : typeof details?.code === 'string'
        ? details.code
        : null;

  if (details?.retryable === true) {
    return {
      reason,
      retryable: true,
    };
  }

  if (code === 'functions/unavailable' || code === 'unavailable') {
    return {
      reason,
      retryable: true,
    };
  }

  return {
    reason,
    retryable: false,
  };
};

export const getPendingValidationRetryDelayMs = (attempt: number): number => {
  const normalizedAttempt = Number.isFinite(attempt) && attempt > 0 ? attempt : 1;
  const exponentialDelay = PENDING_VALIDATION_RETRY_BASE_MS * 2 ** (normalizedAttempt - 1);
  return Math.min(exponentialDelay, PENDING_VALIDATION_RETRY_MAX_MS);
};

export const getPendingValidationMessageKey = (
  details: PurchaseValidationErrorDetails,
  fallbackMessageKey = 'premium.purchasePendingVerificationNotice'
): string => {
  if (details.retryable) {
    return 'premium.purchaseTemporaryValidationFailureNotice';
  }

  if (details.reason) {
    return 'premium.purchaseValidationFailedNotice';
  }

  return fallbackMessageKey;
};

const isValidPurchaseType = (value: unknown): value is PremiumPurchaseType =>
  value === 'in-app' || value === 'subs';

export const normalizePendingValidationQueue = (raw: unknown): PendingValidationQueue => {
  if (!raw || typeof raw !== 'object') {
    return {};
  }

  const normalizedQueue: PendingValidationQueue = {};

  for (const [token, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const candidate = value as Partial<PendingValidationPurchase>;
    const purchaseToken = typeof candidate.purchaseToken === 'string' ? candidate.purchaseToken : token;
    const productId = typeof candidate.productId === 'string' ? candidate.productId : null;
    const purchaseType = isValidPurchaseType(candidate.purchaseType) ? candidate.purchaseType : null;

    if (!purchaseToken || !productId || !purchaseType) {
      continue;
    }

    const now = Date.now();
    normalizedQueue[purchaseToken] = {
      purchaseToken,
      productId,
      purchaseType,
      createdAt: Number.isFinite(candidate.createdAt) ? Number(candidate.createdAt) : now,
      updatedAt: Number.isFinite(candidate.updatedAt) ? Number(candidate.updatedAt) : now,
      nextRetryAt: Number.isFinite(candidate.nextRetryAt) ? Number(candidate.nextRetryAt) : now,
      lastReason: typeof candidate.lastReason === 'string' ? candidate.lastReason : null,
    };
  }

  return normalizedQueue;
};
