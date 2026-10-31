import { SPACING } from '@/src/constants/theme';
import { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Preferred list height as a fraction of the window height. */
const LIST_HEIGHT_RATIO = 0.4;
/** Never shrink the list below roughly two rows, even on very small screens. */
const MIN_LIST_HEIGHT = 120;

/**
 * Sizes the scrollable list inside an `'auto'` detent TrueSheet so the whole sheet
 * (header, list and action buttons) always fits on screen.
 *
 * The non-list content ("chrome") is measured rather than estimated, so font scaling,
 * banners and differing system inset sizes across Android devices are accounted for.
 * The list also never shrinks while the sheet is open (e.g. while filtering), which
 * keeps the sheet from jumping around; call `resetListHeight` when presenting.
 */
export function useSheetListHeight() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layoutRef = useRef({ content: 0, list: 0 });
  const [chromeHeight, setChromeHeight] = useState(0);
  const [listContentHeight, setListContentHeight] = useState(0);

  const updateChromeHeight = useCallback(() => {
    const { content, list } = layoutRef.current;
    if (content > 0) {
      setChromeHeight(Math.max(0, content - list));
    }
  }, []);

  const onContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      layoutRef.current.content = event.nativeEvent.layout.height;
      updateChromeHeight();
    },
    [updateChromeHeight]
  );

  const onListLayout = useCallback(
    (event: LayoutChangeEvent) => {
      layoutRef.current.list = event.nativeEvent.layout.height;
      updateChromeHeight();
    },
    [updateChromeHeight]
  );

  const onListContentSizeChange = useCallback((_width: number, contentHeight: number) => {
    setListContentHeight((current) => Math.max(current, contentHeight));
  }, []);

  const resetListHeight = useCallback(() => {
    setListContentHeight(0);
  }, []);

  const availableHeight = height - insets.top - insets.bottom - SPACING.xl - chromeHeight;
  const maxHeight = Math.max(
    MIN_LIST_HEIGHT,
    Math.min(height * LIST_HEIGHT_RATIO, availableHeight)
  );
  const minHeight = Math.min(listContentHeight, maxHeight);

  return {
    listStyle: { maxHeight, minHeight },
    onContentLayout,
    onListLayout,
    onListContentSizeChange,
    resetListHeight,
  };
}
