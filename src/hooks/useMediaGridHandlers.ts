import { ToastRef } from '@/src/components/ui/Toast';
import { useCurrentTab } from '@/src/context/TabContext';
import { ListMediaItem } from '@/src/services/ListService';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

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
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMediaItem, setSelectedMediaItem] = useState<Omit<ListMediaItem, 'addedAt'> | null>(
    null
  );
  const toastRef = useRef<ToastRef>(null);

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
      setModalVisible(true);
    },
    [isLoading]
  );

  const handleCloseModal = useCallback(() => {
    setModalVisible(false);
    setSelectedMediaItem(null);
  }, []);

  const handleShowToast = useCallback((message: string) => {
    toastRef.current?.show(message);
  }, []);

  return {
    handleItemPress,
    handleLongPress,
    handleCloseModal,
    handleShowToast,
    modalVisible,
    selectedMediaItem,
    toastRef,
  };
}
