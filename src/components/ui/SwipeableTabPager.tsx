import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

export interface SwipeableTabPagerRef {
  /** Scroll to the page for `key`. No-op for unknown keys. */
  goToKey: (key: string, animated?: boolean) => void;
}

interface SwipeableTabPagerProps<T extends string> {
  /** Ordered tab keys; position in the array is the page index. Keep stable. */
  tabs: ReadonlyArray<T>;
  /** Single source of truth for the active tab, owned by the parent. */
  activeKey: T;
  /** Called when a swipe settles on a different tab. Pill taps go through the parent directly. */
  onChange: (key: T) => void;
  /**
   * Render a page. Invoked only for tabs the user has visited — unvisited tabs
   * render an empty placeholder. `isActive` gates expensive per-page work
   * (queries, subscriptions, animations) so offscreen tabs cost nothing.
   */
  renderPage: (key: T, isActive: boolean) => React.ReactNode;
  /** Set false to lock swiping (e.g. while a page is in selection mode). */
  scrollEnabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Swipeable pager for tabbed content. Headless with respect to the tab bar —
 * works with `SegmentedControl`, `CategoryTabs`, or any control exposing
 * `activeKey`/`onChange`.
 *
 * Wiring pattern:
 *   const [tab, setTab] = useState(initial);
 *   const pagerRef = useRef<SwipeableTabPagerRef>(null);
 *   const handleTabChange = (key) => { setTab(key); pagerRef.current?.goToKey(key); };
 *   <TabBar activeKey={tab} onChange={handleTabChange} />
 *   <SwipeableTabPager ref={pagerRef} tabs={TABS} activeKey={tab}
 *     onChange={setTab} renderPage={renderPage} />
 *
 * Performance notes:
 * - Only visited tabs mount. First paint is a single page.
 * - The outer list never virtualizes (pages are cheap shells; inner lists own
 *   virtualization), so there is no remount churn when paging back.
 * - Sync is settle-only (`onMomentumScrollEnd`): no `onScroll` listener, no
 *   per-frame JS while swiping.
 *
 * Constraints:
 * - Pages must not contain same-axis (horizontal) scrollers — an inner
 *   horizontal list captures the gesture and breaks page swiping.
 * - `tabs` order defines page order; reordering remounts pages.
 */
function SwipeableTabPagerInner<T extends string>(
  {
    tabs,
    activeKey,
    onChange,
    renderPage,
    scrollEnabled = true,
    testID,
    style,
  }: SwipeableTabPagerProps<T>,
  ref: React.Ref<SwipeableTabPagerRef>
) {
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<T>>(null);

  const activeIndex = Math.max(0, tabs.indexOf(activeKey));

  // Tabs the user has visited. Unvisited tabs render an empty placeholder so
  // their content (and data fetching) never loads until focused.
  const [visited, setVisited] = useState<ReadonlySet<T>>(() => new Set([activeKey]));
  useEffect(() => {
    setVisited((prev) => (prev.has(activeKey) ? prev : new Set(prev).add(activeKey)));
  }, [activeKey]);

  const goToKey = useCallback(
    (key: string, animated = true) => {
      const index = (tabs as ReadonlyArray<string>).indexOf(key);
      if (index < 0) return;
      setVisited((prev) =>
        prev.has(key as T) ? prev : new Set(prev).add(key as T)
      );
      listRef.current?.scrollToIndex({ index, animated });
    },
    [tabs]
  );

  useImperativeHandle(ref, () => ({ goToKey }), [goToKey]);

  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / width);
      const key = tabs[index];
      if (key !== undefined && key !== activeKey) {
        onChange(key);
      }
    },
    [tabs, width, activeKey, onChange]
  );

  const handleScrollToIndexFailed = useCallback(
    (info: { index: number }) => {
      listRef.current?.scrollToOffset({ offset: info.index * width, animated: false });
    },
    [width]
  );

  // Keep the active page aligned across rotations (ref mirror: must not
  // re-run on tab changes, which have their own animated scroll).
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  useEffect(() => {
    listRef.current?.scrollToIndex({ index: activeIndexRef.current, animated: false });
  }, [width]);

  const renderItem = useCallback(
    ({ item: key }: { item: T }) => {
      if (!visited.has(key)) {
        return <View style={{ width }} />;
      }
      return <View style={{ width }}>{renderPage(key, key === activeKey)}</View>;
    },
    [visited, width, renderPage, activeKey]
  );

  return (
    <FlatList
      ref={listRef}
      testID={testID}
      style={[styles.pager, style]}
      data={tabs as T[]}
      horizontal
      pagingEnabled
      bounces={false}
      overScrollMode="never"
      showsHorizontalScrollIndicator={false}
      scrollEnabled={scrollEnabled}
      keyExtractor={(key) => key}
      initialScrollIndex={activeIndex}
      getItemLayout={(_, index) => ({
        length: width,
        offset: width * index,
        index,
      })}
      onScrollToIndexFailed={handleScrollToIndexFailed}
      onMomentumScrollEnd={handleMomentumScrollEnd}
      removeClippedSubviews={false}
      renderItem={renderItem}
    />
  );
}

export const SwipeableTabPager = forwardRef(SwipeableTabPagerInner) as <T extends string>(
  props: SwipeableTabPagerProps<T> & { ref?: React.Ref<SwipeableTabPagerRef> }
) => React.ReactElement;

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
});
