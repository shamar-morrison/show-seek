import { FlashList, type FlashListProps, type FlashListRef } from '@shopify/flash-list';
import React from 'react';

export { HORIZONTAL_FLASH_LIST_PROPS, HORIZONTAL_SCROLL_PROPS } from './horizontalScrollProps';

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
  const { ref, ...rest } = props;
  return (
    <FlashList
      showsHorizontalScrollIndicator={false}
      {...(rest as FlashListProps<T>)}
      ref={ref}
      horizontal
      bounces={false}
      alwaysBounceHorizontal={false}
      overScrollMode="never"
    />
  );
}
