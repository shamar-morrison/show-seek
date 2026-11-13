/**
 * Saved orders of a screen's action buttons. A saved order is resolved against the screen's
 * full list of buttons: unknown or repeated ids are dropped, and buttons the saved order doesn't
 * mention (such as ones added in a later update) keep their default place at the end, so any
 * saved value gives every button exactly once.
 */
export function resolveActionOrder<Id extends string>(
  saved: unknown,
  defaultOrder: readonly Id[]
): Id[] {
  const order: Id[] = [];
  if (Array.isArray(saved)) {
    for (const id of saved) {
      if (typeof id === 'string' && (defaultOrder as readonly string[]).includes(id)) {
        if (!order.includes(id as Id)) order.push(id as Id);
      }
    }
  }
  for (const id of defaultOrder) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

export function isDefaultActionOrder<Id extends string>(
  order: readonly Id[],
  defaultOrder: readonly Id[]
): boolean {
  return (
    order.length === defaultOrder.length && order.every((id, index) => id === defaultOrder[index])
  );
}
