import AddToListModal from '@/src/components/AddToListModal';
import MediaSortModal, { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import { MediaGrid } from '@/src/components/library/MediaGrid';
import Toast from '@/src/components/ui/Toast';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import { useDeleteList, useLists } from '@/src/hooks/useLists';
import { useMediaGridHandlers } from '@/src/hooks/useMediaGridHandlers';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowUpDown, Bookmark, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function CustomListDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: lists, isLoading } = useLists();
  const deleteMutation = useDeleteList();
  const { requireAuth, isAuthenticated, AuthGuardModal } = useAuthGuard();
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);

  const {
    handleItemPress,
    handleLongPress,
    handleCloseModal,
    handleShowToast,
    modalVisible,
    selectedMediaItem,
    toastRef,
  } = useMediaGridHandlers(isLoading);

  const list = useMemo(() => {
    return lists?.find((l) => l.id === id);
  }, [lists, id]);

  const listItems = useMemo(() => {
    if (!list?.items) return [];
    const items = Object.values(list.items);

    // Apply sorting based on current sort state
    const sortedItems = [...items].sort((a, b) => {
      // Compute ascending comparison first, then negate for descending
      const direction = sortState.direction === 'asc' ? 1 : -1;

      switch (sortState.option) {
        case 'recentlyAdded':
          // Ascending: oldest first (a.addedAt - b.addedAt)
          return (a.addedAt - b.addedAt) * direction;
        case 'releaseDate': {
          // Movies use release_date, TV shows use first_air_date
          const dateA = a.release_date || a.first_air_date || '';
          const dateB = b.release_date || b.first_air_date || '';
          // Ascending: earliest date first
          return dateA.localeCompare(dateB) * direction;
        }
        case 'rating':
          // Ascending: lowest rating first
          return ((a.vote_average ?? 0) - (b.vote_average ?? 0)) * direction;
        case 'alphabetical': {
          // Movies use title, TV shows use name
          const titleA = a.title || a.name || '';
          const titleB = b.title || b.name || '';
          // Ascending: A-Z
          return titleA.localeCompare(titleB) * direction;
        }
        default:
          return 0;
      }
    });

    return sortedItems;
  }, [list, sortState]);

  const handleApplySort = (newSortState: SortState) => {
    setSortState(newSortState);
  };

  const handleDeleteList = useCallback(() => {
    if (!list || !id || deleteMutation.isPending) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete List',
      `This will remove "${list.name}" and all its items. This cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!isAuthenticated) {
              requireAuth(() => {}, 'Sign in to delete this list');
              return;
            }
            try {
              await deleteMutation.mutateAsync(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (error) {
              console.error('Failed to delete list:', error);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(
                'Delete Failed',
                error instanceof Error ? error.message : 'Failed to delete list'
              );
            }
          },
        },
      ]
    );
  }, [list, id, deleteMutation, router, requireAuth, isAuthenticated]);

  // Navigate back if list is deleted
  useEffect(() => {
    if (!isLoading && lists && !list) {
      router.back();
    }
  }, [isLoading, lists, list, router]);

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

  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  return (
    <>
      <Stack.Screen
        options={{
          title: list.name,
          headerRight: () => (
            <View style={styles.headerButtons}>
              <TouchableOpacity
                onPress={() => setSortModalVisible(true)}
                activeOpacity={ACTIVE_OPACITY}
                style={styles.headerButton}
                accessibilityLabel="Sort items"
                accessibilityRole="button"
                hitSlop={SPACING.s}
              >
                <ArrowUpDown size={22} color={COLORS.text} />
                {hasActiveSort && <View style={styles.sortBadge} />}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteList}
                style={styles.headerButton}
                activeOpacity={ACTIVE_OPACITY}
                accessibilityLabel="Delete list"
                accessibilityRole="button"
                hitSlop={SPACING.s}
              >
                <Trash2 size={22} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          ),
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

      <MediaSortModal
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        sortState={sortState}
        onApplySort={handleApplySort}
      />

      <Toast ref={toastRef} />
      {AuthGuardModal}
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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    marginRight: SPACING.s,
  },
  headerButton: {
    position: 'relative',
  },
  sortBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: SPACING.s,
    height: SPACING.s,
    borderRadius: SPACING.xs,
    backgroundColor: COLORS.primary,
  },
});
