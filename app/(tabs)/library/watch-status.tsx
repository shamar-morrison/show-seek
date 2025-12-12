import AddToListModal from '@/src/components/AddToListModal';
import MediaSortModal, { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { MediaGrid, MediaGridRef } from '@/src/components/library/MediaGrid';
import { MediaListCard } from '@/src/components/library/MediaListCard';
import Toast from '@/src/components/ui/Toast';
import { WATCH_STATUS_LISTS } from '@/src/constants/lists';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import { useAllGenres } from '@/src/hooks/useGenres';
import { useLists } from '@/src/hooks/useLists';
import { useMediaGridHandlers } from '@/src/hooks/useMediaGridHandlers';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  filterMediaItems,
  hasActiveFilters,
  WatchStatusFilterState,
} from '@/src/utils/listFilters';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { ArrowUpDown, Bookmark, Grid3X3, List, SlidersHorizontal } from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const VIEW_MODE_STORAGE_KEY = 'watch_status_view_mode';

type ViewMode = 'grid' | 'list';

export default function WatchStatusScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { data: lists, isLoading } = useLists();
  const { data: genreMap } = useAllGenres();
  const [selectedListId, setSelectedListId] = useState<string>('watchlist');
  const [filters, setFilters] = useState<WatchStatusFilterState>(DEFAULT_WATCH_STATUS_FILTERS);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const mediaGridRef = useRef<MediaGridRef>(null);
  const listRef = useRef<FlatList>(null);

  const {
    handleItemPress,
    handleLongPress,
    handleShowToast,
    addToListModalRef,
    selectedMediaItem,
    toastRef,
  } = useMediaGridHandlers(isLoading);

  const selectedList = useMemo(() => {
    return lists?.find((l) => l.id === selectedListId);
  }, [lists, selectedListId]);

  const listItems = useMemo(() => {
    if (!selectedList?.items) return [];
    const items = Object.values(selectedList.items);

    // Apply sorting based on current sort state
    const sortedItems = [...items].sort((a, b) => {
      // Compute ascending comparison first, then negate for descending
      const direction = sortState.direction === 'asc' ? 1 : -1;

      switch (sortState.option) {
        case 'recentlyAdded':
          // Ascending: oldest first (a.addedAt - b.addedAt)
          return (a.addedAt - b.addedAt) * direction;
        case 'releaseDate': {
          const dateA = a.release_date || '';
          const dateB = b.release_date || '';
          // Ascending: earliest date first
          return dateA.localeCompare(dateB) * direction;
        }
        case 'rating':
          // Ascending: lowest rating first
          return ((a.vote_average ?? 0) - (b.vote_average ?? 0)) * direction;
        case 'alphabetical':
          // Ascending: A-Z
          return a.title.localeCompare(b.title) * direction;
        default:
          return 0;
      }
    });

    return sortedItems;
  }, [selectedList, sortState]);

  const filteredItems = useMemo(() => {
    return filterMediaItems(listItems, filters);
  }, [listItems, filters]);

  const handleApplyFilters = (newFilters: WatchStatusFilterState) => {
    setFilters(newFilters);
    setFilterModalVisible(false);
  };

  const handleApplySort = (newSortState: SortState) => {
    setSortState(newSortState);
    // Scroll to top after sort is applied
    setTimeout(() => {
      if (viewMode === 'grid') {
        mediaGridRef.current?.scrollToTop();
      } else {
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    }, 100);
  };

  // Load view mode preference on mount
  useEffect(() => {
    const loadViewMode = async () => {
      try {
        const saved = await AsyncStorage.getItem(VIEW_MODE_STORAGE_KEY);
        if (saved === 'grid' || saved === 'list') {
          setViewMode(saved);
        }
      } catch (error) {
        console.error('Failed to load view mode preference:', error);
      }
    };
    loadViewMode();
  }, []);

  // Toggle view mode and persist preference
  const toggleViewMode = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newMode: ViewMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(newMode);
    try {
      await AsyncStorage.setItem(VIEW_MODE_STORAGE_KEY, newMode);
    } catch (error) {
      console.error('Failed to save view mode preference:', error);
    }
  }, [viewMode]);

  // Add view toggle, filter and sort buttons to header
  useLayoutEffect(() => {
    const activeFilters = hasActiveFilters(filters);
    const hasActiveSort = sortState.option !== 'recentlyAdded' || sortState.direction !== 'desc';

    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          {/* View Mode Toggle */}
          <TouchableOpacity
            onPress={toggleViewMode}
            activeOpacity={ACTIVE_OPACITY}
            hitSlop={HIT_SLOP.m}
          >
            {viewMode === 'grid' ? (
              <List size={24} color={COLORS.text} />
            ) : (
              <Grid3X3 size={24} color={COLORS.text} />
            )}
          </TouchableOpacity>
          {/* Sort Modal */}
          <TouchableOpacity
            onPress={() => setSortModalVisible(true)}
            activeOpacity={ACTIVE_OPACITY}
            style={styles.headerButton}
          >
            <ArrowUpDown size={24} color={COLORS.text} />
            {hasActiveSort && <View style={styles.filterBadge} />}
          </TouchableOpacity>
          {/* Filter Modal */}
          <TouchableOpacity
            onPress={() => setFilterModalVisible(true)}
            activeOpacity={ACTIVE_OPACITY}
            style={styles.headerButton}
          >
            <SlidersHorizontal size={24} color={COLORS.text} />
            {activeFilters && <View style={styles.filterBadge} />}
          </TouchableOpacity>
        </View>
      ),
    });
  }, [filters, navigation, sortState, viewMode, toggleViewMode]);

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
          {viewMode === 'list' ? (
            <FlatList
              ref={listRef}
              data={filteredItems}
              keyExtractor={(item) => `${item.media_type}-${item.id}`}
              renderItem={({ item }) => (
                <MediaListCard
                  item={item}
                  onPress={handleItemPress}
                  onLongPress={handleLongPress}
                />
              )}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                !isLoading ? (
                  <View style={styles.emptyContainer}>
                    <Bookmark size={48} color={COLORS.textSecondary} />
                    <Text style={styles.emptyTitle}>
                      {hasActiveFilters(filters) && listItems.length > 0
                        ? 'No items match your filters'
                        : 'No items yet'}
                    </Text>
                    <Text style={styles.emptyDescription}>
                      {hasActiveFilters(filters) && listItems.length > 0
                        ? 'Try adjusting your filters to see more items.'
                        : `Add movies and TV shows to your ${selectedList?.name?.toLowerCase() ?? 'watch'} list to see them here.`}
                    </Text>
                    <TouchableOpacity
                      style={styles.emptyButton}
                      onPress={
                        hasActiveFilters(filters) && listItems.length > 0
                          ? () => setFilters(DEFAULT_WATCH_STATUS_FILTERS)
                          : () => router.push('/(tabs)/discover' as any)
                      }
                      activeOpacity={ACTIVE_OPACITY}
                    >
                      <Text style={styles.emptyButtonText}>
                        {hasActiveFilters(filters) && listItems.length > 0
                          ? 'Clear Filters'
                          : 'Browse Content'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
            />
          ) : (
            <MediaGrid
              ref={mediaGridRef}
              items={filteredItems}
              isLoading={isLoading}
              emptyState={{
                icon: Bookmark,
                title:
                  hasActiveFilters(filters) && listItems.length > 0
                    ? 'No items match your filters'
                    : 'No items yet',
                description:
                  hasActiveFilters(filters) && listItems.length > 0
                    ? 'Try adjusting your filters to see more items.'
                    : `Add movies and TV shows to your ${selectedList?.name?.toLowerCase() ?? 'watch'} list to see them here.`,
                actionLabel:
                  hasActiveFilters(filters) && listItems.length > 0
                    ? 'Clear Filters'
                    : 'Browse Content',
                onAction:
                  hasActiveFilters(filters) && listItems.length > 0
                    ? () => setFilters(DEFAULT_WATCH_STATUS_FILTERS)
                    : () => router.push('/(tabs)/discover' as any),
              }}
              onItemPress={handleItemPress}
              onItemLongPress={handleLongPress}
            />
          )}
        </View>
      </SafeAreaView>

      {selectedMediaItem && (
        <AddToListModal
          ref={addToListModalRef}
          mediaItem={selectedMediaItem}
          onShowToast={handleShowToast}
        />
      )}

      <WatchStatusFiltersModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filters}
        onApplyFilters={handleApplyFilters}
        genreMap={genreMap || {}}
      />

      <MediaSortModal
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        sortState={sortState}
        onApplySort={handleApplySort}
      />

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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
    marginRight: SPACING.m,
  },
  headerButton: {
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingBottom: SPACING.xl,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxl,
    gap: SPACING.m,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginTop: SPACING.m,
  },
  emptyDescription: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginTop: SPACING.m,
  },
  emptyButtonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.white,
  },
});
