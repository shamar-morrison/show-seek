import { COLORS } from '@/constants/theme';
import AddToListModal from '@/src/components/AddToListModal';
import { MediaGrid } from '@/src/components/library/MediaGrid';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { useLists } from '@/src/hooks/useLists';
import { ListMediaItem } from '@/src/services/ListService';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { Bookmark } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export default function CustomListDetailScreen() {
  const router = useRouter();
  const segments = useSegments();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: lists, isLoading } = useLists();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMediaItem, setSelectedMediaItem] = useState<Omit<ListMediaItem, 'addedAt'> | null>(
    null
  );
  const toastRef = useRef<ToastRef>(null);

  const list = useMemo(() => {
    return lists?.find((l) => l.id === id);
  }, [lists, id]);

  const listItems = useMemo(() => {
    if (!list?.items) return [];
    return Object.values(list.items).sort((a, b) => b.addedAt - a.addedAt);
  }, [list]);

  // Navigate back if list is deleted
  useEffect(() => {
    if (!isLoading && lists && !list) {
      router.back();
    }
  }, [isLoading, lists, list, router]);

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

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!list) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: list.name,
        }}
      />

      <View style={styles.container}>
        <MediaGrid
          items={listItems}
          isLoading={isLoading}
          emptyState={{
            icon: Bookmark,
            title: 'No items yet',
            description: `Add movies and TV shows to this list to see them here.`,
            actionLabel: 'Browse Content',
            onAction: () => router.push('/(tabs)/discover' as any),
          }}
          onItemPress={handleItemPress}
          onItemLongPress={handleLongPress}
        />
      </View>

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
