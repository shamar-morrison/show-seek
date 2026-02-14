import {
  PENDING_VALIDATION_RETRY_MAX_MS,
  getPendingValidationMessageKey,
  getPendingValidationRetryDelayMs,
  getPurchaseValidationErrorDetails,
  normalizePendingValidationQueue,
} from '@/src/context/purchaseValidationRetry';

describe('purchaseValidationRetry helpers', () => {
  it('marks callable errors as retryable when details.retryable is true', () => {
    expect(
      getPurchaseValidationErrorDetails({
        code: 'functions/internal',
        details: {
          reason: 'PLAY_TEMPORARY_FAILURE',
          retryable: true,
        },
      })
    ).toEqual({
      reason: 'PLAY_TEMPORARY_FAILURE',
      retryable: true,
    });
  });

  it('treats functions/unavailable as retryable when details are missing', () => {
    expect(
      getPurchaseValidationErrorDetails({
        code: 'functions/unavailable',
      })
    ).toEqual({
      reason: null,
      retryable: true,
    });
  });

  it('treats non-retryable errors as terminal', () => {
    expect(
      getPurchaseValidationErrorDetails({
        code: 'functions/failed-precondition',
        details: {
          reason: 'PURCHASE_NOT_FOUND_OR_EXPIRED',
          retryable: false,
        },
      })
    ).toEqual({
      reason: 'PURCHASE_NOT_FOUND_OR_EXPIRED',
      retryable: false,
    });
  });

  it('returns temporary failure message key for retryable errors', () => {
    expect(
      getPendingValidationMessageKey({
        reason: 'PLAY_TEMPORARY_FAILURE',
        retryable: true,
      })
    ).toBe('premium.purchaseTemporaryValidationFailureNotice');
  });

  it('returns non-retryable message key for known terminal errors', () => {
    expect(
      getPendingValidationMessageKey({
        reason: 'PURCHASE_NOT_FOUND_OR_EXPIRED',
        retryable: false,
      })
    ).toBe('premium.purchaseValidationFailedNotice');
  });

  it('uses exponential backoff with max cap', () => {
    expect(getPendingValidationRetryDelayMs(1)).toBe(5000);
    expect(getPendingValidationRetryDelayMs(2)).toBe(10000);
    expect(getPendingValidationRetryDelayMs(3)).toBe(20000);
    expect(getPendingValidationRetryDelayMs(20)).toBe(PENDING_VALIDATION_RETRY_MAX_MS);
  });

  it('normalizes and filters pending queue entries', () => {
    const normalizedQueue = normalizePendingValidationQueue({
      'token-valid': {
        purchaseToken: 'token-valid',
        productId: 'monthly_showseek_sub',
        purchaseType: 'subs',
        nextRetryAt: 111,
        createdAt: 100,
        updatedAt: 110,
        lastReason: 'PLAY_TEMPORARY_FAILURE',
      },
      'token-invalid-type': {
        purchaseToken: 'token-invalid-type',
        productId: 'monthly_showseek_sub',
        purchaseType: 'invalid',
      },
      'token-missing-product': {
        purchaseToken: 'token-missing-product',
        purchaseType: 'subs',
      },
    });

    expect(Object.keys(normalizedQueue)).toEqual(['token-valid']);
    expect(normalizedQueue['token-valid']).toMatchObject({
      purchaseToken: 'token-valid',
      productId: 'monthly_showseek_sub',
      purchaseType: 'subs',
      nextRetryAt: 111,
      createdAt: 100,
      updatedAt: 110,
      lastReason: 'PLAY_TEMPORARY_FAILURE',
    });
  });
});
