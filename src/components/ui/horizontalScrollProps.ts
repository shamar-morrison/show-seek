/**
 * Shared anti-overscroll tuning for horizontal carousels.
 *
 * Kept in a dependency-free module (no FlashList import) so plain
 * horizontal ScrollViews can use it without pulling `@shopify/flash-list`
 * into their module graph (keeps Jest without a FlashList mock working).
 *
 * Note: `decelerationRate` is intentionally not enforced so fling distance
 * stays at the RN default (`normal`), preserving the original scroll speed.
 */
export const HORIZONTAL_SCROLL_PROPS = {
  horizontal: true,
  bounces: false,
  alwaysBounceHorizontal: false,
  overScrollMode: 'never',
} as const;

export const HORIZONTAL_FLASH_LIST_PROPS = HORIZONTAL_SCROLL_PROPS;
