import AddToListModal from '@/src/components/AddToListModal';
import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { MediaGrid } from '@/src/components/library/MediaGrid';
import Toast from '@/src/components/ui/Toast';
import { WATCH_STATUS_LISTS } from '@/src/constants/lists';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAllGenres } from '@/src/hooks/useGenres';
import { useLists } from '@/src/hooks/useLists';
import { useMediaGridHandlers } from '@/src/hooks/useMediaGridHandlers';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  filterMediaItems,
  hasActiveFilters,
  WatchStatusFilterState,
} from '@/src/utils/listFilters';
import { useNavigation, useRouter } from 'expo-router';
import { Bookmark, SlidersHorizontal } from 'lucide-react-native';
import React, { useLayoutEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WatchStatusScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { data: lists, isLoading } = useLists();
  const { data: genreMap } = useAllGenres();
  const [selectedListId, setSelectedListId] = useState<string>('watchlist');
  const [filters, setFilters] = useState<WatchStatusFilterState>(DEFAULT_WATCH_STATUS_FILTERS);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  const {
    handleItemPress,
    handleLongPress,
    handleCloseModal,
    handleShowToast,
    modalVisible,
    selectedMediaItem,
    toastRef,
  } = useMediaGridHandlers(isLoading);

  const selectedList = useMemo(() => {
    return lists?.find((l) => l.id === selectedListId);
  }, [lists, selectedListId]);

  const listItems = useMemo(() => {
    if (!selectedList?.items) return [];
    return Object.values(selectedList.items).sort((a, b) => b.addedAt - a.addedAt);
  }, [selectedList]);

  const filteredItems = useMemo(() => {
    return filterMediaItems(listItems, filters);
  }, [listItems, filters]);

  const handleApplyFilters = (newFilters: WatchStatusFilterState) => {
    setFilters(newFilters);
    setFilterModalVisible(false);
  };

  // Add filter button to header
  useLayoutEffect(() => {
    const activeFilters = hasActiveFilters(filters);

    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setFilterModalVisible(true)}
          activeOpacity={ACTIVE_OPACITY}
          style={styles.headerButton}
        >
          <SlidersHorizontal size={24} color={COLORS.text} />
          {activeFilters && <View style={styles.filterBadge} />}
        </TouchableOpacity>
      ),
    });
  }, [filters, navigation]);

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

      <WatchStatusFiltersModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filters}
        onApplyFilters={handleApplyFilters}
        genreMap={genreMap || {}}
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
  headerButton: {
    marginRight: SPACING.m,
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
});
