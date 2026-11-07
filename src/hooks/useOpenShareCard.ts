import { setPendingShareCards } from '@/src/components/shareCard/pendingShareCards';
import type { ShareCardData } from '@/src/components/shareCard/shareCardTypes';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/** Opens the share card screen. The first card shows by default; more adds a picker. */
export function useOpenShareCard() {
  const router = useRouter();

  return useCallback(
    (cards: ShareCardData[]) => {
      setPendingShareCards(cards);
      router.push('/share-card' as any);
    },
    [router]
  );
}
