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

const isDetailActionButtonId = (value: unknown): value is DetailActionButtonId =>
  typeof value === 'string' && (DETAIL_ACTION_BUTTON_IDS as readonly string[]).includes(value);

/**
 * The order to show the action buttons in, from a saved preference. Unknown or repeated ids are
 * dropped, and buttons the saved order doesn't mention (such as ones added in a later update)
 * keep their default place at the end, so any saved value gives every button exactly once.
 */
export function resolveDetailActionOrder(saved: unknown): DetailActionButtonId[] {
  const order: DetailActionButtonId[] = [];
  if (Array.isArray(saved)) {
    for (const id of saved) {
      if (isDetailActionButtonId(id) && !order.includes(id)) order.push(id);
    }
  }
  for (const id of DEFAULT_DETAIL_ACTION_ORDER) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

export function isDefaultDetailActionOrder(order: readonly DetailActionButtonId[]): boolean {
  return (
    order.length === DEFAULT_DETAIL_ACTION_ORDER.length &&
    order.every((id, index) => id === DEFAULT_DETAIL_ACTION_ORDER[index])
  );
}
