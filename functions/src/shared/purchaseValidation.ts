export const PURCHASE_VALIDATION_REASON_PLAY_API_PERMISSION = 'PLAY_API_PERMISSION';
export const PURCHASE_VALIDATION_REASON_PURCHASE_NOT_FOUND_OR_EXPIRED =
  'PURCHASE_NOT_FOUND_OR_EXPIRED';
export const PURCHASE_VALIDATION_REASON_PLAY_TEMPORARY_FAILURE = 'PLAY_TEMPORARY_FAILURE';
export const PURCHASE_VALIDATION_REASON_PURCHASE_VALIDATION_FAILED = 'PURCHASE_VALIDATION_FAILED';

export interface PurchaseValidationErrorMapping {
  code: 'failed-precondition' | 'internal' | 'unavailable';
  reason: string;
  retryable: boolean;
  statusCode: number | null;
}

const getErrorStatusCode = (error: unknown): number | null => {
  const errorRecord = error as {
    code?: number | string;
    response?: { status?: number };
    status?: number;
  };

  if (typeof errorRecord?.response?.status === 'number') {
    return errorRecord.response.status;
  }

  if (typeof errorRecord?.status === 'number') {
    return errorRecord.status;
  }

  if (typeof errorRecord?.code === 'number') {
    return errorRecord.code;
  }

  if (typeof errorRecord?.code === 'string') {
    const parsedCode = Number(errorRecord.code);
    if (!Number.isNaN(parsedCode)) {
      return parsedCode;
    }
  }

  return null;
};

export const isDefinitiveSubscriptionError = (error: unknown): boolean => {
  const statusCode = getErrorStatusCode(error);
  if (statusCode === 404 || statusCode === 410) {
    return true;
  }

  const errorRecord = error as { name?: string; message?: string };
  const errorName = String(errorRecord?.name || '');
  const errorMessage = String(errorRecord?.message || '').toLowerCase();

  if (errorName === 'NotFoundError' || errorName === 'SubscriptionExpiredError') {
    return true;
  }

  return (
    errorMessage.includes('subscriptionexpired') || errorMessage.includes('subscription expired')
  );
};

export const isTransientSubscriptionError = (error: unknown): boolean => {
  const errorRecord = error as {
    code?: string | number;
    isTransient?: boolean;
    message?: string;
    transient?: boolean;
  };

  if (errorRecord?.isTransient === true || errorRecord?.transient === true) {
    return true;
  }

  const statusCode = getErrorStatusCode(error);
  if (statusCode === 429 || (statusCode !== null && statusCode >= 500)) {
    return true;
  }

  const errorCode = String(errorRecord?.code || '').toUpperCase();
  const transientCodes = new Set([
    'ECONNABORTED',
    'ECONNRESET',
    'ENETUNREACH',
    'ENOTFOUND',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'DEADLINE_EXCEEDED',
  ]);
  if (transientCodes.has(errorCode)) {
    return true;
  }

  const errorMessage = String(errorRecord?.message || '').toLowerCase();
  return (
    errorMessage.includes('network') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('temporarily unavailable')
  );
};

export const mapPurchaseValidationError = (
  error: unknown
): PurchaseValidationErrorMapping => {
  const statusCode = getErrorStatusCode(error);

  if (statusCode === 401 || statusCode === 403) {
    return {
      code: 'failed-precondition',
      reason: PURCHASE_VALIDATION_REASON_PLAY_API_PERMISSION,
      retryable: false,
      statusCode,
    };
  }

  if (statusCode === 404 || statusCode === 410 || isDefinitiveSubscriptionError(error)) {
    return {
      code: 'failed-precondition',
      reason: PURCHASE_VALIDATION_REASON_PURCHASE_NOT_FOUND_OR_EXPIRED,
      retryable: false,
      statusCode,
    };
  }

  if (isTransientSubscriptionError(error)) {
    return {
      code: 'unavailable',
      reason: PURCHASE_VALIDATION_REASON_PLAY_TEMPORARY_FAILURE,
      retryable: true,
      statusCode,
    };
  }

  return {
    code: 'internal',
    reason: PURCHASE_VALIDATION_REASON_PURCHASE_VALIDATION_FAILED,
    retryable: false,
    statusCode,
  };
};

export const shouldAcknowledgeSubscription = (
  acknowledgementState?: string | null
): boolean => acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';

export const resolveSubscriptionAcknowledgeId = (
  lineItemProductId?: string | null,
  fallbackProductId?: string | null
): string | null => lineItemProductId ?? fallbackProductId ?? null;

export const isIdempotentAcknowledgeError = (error: unknown): boolean => {
  const statusCode = getErrorStatusCode(error);
  if (statusCode === 409) {
    return true;
  }

  const errorMessage = String((error as { message?: string })?.message || '').toLowerCase();
  return (
    errorMessage.includes('already acknowledged') ||
    errorMessage.includes('alreadyacknowledged')
  );
};
