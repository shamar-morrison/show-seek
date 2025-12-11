import AddToListModal from '@/src/components/AddToListModal';
import { MediaGrid } from '@/src/components/library/MediaGrid';
import Toast from '@/src/components/ui/Toast';
import { DEFAULT_LIST_IDS } from '@/src/constants/lists';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useLists } from '@/src/hooks/useLists';
import { useMediaGridHandlers } from '@/src/hooks/useMediaGridHandlers';
import { useRouter } from 'expo-router';
import { Heart } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function FavoritesScreen() {
  const router = useRouter();
  const { data: lists, isLoading } = useLists();

  const {
    handleItemPress,
    handleLongPress,
    handleShowToast,
    addToListModalRef,
    selectedMediaItem,
    toastRef,
  } = useMediaGridHandlers(isLoading);

  const favoritesList = useMemo(() => {
    return lists?.find((l) => l.id === DEFAULT_LIST_IDS[3]);
  }, [lists]);

  const listItems = useMemo(() => {
    if (!favoritesList?.items) return [];
    return Object.values(favoritesList.items).sort((a, b) => b.addedAt - a.addedAt);
  }, [favoritesList]);

  return (
    <>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <View style={styles.content}>
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
        </View>
      </SafeAreaView>

      {selectedMediaItem && (
        <AddToListModal
          ref={addToListModalRef}
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
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  content: {
    flex: 1,
    paddingTop: SPACING.m,
  },
});
