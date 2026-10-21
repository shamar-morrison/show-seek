import { useAuth } from '@/src/context/auth';
import { getCachedUserDocument, mergeUserDocumentCache } from '@/src/services/UserDocumentCache';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Stand-in for the server-side token hash after a successful create. The callable
 * returns only the install URL, and the app reads nothing but the hash's presence.
 */
export const STREMIO_CLIENT_CONNECTED_MARKER = 'client-connected';

interface StremioConnectionState {
  uid: string | null;
  /** null while unknown (not read yet, or the read failed) */
  isConnected: boolean | null;
}

let state: StremioConnectionState = { uid: null, isConnected: null };
// Bumped on every optimistic update so an older in-flight read cannot overwrite it.
let version = 0;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => state;

const setState = (next: StremioConnectionState) => {
  state = next;
  listeners.forEach((listener) => listener());
};

/** Optimistically records the result of a successful create or revoke, without a read. */
export function markStremioConnected(uid: string, isConnected: boolean): void {
  version += 1;
  setState({ uid, isConnected });
  mergeUserDocumentCache(uid, {
    stremioAddon: { activeTokenHash: isConnected ? STREMIO_CLIENT_CONNECTED_MARKER : null },
  });
}

/** Test-only reset of the module store. */
export function resetStremioConnectionForTest(): void {
  version = 0;
  state = { uid: null, isConnected: null };
  listeners.clear();
}

/**
 * Stremio addon link state from the shared, TTL-cached user document
 * (UserDocumentCache): at most one read per open once the cache has expired, and
 * none while disabled or for guests.
 */
export function useStremioConnection({ enabled }: { enabled: boolean }) {
  const { user } = useAuth();
  const uid = user && !user.isAnonymous ? user.uid : null;
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refresh = useCallback(async () => {
    if (!uid) return;
    const startedAt = version;
    let isConnected: boolean | null;
    try {
      const data = await getCachedUserDocument(uid, { callsite: 'useStremioConnection' });
      const stremioAddon = data?.stremioAddon as { activeTokenHash?: unknown } | undefined;
      isConnected = typeof stremioAddon?.activeTokenHash === 'string';
    } catch {
      isConnected = null;
    }
    if (startedAt !== version) return;
    setState({ uid, isConnected });
  }, [uid]);

  useEffect(() => {
    if (enabled && uid) {
      void refresh();
    }
  }, [enabled, uid, refresh]);

  return {
    isConnected: uid && snapshot.uid === uid ? snapshot.isConnected : null,
    refresh,
  };
}
