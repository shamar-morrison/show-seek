import { AddToListModalRef } from '@/src/components/AddToListModal';
import { ToastRef } from '@/src/components/ui/Toast';
import { useCurrentTab } from '@/src/context/TabContext';
import { ListMediaItem } from '@/src/services/ListService';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Custom hook that provides shared handlers for media grid interactions.
 * Encapsulates tab-aware navigation, modal management, and toast notifications.
 *
 * @param isLoading - Whether the parent component is in a loading state
 * @returns Object containing handlers and state for media grid interactions
 */
export function useMediaGridHandlers(isLoading: boolean) {
  const router = useRouter();
  const currentTab = useCurrentTab();
  const [selectedItems, setSelectedItems] = useState<Record<string, ListMediaItem>>({});
  const toastRef = useRef<ToastRef>(null);
  const addToListModalRef = useRef<AddToListModalRef>(null);

  const getItemKey = useCallback((item: Pick<ListMediaItem, 'id' | 'media_type'>) => {
    return `${item.id}-${item.media_type}`;
  }, []);

  const toggleSelection = useCallback(
    (item: ListMediaItem) => {
      const itemKey = getItemKey(item);

      setSelectedItems((prev) => {
        const next = { ...prev };

        if (next[itemKey]) {
          delete next[itemKey];
          return next;
        }

        next[itemKey] = item;
        return next;
      });
    },
    [getItemKey]
  );

  const isSelectionMode = Object.keys(selectedItems).length > 0;

  const handleItemPress = useCallback(
    (item: ListMediaItem) => {
      if (isSelectionMode) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleSelection(item);
        return;
      }

      if (!currentTab) {
        console.warn('Cannot navigate: currentTab is null');
        return;
      }

      const basePath = `/(tabs)/${currentTab}`;

      if (item.media_type === 'movie') {
        router.push(`${basePath}/movie/${item.id}` as any);
      } else {
        router.push(`${basePath}/tv/${item.id}` as any);
      }
    },
    [currentTab, isSelectionMode, router, toggleSelection]
  );

  const handleLongPress = useCallback(
    (item: ListMediaItem) => {
      if (isLoading) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      toggleSelection(item);
    },
    [isLoading, toggleSelection]
  );

  const selectedMediaItems = useMemo(
    () =>
      Object.values(selectedItems).map((item) => {
        const { addedAt: _addedAt, ...mediaItem } = item;
        return mediaItem;
      }),
    [selectedItems]
  );

  const selectedCount = selectedMediaItems.length;

  const isItemSelected = useCallback(
    (item: ListMediaItem) => {
      const itemKey = getItemKey(item);
      return !!selectedItems[itemKey];
    },
    [getItemKey, selectedItems]
  );

  const clearSelection = useCallback(() => {
    setSelectedItems({});
  }, []);

  const handleShowToast = useCallback((message: string) => {
    toastRef.current?.show(message);
  }, []);

  return {
    handleItemPress,
    handleLongPress,
    handleShowToast,
    addToListModalRef,
    selectedMediaItems,
    selectedCount,
    isSelectionMode,
    isItemSelected,
    clearSelection,
    toastRef,
  };
}
