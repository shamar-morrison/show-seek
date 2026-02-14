import {
  PURCHASE_VALIDATION_REASON_PLAY_API_PERMISSION,
  PURCHASE_VALIDATION_REASON_PLAY_TEMPORARY_FAILURE,
  PURCHASE_VALIDATION_REASON_PURCHASE_NOT_FOUND_OR_EXPIRED,
  PURCHASE_VALIDATION_REASON_PURCHASE_VALIDATION_FAILED,
  isIdempotentAcknowledgeError,
  mapPurchaseValidationError,
  resolveSubscriptionAcknowledgeId,
  shouldAcknowledgeSubscription,
} from '@/functions/src/shared/purchaseValidation';

describe('purchaseValidation shared helpers', () => {
  it('determines when subscription purchases should be acknowledged', () => {
    expect(shouldAcknowledgeSubscription('ACKNOWLEDGEMENT_STATE_PENDING')).toBe(true);
    expect(shouldAcknowledgeSubscription('ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED')).toBe(false);
    expect(shouldAcknowledgeSubscription(undefined)).toBe(true);
  });

  it('resolves subscription acknowledge id from line item first, then fallback', () => {
    expect(resolveSubscriptionAcknowledgeId('monthly_showseek_sub', 'fallback_sub')).toBe(
      'monthly_showseek_sub'
    );
    expect(resolveSubscriptionAcknowledgeId(null, 'fallback_sub')).toBe('fallback_sub');
    expect(resolveSubscriptionAcknowledgeId(undefined, null)).toBeNull();
  });

  it('maps permission errors to failed-precondition and non-retryable', () => {
    expect(mapPurchaseValidationError({ response: { status: 403 } })).toMatchObject({
      code: 'failed-precondition',
      reason: PURCHASE_VALIDATION_REASON_PLAY_API_PERMISSION,
      retryable: false,
      statusCode: 403,
    });
  });

  it('maps not-found/expired errors to failed-precondition and non-retryable', () => {
    expect(mapPurchaseValidationError({ response: { status: 404 } })).toMatchObject({
      code: 'failed-precondition',
      reason: PURCHASE_VALIDATION_REASON_PURCHASE_NOT_FOUND_OR_EXPIRED,
      retryable: false,
      statusCode: 404,
    });
  });

  it('maps transient API errors to unavailable and retryable', () => {
    expect(mapPurchaseValidationError({ response: { status: 503 } })).toMatchObject({
      code: 'unavailable',
      reason: PURCHASE_VALIDATION_REASON_PLAY_TEMPORARY_FAILURE,
      retryable: true,
      statusCode: 503,
    });
  });

  it('maps unknown errors to internal and non-retryable', () => {
    expect(mapPurchaseValidationError(new Error('unexpected failure'))).toMatchObject({
      code: 'internal',
      reason: PURCHASE_VALIDATION_REASON_PURCHASE_VALIDATION_FAILED,
      retryable: false,
    });
  });

  it('treats idempotent acknowledge errors as non-fatal', () => {
    expect(isIdempotentAcknowledgeError({ response: { status: 409 } })).toBe(true);
    expect(isIdempotentAcknowledgeError(new Error('purchase already acknowledged'))).toBe(true);
    expect(isIdempotentAcknowledgeError(new Error('other error'))).toBe(false);
  });
});
