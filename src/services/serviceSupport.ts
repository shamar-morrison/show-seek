import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import { auth } from '@/src/firebase/config';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import type { User } from 'firebase/auth';

const AUTH_REQUIRED_MESSAGE = 'Please sign in to continue';

export const getSignedInUser = (): User | null => {
  const user = auth.currentUser;

  if (!user || user.isAnonymous) {
    return null;
  }

  return user;
};

export const requireSignedInUser = (): User => {
  const user = getSignedInUser();

  if (!user) {
    throw new Error(AUTH_REQUIRED_MESSAGE);
  }

  return user;
};

export const requireMatchingUser = (userId: string): User => {
  const user = requireSignedInUser();

  if (user.uid !== userId) {
    throw new Error(AUTH_REQUIRED_MESSAGE);
  }

  return user;
};

export const createServiceLogger = (serviceName: string) => {
  return (event: string, payload: Record<string, unknown>) => {
    if (!__DEV__ || !READ_OPTIMIZATION_FLAGS.enableServiceQueryDebugLogs) {
      return;
    }

    console.log(`[${serviceName}.${event}]`, payload);
  };
};

export const toFirestoreError = (error: unknown): Error => {
  return new Error(getFirestoreErrorMessage(error));
};

export const rethrowFirestoreError = (context: string, error: unknown): never => {
  console.error(`[${context}]`, error);
  throw toFirestoreError(error);
};
