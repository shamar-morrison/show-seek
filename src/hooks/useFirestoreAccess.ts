import { useMemo } from 'react';
import type { User } from 'firebase/auth';

import { useAuth } from '@/src/context/auth';
import { useRuntimeConfig } from '@/src/context/RuntimeConfigContext';

interface FirestoreAccessState {
  user: User | null;
  isAnonymous: boolean;
  signedInUserId: string | undefined;
  firestoreUserId: string | undefined;
  canUseFirestoreClient: boolean;
  canUseListManagementReads: boolean;
  canUseNonCriticalReads: boolean;
  canUsePremiumRealtime: boolean;
}

export function useFirestoreAccess(): FirestoreAccessState {
  const { user } = useAuth();
  const { config, isReady } = useRuntimeConfig();

  return useMemo(() => {
    const isAnonymous = user?.isAnonymous === true;
    const signedInUserId = user && !isAnonymous ? user.uid : undefined;
    const firestoreUserId =
      isReady &&
      config.firestoreClientEnabled &&
      user &&
      (!isAnonymous || config.allowGuestFirestoreReads)
        ? user.uid
        : undefined;

    const canUseFirestoreClient = Boolean(config.firestoreClientEnabled && firestoreUserId);
    const canUseListManagementReads = Boolean(
      isReady && config.firestoreClientEnabled && signedInUserId
    );
    const canUseNonCriticalReads = Boolean(
      canUseFirestoreClient && !config.disableNonCriticalReads
    );
    const canUsePremiumRealtime = Boolean(
      isReady && config.firestoreClientEnabled && signedInUserId
    );

    return {
      user,
      isAnonymous,
      signedInUserId,
      firestoreUserId,
      canUseFirestoreClient,
      canUseListManagementReads,
      canUseNonCriticalReads,
      canUsePremiumRealtime,
    };
  }, [config, isReady, user]);
}
