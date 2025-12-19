import AddToListModal from '@/src/components/AddToListModal';
import ListActionsModal, { ListActionsModalRef } from '@/src/components/ListActionsModal';
import MediaSortModal, { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import RenameListModal, { RenameListModalRef } from '@/src/components/RenameListModal';
import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { MediaGrid, MediaGridRef } from '@/src/components/library/MediaGrid';
import Toast from '@/src/components/ui/Toast';
import { COLORS, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import { useAllGenres } from '@/src/hooks/useGenres';
import { useDeleteList, useLists } from '@/src/hooks/useLists';
import { useMediaGridHandlers } from '@/src/hooks/useMediaGridHandlers';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  filterMediaItems,
  hasActiveFilters,
  WatchStatusFilterState,
} from '@/src/utils/listFilters';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowUpDown,
  Bookmark,
  Pencil,
  Settings2,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

export default function CustomListDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: lists, isLoading } = useLists();
  const deleteMutation = useDeleteList();
  const { requireAuth, isAuthenticated, AuthGuardModal } = useAuthGuard();
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterState, setFilterState] = useState<WatchStatusFilterState>(
    DEFAULT_WATCH_STATUS_FILTERS
  );
  const renameModalRef = useRef<RenameListModalRef>(null);
  const mediaGridRef = useRef<MediaGridRef>(null);
  const listActionsModalRef = useRef<ListActionsModalRef>(null);

  // Fetch genre data for filter modal
  const { data: genreMap = {} } = useAllGenres();

  const {
    handleItemPress,
    handleLongPress,
    handleShowToast,
    addToListModalRef,
    selectedMediaItem,
    toastRef,
  } = useMediaGridHandlers(isLoading);

  const list = useMemo(() => {
    return lists?.find((l) => l.id === id);
  }, [lists, id]);

  const handleRenameList = useCallback(() => {
    if (!list) return;
    if (!isAuthenticated) {
      requireAuth(() => {}, 'Sign in to rename this list');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    renameModalRef.current?.present({ listId: id!, currentName: list.name });
  }, [list, id, isAuthenticated, requireAuth]);

  const listItems = useMemo(() => {
    if (!list?.items) return [];
    const items = Object.values(list.items);

    // Apply filters first
    const filteredItems = filterMediaItems(items, filterState);

    // Then apply sorting
    const sortedItems = [...filteredItems].sort((a, b) => {
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
          const titleA = (a.title || a.name || '').toLowerCase();
          const titleB = (b.title || b.name || '').toLowerCase();
          // Ascending: A-Z
          return titleA.localeCompare(titleB) * direction;
        }
        default:
          return 0;
      }
    });

    return sortedItems;
  }, [list, sortState, filterState]);

  const handleApplySort = (newSortState: SortState) => {
    setSortState(newSortState);
    setTimeout(() => {
      mediaGridRef.current?.scrollToTop();
    }, 100);
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
              // Navigation is handled by useEffect when list is no longer found
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

  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  const hasActiveFilterState = hasActiveFilters(filterState);

  const listActions = useMemo(
    () => [
      {
        id: 'filter',
        icon: SlidersHorizontal,
        label: 'Filter Items',
        onPress: () => setFilterModalVisible(true),
        showBadge: hasActiveFilterState,
      },
      {
        id: 'sort',
        icon: ArrowUpDown,
        label: 'Sort Items',
        onPress: () => setSortModalVisible(true),
        showBadge: hasActiveSort,
      },
      {
        id: 'rename',
        icon: Pencil,
        label: 'Rename List',
        onPress: handleRenameList,
      },
      {
        id: 'delete',
        icon: Trash2,
        label: 'Delete List',
        onPress: handleDeleteList,
        color: COLORS.error,
      },
    ],
    [hasActiveFilterState, hasActiveSort, handleRenameList, handleDeleteList]
  );

  // Navigate back if list is deleted
  useEffect(() => {
    if (!isLoading && lists && !list) {
      router.replace('/(tabs)/library/custom-lists');
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

  return (
    <>
      <Stack.Screen
        options={{
          title: list.name,
          headerRight: () => (
            <Pressable
              onPress={() => listActionsModalRef.current?.present()}
              accessibilityLabel="List options"
              accessibilityRole="button"
              hitSlop={HIT_SLOP.l}
              style={{ marginRight: SPACING.s }}
            >
              <Settings2 size={22} color={COLORS.text} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.divider} />

      <View style={styles.container}>
        <MediaGrid
          ref={mediaGridRef}
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
          ref={addToListModalRef}
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

      <WatchStatusFiltersModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filterState}
        onApplyFilters={(newFilters) => {
          setFilterState(newFilters);
          setFilterModalVisible(false);
          // Scroll to top after filter is applied
          setTimeout(() => {
            mediaGridRef.current?.scrollToTop();
          }, 100);
        }}
        genreMap={genreMap}
      />

      <Toast ref={toastRef} />
      {AuthGuardModal}
      <RenameListModal ref={renameModalRef} />
      <ListActionsModal ref={listActionsModalRef} actions={listActions} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: SPACING.m,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
