import { resolveDeepLinkTarget } from '@/src/hooks/useDeepLinking';
import * as Linking from 'expo-linking';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

// Drop repeat deliveries of the same URL (initial URL + url event both fire
// on cold start). Separate taps seconds apart still navigate.
const DEDUPE_WINDOW_MS = 2000;

/**
 * App-wide deep-link listener. Navigation is deferred until the root navigator
 * is mounted — pushing into a half-built tree during cold start used to leave
 * a blank screen. Kept as a standalone component so the
 * useRootNavigationState subscription re-renders only this leaf, not the
 * whole layout.
 */
export function DeepLinkHandler() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isReady = !!rootNavigationState?.key;

  const liveRef = useRef({ router, isReady });
  liveRef.current = { router, isReady };
  const pendingUrlRef = useRef<string | null>(null);
  const lastHandledRef = useRef<{ url: string; at: number } | null>(null);

  const navigateUrl = useCallback((url: string, source: string) => {
    const now = Date.now();
    const last = lastHandledRef.current;
    if (last && last.url === url && now - last.at < DEDUPE_WINDOW_MS) {
      console.log('[DeepLink] Ignoring duplicate:', { url, source });
      return;
    }

    const target = resolveDeepLinkTarget(url);
    console.log('[DeepLink] Received:', { url, source, target });
    if (!target) {
      return;
    }

    if (!liveRef.current.isReady) {
      pendingUrlRef.current = url;
      console.log('[DeepLink] Navigator not ready, queued:', { url });
      return;
    }

    lastHandledRef.current = { url, at: now };
    pendingUrlRef.current = null;
    liveRef.current.router.push(target as any);
    console.log('[DeepLink] Navigated:', { url, target });
  }, []);

  // Flush a queued URL as soon as the navigator is ready.
  useEffect(() => {
    if (isReady && pendingUrlRef.current) {
      const url = pendingUrlRef.current;
      pendingUrlRef.current = null;
      navigateUrl(url, 'queue');
    }
  }, [isReady, navigateUrl]);

  useEffect(() => {
    let cancelled = false;

    Linking.getInitialURL().then((initialUrl) => {
      if (!cancelled && initialUrl) {
        navigateUrl(initialUrl, 'initial');
      }
    });

    const subscription = Linking.addEventListener('url', (event) => {
      navigateUrl(event.url, 'event');
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [navigateUrl]);

  return null;
}
