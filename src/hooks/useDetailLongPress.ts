import { AddToListModalRef } from '@/src/components/AddToListModal';
import { SimilarMediaItem } from '@/src/components/detail/types';
import { useAuth } from '@/src/context/auth';
import { useGuestAccess } from '@/src/context/GuestAccessContext';
import { ToastRef } from '@/src/components/ui/Toast';
import { ListMediaItem } from '@/src/services/ListService';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Custom hook that provides long-press handlers for detail screen media sections.
 * Used for similar media and recommendations sections to show the AddToListModal.
 *
 * @param mediaType - The type of media ('movie' or 'tv')
 * @returns Object containing handlers and state for long-press interactions
 */
export function useDetailLongPress(mediaType: 'movie' | 'tv') {
  const { user, isGuest } = useAuth();
  const { requireAccount } = useGuestAccess();
  const [selectedMediaItem, setSelectedMediaItem] = useState<Omit<ListMediaItem, 'addedAt'> | null>(
    null
  );
  const toastRef = useRef<ToastRef>(null);
  const addToListModalRef = useRef<AddToListModalRef>(null);

  /**
   * Converts a SimilarMediaItem to the ListMediaItem format required by AddToListModal
   */
  const convertToListMediaItem = useCallback(
    (item: SimilarMediaItem): Omit<ListMediaItem, 'addedAt'> => ({
      id: item.id,
      media_type: mediaType,
      title: item.title || item.name || '',
      name: item.name,
      poster_path: item.poster_path,
      release_date: item.release_date || item.first_air_date || '',
      first_air_date: item.first_air_date,
      vote_average: item.vote_average,
    }),
    [mediaType]
  );

  const handleLongPress = useCallback(
    (item: SimilarMediaItem) => {
      if (!user || isGuest) {
        requireAccount();
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const mediaItem = convertToListMediaItem(item);
      setSelectedMediaItem(mediaItem);
    },
    [convertToListMediaItem, isGuest, requireAccount, user]
  );

  // Present the modal when an item is selected
  useEffect(() => {
    if (selectedMediaItem) {
      addToListModalRef.current?.present();
    }
  }, [selectedMediaItem]);

  const handleShowToast = useCallback((message: string) => {
    toastRef.current?.show(message);
  }, []);

  return {
    handleLongPress,
    handleShowToast,
    addToListModalRef,
    selectedMediaItem,
    toastRef,
  };
}
