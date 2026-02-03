import { CollectionProgressCard } from '@/src/components/library/CollectionProgressCard';
import { EmptyState } from '@/src/components/library/EmptyState';
import { LibrarySortModal } from '@/src/components/library/LibrarySortModal';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import { SortOption, SortState } from '@/src/components/MediaSortModal';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { COLORS } from '@/src/constants/theme';
import { useCollectionProgressList } from '@/src/hooks/useCollectionTracking';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { iconBadgeStyles } from '@/src/styles/iconBadgeStyles';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { CollectionProgressItem } from '@/src/types/collectionTracking';
import { getSearchHeaderOptions } from '@/src/utils/searchHeaderOptions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from 'expo-router';
import { ArrowUpDown, Layers, Search } from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
      navigation.setOptions(
        getSearchHeaderOptions({
          searchQuery,
          onSearchChange: setSearchQuery,
          onClose: deactivateSearch,
          placeholder: 'Search collections...',
        })
      );
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
              <View style={iconBadgeStyles.wrapper}>
                <ArrowUpDown size={22} color={COLORS.text} />
                {hasActiveSort && <View style={iconBadgeStyles.badge} />}
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
    return <FullScreenLoading message="Loading your collections..." />;
  }

  if (isEmpty) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <EmptyState
          icon={Layers}
          title="No Collections Tracked"
          description="Start tracking a collection from a movie's collection page to see your progress here."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      <View style={libraryListStyles.divider} />
      <FlashList
        data={displayItems}
        renderItem={renderItem}
        contentContainerStyle={libraryListStyles.listContent}
        keyExtractor={(item) => item.collectionId.toString()}
        ListEmptyComponent={
          searchQuery ? <SearchEmptyState height={300} /> : null
        }
      />

      <LibrarySortModal
        visible={sortModalVisible}
        setVisible={setSortModalVisible}
        sortState={sortState}
        onApplySort={handleApplySort}
        allowedOptions={ALLOWED_SORT_OPTIONS}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
