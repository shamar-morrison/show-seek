import { useAuth } from '@/src/context/auth';
import { useGuestAccess } from '@/src/context/GuestAccessContext';
import { useCallback } from 'react';

/**
 * Shared guard helper for flows that require an authenticated non-guest account.
 * Returns true when access is blocked and the account-required modal is shown.
 */
export function useAccountRequired() {
  const { user, isGuest } = useAuth();
  const { requireAccount } = useGuestAccess();

  return useCallback(() => {
    if (!user || isGuest) {
      requireAccount();
      return true;
    }
    return false;
  }, [isGuest, requireAccount, user]);
}
