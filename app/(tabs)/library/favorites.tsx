import { COLORS } from '@/constants/theme';
import AddToListModal from '@/src/components/AddToListModal';
import { MediaGrid } from '@/src/components/library/MediaGrid';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { useLists } from '@/src/hooks/useLists';
import { ListMediaItem } from '@/src/services/ListService';
import * as Haptics from 'expo-haptics';
import { useRouter, useSegments } from 'expo-router';
import { Heart } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function FavoritesScreen() {
  const router = useRouter();
  const segments = useSegments();
  const { data: lists, isLoading } = useLists();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMediaItem, setSelectedMediaItem] = useState<Omit<ListMediaItem, 'addedAt'> | null>(
    null
  );
  const toastRef = useRef<ToastRef>(null);

  const favoritesList = useMemo(() => {
    return lists?.find((l) => l.id === 'favorites');
  }, [lists]);

  const listItems = useMemo(() => {
    if (!favoritesList?.items) return [];
    return Object.values(favoritesList.items).sort((a, b) => b.addedAt - a.addedAt);
  }, [favoritesList]);

  const handleItemPress = useCallback(
    (item: ListMediaItem) => {
      const currentTab = segments[1];
      const basePath = currentTab ? `/(tabs)/${currentTab}` : '';

      if (item.media_type === 'movie') {
        router.push(`${basePath}/movie/${item.id}` as any);
      } else {
        router.push(`${basePath}/tv/${item.id}` as any);
      }
    },
    [segments, router]
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

  return (
    <>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <MediaGrid
          items={listItems}
          isLoading={isLoading}
          emptyState={{
            icon: Heart,
            title: 'No Favorites Yet',
            description: 'Mark movies and TV shows as favorites to see them here.',
            actionLabel: 'Browse Content',
            onAction: () => router.push('/(tabs)/discover' as any),
          }}
          onItemPress={handleItemPress}
          onItemLongPress={handleLongPress}
        />
      </SafeAreaView>

      {selectedMediaItem && (
        <AddToListModal
          visible={modalVisible}
          onClose={handleCloseModal}
          mediaItem={selectedMediaItem}
          onShowToast={handleShowToast}
        />
      )}

      <Toast ref={toastRef} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
