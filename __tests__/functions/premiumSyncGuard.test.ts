import { shouldBlockNoTokenPremiumDowngrade } from '@/functions/src/shared/premiumSyncGuard';

describe('premiumSyncGuard', () => {
  it('blocks downgrade when premium is true and allowDowngrade is false', () => {
    expect(
      shouldBlockNoTokenPremiumDowngrade({
        existingIsPremium: true,
        allowDowngrade: false,
      })
    ).toBe(true);
  });

  it('allows downgrade when premium is true and allowDowngrade is true', () => {
    expect(
      shouldBlockNoTokenPremiumDowngrade({
        existingIsPremium: true,
        allowDowngrade: true,
      })
    ).toBe(false);
  });

  it('does not block when existing premium is false', () => {
    expect(
      shouldBlockNoTokenPremiumDowngrade({
        existingIsPremium: false,
        allowDowngrade: false,
      })
    ).toBe(false);
  });
});
