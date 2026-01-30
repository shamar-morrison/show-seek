import { CollectionProgressCard } from '@/src/components/library/CollectionProgressCard';
import { EmptyState } from '@/src/components/library/EmptyState';
import MediaSortModal, { SortOption, SortState } from '@/src/components/MediaSortModal';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { SearchableHeader } from '@/src/components/ui/SearchableHeader';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useCollectionProgressList } from '@/src/hooks/useCollectionTracking';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { CollectionProgressItem } from '@/src/types/collectionTracking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from 'expo-router';
import { ArrowUpDown, Layers, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const STORAGE_KEY = 'collectionProgressSortState';
const ALLOWED_SORT_OPTIONS: SortOption[] = ['progress', 'alphabetical', 'lastWatched'];

const DEFAULT_SORT_STATE: SortState = {
  option: 'lastWatched',
  direction: 'desc',
};

export default function CollectionProgressScreen() {
  const navigation = useNavigation();
  const { progressItems, isLoading, isEmpty } = useCollectionProgressList();

  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

  // Load sort preference from AsyncStorage
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as SortState;
          if (ALLOWED_SORT_OPTIONS.includes(parsed.option)) {
            setSortState(parsed);
          }
        }
      } catch (error) {
        console.error('Failed to load sort preference:', error);
      } finally {
        setIsLoadingPreference(false);
      }
    };
    loadPreference();
  }, []);

  // Handle sort apply and save to AsyncStorage
  const handleApplySort = useCallback(async (newSortState: SortState) => {
    setSortState(newSortState);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSortState));
    } catch (error) {
      console.error('Failed to save sort preference:', error);
    }
  }, []);

  // Sort the data based on current sort state
  const sortedData = useMemo(() => {
    if (!progressItems || progressItems.length === 0) return [];

    const sorted = [...progressItems];
    const { option, direction } = sortState;
    const multiplier = direction === 'asc' ? 1 : -1;

    sorted.sort((a: CollectionProgressItem, b: CollectionProgressItem) => {
      switch (option) {
        case 'progress':
          return (a.percentage - b.percentage) * multiplier;
        case 'alphabetical':
          return a.name.localeCompare(b.name) * multiplier;
        case 'lastWatched':
        default:
          return (a.lastUpdated - b.lastUpdated) * multiplier;
      }
    });

    return sorted;
  }, [progressItems, sortState]);

  // Search functionality
  const {
    searchQuery,
    isSearchActive,
    filteredItems: displayItems,
    deactivateSearch,
    setSearchQuery,
    searchButton,
  } = useHeaderSearch({
    items: sortedData,
    getSearchableText: (item) => item.name,
  });

  // Configure header with search + sort buttons
  useLayoutEffect(() => {
    if (isSearchActive) {
      navigation.setOptions({
        headerTitle: () => null,
        headerRight: () => null,
        header: () => (
          <SearchableHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onClose={deactivateSearch}
            placeholder="Search collections..."
          />
        ),
      });
    } else {
      navigation.setOptions({
        header: undefined,
        headerTitle: 'Collection Progress',
        headerRight: () => (
          <View style={styles.headerButtons}>
            <HeaderIconButton onPress={searchButton.onPress}>
              <Search size={22} color={COLORS.text} />
            </HeaderIconButton>
            <HeaderIconButton onPress={() => setSortModalVisible(true)}>
              <View style={styles.iconWrapper}>
                <ArrowUpDown size={22} color={COLORS.text} />
                {hasActiveSort && <View style={styles.sortBadge} />}
              </View>
            </HeaderIconButton>
          </View>
        ),
      });
    }
  }, [
    navigation,
    isSearchActive,
    searchQuery,
    setSearchQuery,
    deactivateSearch,
    searchButton,
    hasActiveSort,
  ]);

  const renderItem = ({ item }: { item: CollectionProgressItem }) => (
    <CollectionProgressCard collection={item} />
  );

  if (isLoading || isLoadingPreference) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your collections...</Text>
      </View>
    );
  }

  if (isEmpty) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={Layers}
          title="No Collections Tracked"
          description="Start tracking a collection from a movie's collection page to see your progress here."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.divider} />
      <FlashList
        data={displayItems}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        keyExtractor={(item) => item.collectionId.toString()}
        ListEmptyComponent={
          searchQuery ? (
            <View style={{ height: 300 }}>
              <EmptyState
                icon={Search}
                title="No results found"
                description="Try a different search term."
              />
            </View>
          ) : null
        }
      />

      <MediaSortModal
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        sortState={sortState}
        onApplySort={handleApplySort}
        allowedOptions={ALLOWED_SORT_OPTIONS}
      />
    </SafeAreaView>
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
  listContent: {
    padding: SPACING.l,
    paddingBottom: SPACING.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 16,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrapper: {
    position: 'relative',
  },
  sortBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: SPACING.s,
    height: SPACING.s,
    borderRadius: SPACING.xs,
    backgroundColor: COLORS.primary,
  },
});
