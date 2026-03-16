export const MAX_FREE_NOTES = 15;
export const MAX_FREE_REMINDERS = 3;

export type FreemiumLimitFeature = 'notes' | 'reminders';

const FREEMIUM_LIMIT_EXCEEDED_MESSAGE = 'FREEMIUM_LIMIT_EXCEEDED';
const PREMIUM_STATUS_PENDING_MESSAGE = 'PREMIUM_STATUS_PENDING';

interface FreemiumLimitConfig {
  feature: FreemiumLimitFeature;
  maxFreeCount: number;
  currentCount: number;
}

export class FreemiumLimitError extends Error {
  code = 'FREEMIUM_LIMIT';
  feature: FreemiumLimitFeature;
  maxFreeCount: number;
  currentCount: number;

  constructor({ feature, maxFreeCount, currentCount }: FreemiumLimitConfig) {
    super(FREEMIUM_LIMIT_EXCEEDED_MESSAGE);
    this.name = 'FreemiumLimitError';
    this.feature = feature;
    this.maxFreeCount = maxFreeCount;
    this.currentCount = currentCount;
  }
}

export class PremiumStatusPendingError extends Error {
  code = 'PREMIUM_STATUS_PENDING';

  constructor() {
    super(PREMIUM_STATUS_PENDING_MESSAGE);
    this.name = 'PremiumStatusPendingError';
  }
}

export const isFreemiumLimitError = (error: unknown): error is FreemiumLimitError =>
  error instanceof FreemiumLimitError ||
  (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'FREEMIUM_LIMIT');

export const isPremiumStatusPendingError = (
  error: unknown
): error is PremiumStatusPendingError =>
  error instanceof PremiumStatusPendingError ||
  (error instanceof Error &&
    'code' in error &&
    (error as { code?: string }).code === 'PREMIUM_STATUS_PENDING');
