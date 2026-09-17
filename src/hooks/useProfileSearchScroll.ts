import { SPACING } from '@/src/constants/theme';
import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';

export interface PendingProfileScroll {
  id: string;
  query: string;
}

/**
 * Coordinates search-driven scrolling on the Profile page without native measuring.
 *
 * Sections report content-relative Y-offsets via `onLayout`
 * (`registerItemLayout`). `scrollToItem` scrolls straight to a recorded offset.
 * When the target offset isn't known yet (e.g. its tab just mounted and layout
 * hasn't fired), the scroll is parked as pending and resolved automatically
 * once the matching `onLayout` arrives — no fixed-delay timers, so slow
 * devices behave the same as fast ones.
 */
export function useProfileSearchScroll(
  scrollViewRef: RefObject<ScrollView | null>,
  getCurrentQuery: () => string
) {
  const itemOffsets = useRef<Record<string, number>>({});
  const pendingScroll = useRef<PendingProfileScroll | null>(null);

  const scrollToItem = useCallback(
    (id: string): boolean => {
      const scroller = scrollViewRef.current;
      const y = itemOffsets.current[id];
      if (scroller == null || y == null) {
        return false;
      }
      scroller.scrollTo({ y: Math.max(0, y - SPACING.s), animated: true });
      return true;
    },
    [scrollViewRef]
  );

  const queuePendingScroll = useCallback((id: string, query: string) => {
    pendingScroll.current = { id, query };
  }, []);

  const clearPendingScroll = useCallback(() => {
    pendingScroll.current = null;
  }, []);

  const resolvePendingScroll = useCallback((): boolean => {
    const pending = pendingScroll.current;
    if (!pending || pending.query !== getCurrentQuery()) {
      pendingScroll.current = null;
      return false;
    }
    if (scrollToItem(pending.id)) {
      pendingScroll.current = null;
      return true;
    }
    return false;
  }, [getCurrentQuery, scrollToItem]);

  const registerItemLayout = useCallback(
    (id: string, y: number) => {
      itemOffsets.current[id] = y;
      const pending = pendingScroll.current;
      if (pending && pending.id === id && pending.query === getCurrentQuery()) {
        if (scrollToItem(id)) {
          pendingScroll.current = null;
        }
      }
    },
    [getCurrentQuery, scrollToItem]
  );

  return {
    scrollToItem,
    registerItemLayout,
    queuePendingScroll,
    resolvePendingScroll,
    clearPendingScroll,
  };
}
