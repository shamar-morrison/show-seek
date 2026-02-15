import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';

const featureReadCounts = new Map<string, number>();
let consumedReads = 0;

const getBudgetLimit = () => READ_OPTIMIZATION_FLAGS.nonCriticalReadBudgetPerSession;

export function registerSessionReadCount(readCount: number, feature?: string): void {
  const sanitized = Math.max(0, Math.floor(readCount));
  if (sanitized === 0) return;

  consumedReads += sanitized;

  if (feature) {
    featureReadCounts.set(feature, (featureReadCounts.get(feature) || 0) + sanitized);
  }
}

export function canUseNonCriticalRead(estimatedReads = 1): boolean {
  if (!READ_OPTIMIZATION_FLAGS.liteModeEnabled) {
    return true;
  }

  return consumedReads + Math.max(1, estimatedReads) <= getBudgetLimit();
}

export function reserveNonCriticalReadBudget(feature: string, estimatedReads = 1): boolean {
  if (!canUseNonCriticalRead(estimatedReads)) {
    return false;
  }

  registerSessionReadCount(estimatedReads, feature);
  return true;
}

export function getReadBudgetSnapshot() {
  return {
    consumedReads,
    remainingReads: Math.max(0, getBudgetLimit() - consumedReads),
    budgetLimit: getBudgetLimit(),
    byFeature: Array.from(featureReadCounts.entries())
      .map(([name, reads]) => ({ name, reads }))
      .sort((a, b) => b.reads - a.reads),
  };
}

export function resetReadBudgetForSession(): void {
  consumedReads = 0;
  featureReadCounts.clear();
}
