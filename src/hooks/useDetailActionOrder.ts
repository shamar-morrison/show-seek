import { usePreferences } from '@/src/hooks/usePreferences';
import { resolveDetailActionOrder, type DetailActionButtonId } from '@/src/utils/detailActionOrder';
import { useMemo } from 'react';

/** The order of the action buttons on movie and TV show pages, from preferences. */
export function useDetailActionOrder(): DetailActionButtonId[] {
  const { preferences } = usePreferences();
  const saved = preferences?.detailActionOrder;
  return useMemo(() => resolveDetailActionOrder(saved), [saved]);
}
