export const MAX_FREE_NOTES = 15;
export const MAX_FREE_REMINDERS = 3;

export type FreemiumLimitFeature = 'notes' | 'reminders';

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
    super(
      feature === 'notes'
        ? `Free users can save up to ${maxFreeCount} notes. Upgrade to Premium for unlimited notes.`
        : `Free users can set up to ${maxFreeCount} reminders. Upgrade to Premium for unlimited reminders.`
    );
    this.name = 'FreemiumLimitError';
    this.feature = feature;
    this.maxFreeCount = maxFreeCount;
    this.currentCount = currentCount;
  }
}

export const isFreemiumLimitError = (error: unknown): error is FreemiumLimitError =>
  error instanceof FreemiumLimitError ||
  (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'FREEMIUM_LIMIT');
