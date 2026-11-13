import { isDefaultActionOrder, resolveActionOrder } from '@/src/utils/actionOrder';

/**
 * The round action buttons on each season of a show's Seasons screen, in their default order
 * (the order they had before they could be rearranged). Mark all and the progress card only
 * show when they apply; the others always show.
 */
export const SEASON_ACTION_BUTTON_IDS = ['markAll', 'rating', 'note', 'list', 'shareCard'] as const;

export type SeasonActionButtonId = (typeof SEASON_ACTION_BUTTON_IDS)[number];

export const DEFAULT_SEASON_ACTION_ORDER: readonly SeasonActionButtonId[] =
  SEASON_ACTION_BUTTON_IDS;

/** The order to show a season's action buttons in, from a saved preference. */
export function resolveSeasonActionOrder(saved: unknown): SeasonActionButtonId[] {
  return resolveActionOrder(saved, DEFAULT_SEASON_ACTION_ORDER);
}

export function isDefaultSeasonActionOrder(order: readonly SeasonActionButtonId[]): boolean {
  return isDefaultActionOrder(order, DEFAULT_SEASON_ACTION_ORDER);
}
