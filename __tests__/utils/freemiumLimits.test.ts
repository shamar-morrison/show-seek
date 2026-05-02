import {
  assertFreemiumAllowed,
  FreemiumLimitError,
  getFreemiumGateState,
  isFreemiumLimitError,
  isPremiumStatusPendingError,
  MAX_FREE_NOTES,
  MAX_FREE_REMINDERS,
  PremiumStatusPendingError,
} from '@/src/utils/freemiumLimits';

describe('freemiumLimits', () => {
  // Verifies usage below the notes limit stays allowed for free users.
  it('allows actions below the free notes limit', () => {
    expect(
      getFreemiumGateState({
        currentCount: MAX_FREE_NOTES - 1,
        isPremium: false,
        maxFreeCount: MAX_FREE_NOTES,
      })
    ).toBe('allowed');
  });

  // Verifies usage at the reminders limit is blocked for free users.
  it('blocks actions at the free reminders limit', () => {
    expect(
      getFreemiumGateState({
        currentCount: MAX_FREE_REMINDERS,
        isPremium: false,
        maxFreeCount: MAX_FREE_REMINDERS,
      })
    ).toBe('blocked');
  });

  // Verifies usage above a free limit remains blocked and reports a FreemiumLimitError.
  it('throws a FreemiumLimitError above the free limit', () => {
    expect(() =>
      assertFreemiumAllowed({
        feature: 'notes',
        currentCount: MAX_FREE_NOTES + 1,
        isPremium: false,
        maxFreeCount: MAX_FREE_NOTES,
      })
    ).toThrow(FreemiumLimitError);
  });

  // Verifies premium entitlement bypasses free limits entirely across gated surfaces.
  it('bypasses all free limits when premium is active', () => {
    expect(
      getFreemiumGateState({
        currentCount: MAX_FREE_NOTES + 20,
        isPremium: true,
        maxFreeCount: MAX_FREE_NOTES,
      })
    ).toBe('allowed');
  });

  // Verifies pending premium state is surfaced separately so callers can wait instead of showing the limit alert.
  it('throws PremiumStatusPendingError while premium status is still loading', () => {
    expect(() =>
      assertFreemiumAllowed({
        feature: 'reminders',
        currentCount: MAX_FREE_REMINDERS,
        isPremium: false,
        isPremiumLoading: true,
        maxFreeCount: MAX_FREE_REMINDERS,
      })
    ).toThrow(PremiumStatusPendingError);
  });

  // Verifies the exported predicates recognize both instance errors and code-based fallback errors.
  it('recognizes shared freemium and premium-pending error shapes', () => {
    const freemiumError = new FreemiumLimitError({
      feature: 'notes',
      currentCount: MAX_FREE_NOTES,
      maxFreeCount: MAX_FREE_NOTES,
    });
    const pendingError = new PremiumStatusPendingError();

    expect(isFreemiumLimitError(freemiumError)).toBe(true);
    expect(isFreemiumLimitError(Object.assign(new Error('x'), { code: 'FREEMIUM_LIMIT' }))).toBe(
      true
    );
    expect(isPremiumStatusPendingError(pendingError)).toBe(true);
    expect(
      isPremiumStatusPendingError(
        Object.assign(new Error('y'), { code: 'PREMIUM_STATUS_PENDING' })
      )
    ).toBe(true);
  });
});
