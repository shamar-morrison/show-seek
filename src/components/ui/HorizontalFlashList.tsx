import { FlashList, type FlashListProps, type FlashListRef } from '@shopify/flash-list';
import React from 'react';
import { StyleSheet } from 'react-native';
import { HORIZONTAL_LIST_CONTENT_STYLE } from './horizontalScrollProps';

export {
  HORIZONTAL_FLASH_LIST_PROPS,
  HORIZONTAL_LIST_CARD_GAP,
  HORIZONTAL_LIST_CONTENT_STYLE,
  HORIZONTAL_LIST_EDGE_INSET,
  HORIZONTAL_SCROLL_PROPS,
} from './horizontalScrollProps';

/**
 * Props enforced on every horizontal carousel to prevent edge overscroll
 * from swallowing the first tap.
 *
 * - `bounces={false}` (iOS) + `overScrollMode="never"` (Android) eliminate the
 *   end-of-list overshoot + spring-back. During that spring-back window the
 *   native ScrollView consumes the first touch to settle the list, so
 *   `onPress` never fires and users have to tap twice.
 * - `alwaysBounceHorizontal={false}` covers short lists that don't fill the viewport.
 *
 * `decelerationRate` is intentionally left at the RN default (`normal`) to
 * preserve the original fling distance / scroll speed.
 *
 * Trailing inset is normalized via `HORIZONTAL_LIST_CONTENT_STYLE`: carousel
 * cards keep `marginRight: SPACING.m`, so `paddingRight` is compensated to
 * `SPACING.l - SPACING.m` and the final item ends flush with the leading inset.
 * An explicit caller `paddingRight` still wins (escape hatch). Relies on RN
 * resolving a specific `paddingRight` over a general `paddingHorizontal`.
 *
 * Verified against @shopify/flash-list 2.2.0: FlashListProps extends
 * ScrollViewProps and RecyclerView forwards `...rest` to the underlying
 * Animated.ScrollView, so these props reach native.
 */

export type HorizontalFlashListProps<T> = Omit<
  FlashListProps<T>,
  'horizontal' | 'bounces' | 'alwaysBounceHorizontal' | 'overScrollMode'
> & {
  ref?: React.Ref<FlashListRef<T>>;
};

/**
 * Drop-in replacement for `<FlashList horizontal ... />` used by carousels.
 * Enforces anti-overscroll props so a hard fling to the end can't leave the
 * list in a bouncing state that eats the next tap.
 */
export function HorizontalFlashList<T>(props: HorizontalFlashListProps<T>) {
  const { ref, contentContainerStyle, ...rest } = props;
  const mergedContentContainerStyle = React.useMemo(
    () => ({
      ...HORIZONTAL_LIST_CONTENT_STYLE,
      ...StyleSheet.flatten(contentContainerStyle),
    }),
    [contentContainerStyle]
  );
  return (
    <FlashList
      showsHorizontalScrollIndicator={false}
      {...(rest as FlashListProps<T>)}
      ref={ref}
      horizontal
      bounces={false}
      alwaysBounceHorizontal={false}
      overScrollMode="never"
      contentContainerStyle={mergedContentContainerStyle}
    />
  );
}
