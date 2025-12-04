import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/constants/theme';
import AddToListModal from '@/src/components/AddToListModal';
import { MediaGrid } from '@/src/components/library/MediaGrid';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { WATCH_STATUS_LISTS } from '@/src/constants/lists';
import { useCurrentTab } from '@/src/context/TabContext';
import { useLists } from '@/src/hooks/useLists';
import { ListMediaItem } from '@/src/services/ListService';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Bookmark } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WatchStatusScreen() {
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { data: lists, isLoading } = useLists();
  const [selectedListId, setSelectedListId] = useState<string>('watchlist');
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedMediaItem, setSelectedMediaItem] = useState<Omit<ListMediaItem, 'addedAt'> | null>(
    null
  );
  const toastRef = useRef<ToastRef>(null);

  const selectedList = useMemo(() => {
    return lists?.find((l) => l.id === selectedListId);
  }, [lists, selectedListId]);

  const listItems = useMemo(() => {
    if (!selectedList?.items) return [];
    return Object.values(selectedList.items).sort((a, b) => b.addedAt - a.addedAt);
  }, [selectedList]);

  const handleItemPress = useCallback(
    (item: ListMediaItem) => {
      const basePath = currentTab ? `/(tabs)/${currentTab}` : '';

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

  return (
    <>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.tabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
          >
            {WATCH_STATUS_LISTS.map((list) => (
              <TouchableOpacity
                key={list.id}
                style={[styles.tab, selectedListId === list.id && styles.activeTab]}
                onPress={() => setSelectedListId(list.id)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={[styles.tabText, selectedListId === list.id && styles.activeTabText]}>
                  {list.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.content}>
          <MediaGrid
            items={listItems}
            isLoading={isLoading}
            emptyState={{
              icon: Bookmark,
              title: 'No items yet',
              description: `Add movies and TV shows to your ${selectedList?.name?.toLowerCase() ?? 'watch'} list to see them here.`,
              actionLabel: 'Browse Content',
              onAction: () => router.push('/(tabs)/discover' as any),
            }}
            onItemPress={handleItemPress}
            onItemLongPress={handleLongPress}
          />
        </View>
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
  tabsContainer: {
    paddingTop: SPACING.m,
    marginBottom: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  tabsContent: {
    paddingHorizontal: SPACING.l,
    gap: SPACING.m,
    paddingBottom: SPACING.m,
  },
  tab: {
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
  },
  activeTab: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  activeTabText: {
    color: COLORS.white,
  },
  content: {
    flex: 1,
  },
});
