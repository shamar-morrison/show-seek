import { AddToListModalRef } from '@/src/components/AddToListModal';
import { ToastRef } from '@/src/components/ui/Toast';
import { useCurrentTab } from '@/src/context/TabContext';
import { ListMediaItem } from '@/src/services/ListService';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [selectedMediaItem, setSelectedMediaItem] = useState<Omit<ListMediaItem, 'addedAt'> | null>(
    null
  );
  const toastRef = useRef<ToastRef>(null);
  const addToListModalRef = useRef<AddToListModalRef>(null);

  const handleItemPress = useCallback(
    (item: ListMediaItem) => {
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
    [currentTab, router]
  );

  const handleLongPress = useCallback(
    (item: ListMediaItem) => {
      if (isLoading) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { addedAt: _addedAt, ...mediaItem } = item;
      setSelectedMediaItem(mediaItem);
    },
    [isLoading]
  );

  // Present the modal when an item is selected
  // This uses useEffect to ensure the modal is mounted (if conditionally rendered)
  // before we try to present it
  useEffect(() => {
    if (selectedMediaItem) {
      addToListModalRef.current?.present();
    }
  }, [selectedMediaItem]);

  const handleShowToast = useCallback((message: string) => {
    toastRef.current?.show(message);
  }, []);

  return {
    handleItemPress,
    handleLongPress,
    handleShowToast,
    addToListModalRef,
    selectedMediaItem,
    toastRef,
  };
}
