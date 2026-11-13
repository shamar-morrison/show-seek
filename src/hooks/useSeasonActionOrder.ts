import { usePreferences } from '@/src/hooks/usePreferences';
import { resolveSeasonActionOrder, type SeasonActionButtonId } from '@/src/utils/seasonActionOrder';
import { useMemo } from 'react';

/** The order of the action buttons on each season of a show's Seasons screen, from preferences. */
export function useSeasonActionOrder(): SeasonActionButtonId[] {
  const { preferences } = usePreferences();
  const saved = preferences?.seasonActionOrder;
  return useMemo(() => resolveSeasonActionOrder(saved), [saved]);
}
