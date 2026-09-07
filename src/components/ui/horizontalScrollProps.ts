import { SPACING } from '@/src/constants/theme';

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

/**
 * Leading inset shared by section titles and carousel items.
 */
export const HORIZONTAL_LIST_EDGE_INSET = SPACING.l;

/**
 * Inter-card gap used by horizontal carousel cards (`marginRight: SPACING.m`).
 */
export const HORIZONTAL_LIST_CARD_GAP = SPACING.m;

/**
 * Content-container inset that keeps the trailing edge uniform.
 *
 * Carousel cards keep `marginRight: SPACING.m`, so a symmetric
 * `paddingHorizontal: SPACING.l` container ends with
 * `SPACING.l + SPACING.m` of trailing space versus `SPACING.l` leading.
 * Compensating `paddingRight` (`SPACING.l - SPACING.m`) restores symmetry:
 * trailing = `(SPACING.l - SPACING.m) + SPACING.m = SPACING.l`.
 */
export const HORIZONTAL_LIST_CONTENT_STYLE = {
  paddingLeft: SPACING.l,
  paddingRight: SPACING.l - SPACING.m,
} as const;
