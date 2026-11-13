import { isDefaultActionOrder, resolveActionOrder } from '@/src/utils/actionOrder';

/** The round action buttons on movie and TV show pages, in their default order. */
export const DETAIL_ACTION_BUTTON_IDS = [
  'list',
  'rating',
  'reminder',
  'note',
  'shareCard',
] as const;

export type DetailActionButtonId = (typeof DETAIL_ACTION_BUTTON_IDS)[number];

export const DEFAULT_DETAIL_ACTION_ORDER: readonly DetailActionButtonId[] =
  DETAIL_ACTION_BUTTON_IDS;

/**
 * The order to show the action buttons in, from a saved preference. Unknown or repeated ids are
 * dropped, and buttons the saved order doesn't mention (such as ones added in a later update)
 * keep their default place at the end, so any saved value gives every button exactly once.
 */
export function resolveDetailActionOrder(saved: unknown): DetailActionButtonId[] {
  return resolveActionOrder(saved, DEFAULT_DETAIL_ACTION_ORDER);
}

export function isDefaultDetailActionOrder(order: readonly DetailActionButtonId[]): boolean {
  return isDefaultActionOrder(order, DEFAULT_DETAIL_ACTION_ORDER);
}
