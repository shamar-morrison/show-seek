import { EmptyState } from '@/src/components/library/EmptyState';
import { LibrarySortModal } from '@/src/components/library/LibrarySortModal';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import { SortOption, SortState } from '@/src/components/MediaSortModal';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { WatchingShowCard } from '@/src/components/watching/WatchingShowCard';
import { COLORS, EMPTY_STATE_HEIGHT } from '@/src/constants/theme';
import { useCurrentlyWatching } from '@/src/hooks/useCurrentlyWatching';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { iconBadgeStyles } from '@/src/styles/iconBadgeStyles';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { InProgressShow } from '@/src/types/episodeTracking';
import { getSearchHeaderOptions } from '@/src/utils/searchHeaderOptions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from 'expo-router';
import { ArrowUpDown, Search, TvIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const STORAGE_KEY = 'watchProgressSortState';
const ALLOWED_SORT_OPTIONS: SortOption[] = ['progress', 'alphabetical', 'lastWatched'];

const DEFAULT_SORT_STATE: SortState = {
  option: 'lastWatched',
  direction: 'desc',
};

export default function WatchProgressScreen() {
  const navigation = useNavigation();
  const { data, isLoading, isFetching, error } = useCurrentlyWatching();
  const { t } = useTranslation();

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
          // Validate that the saved option is still valid
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
    if (!data) return [];

    const sorted = [...data];
    const { option, direction } = sortState;
    const multiplier = direction === 'asc' ? 1 : -1;

    sorted.sort((a: InProgressShow, b: InProgressShow) => {
      switch (option) {
        case 'progress':
          return (a.percentage - b.percentage) * multiplier;
        case 'alphabetical':
          return a.tvShowName.localeCompare(b.tvShowName) * multiplier;
        case 'lastWatched':
        default:
          return (a.lastUpdated - b.lastUpdated) * multiplier;
      }
    });

    return sorted;
  }, [data, sortState]);

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
    getSearchableText: (item) => item.tvShowName,
  });

  const insets = useSafeAreaInsets();

  // Configure header with search + sort buttons
  useLayoutEffect(() => {
    if (isSearchActive) {
      navigation.setOptions(
        getSearchHeaderOptions({
          searchQuery,
          onSearchChange: setSearchQuery,
          onClose: deactivateSearch,
          placeholder: t('library.searchShowsPlaceholder'),
        })
      );
    } else {
      navigation.setOptions({
        header: undefined,
        headerTitle: undefined,
        headerRight: () => (
          <View style={styles.headerButtons}>
            {isFetching && <ActivityIndicator size="small" color={COLORS.textSecondary} />}
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
    searchButton,
    isFetching,
    hasActiveSort,
    t,
  ]);

  const renderItem = ({ item }: { item: InProgressShow }) => (
    <WatchingShowCard show={item} t={t} />
  );

  if (isLoading || isLoadingPreference) {
    return <FullScreenLoading message={t('library.loadingWatchHistory')} />;
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (sortedData.length === 0) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <EmptyState
          icon={TvIcon}
          title={t('library.emptyWatchProgress')}
          description={t('library.emptyWatchProgressHint')}
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
        keyExtractor={(item) => item.tvShowId.toString()}
        ListEmptyComponent={searchQuery ? <SearchEmptyState height={EMPTY_STATE_HEIGHT} /> : null}
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
