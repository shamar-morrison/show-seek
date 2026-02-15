export interface PremiumSyncGuardParams {
  existingIsPremium?: boolean | null;
  allowDowngrade: boolean;
}

export const shouldBlockNoTokenPremiumDowngrade = (
  params: PremiumSyncGuardParams
): boolean => params.existingIsPremium === true && !params.allowDowngrade;
