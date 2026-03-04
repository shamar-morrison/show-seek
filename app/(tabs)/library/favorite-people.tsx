import { EmptyState } from '@/src/components/library/EmptyState';
import { PersonCard } from '@/src/components/library/PersonCard';
import { PersonListCard } from '@/src/components/library/PersonListCard';
import { QueryErrorState } from '@/src/components/library/QueryErrorState';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import { CategoryTab, CategoryTabs } from '@/src/components/ui/CategoryTabs';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useFavoritePersons } from '@/src/hooks/useFavoritePersons';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { FavoritePerson } from '@/src/types/favoritePerson';
import { getSearchHeaderOptions } from '@/src/utils/searchHeaderOptions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { Grid3X3, List, Search, User } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type ViewMode = 'grid' | 'list';
const ALL_TAB_KEY = 'all';

const STORAGE_KEY = 'favoritePeopleViewMode';

export default function FavoritePeopleScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { t, i18n } = useTranslation();
  const currentTab = useCurrentTab();
  const { data: favoritePersons, isLoading, error, refetch } = useFavoritePersons();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);
  const [activeDepartment, setActiveDepartment] = useState(ALL_TAB_KEY);

  useEffect(() => {
    const loadPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'grid' || saved === 'list') {
          setViewMode(saved);
        }
      } catch (error) {
        console.error('Failed to load view mode preference:', error);
      } finally {
        setIsLoadingPreference(false);
      }
    };
    loadPreference();
  }, []);

  const toggleViewMode = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newMode: ViewMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(newMode);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, newMode);
    } catch (error) {
      console.error('Failed to save view mode preference:', error);
    }
  }, [viewMode]);

  const sortedPersons = useMemo(() => {
    if (!favoritePersons) return [];
    return [...favoritePersons].sort((a, b) => b.addedAt - a.addedAt);
  }, [favoritePersons]);

  const {
    searchQuery,
    isSearchActive,
    filteredItems: displayItems,
    deactivateSearch,
    setSearchQuery,
    searchButton,
  } = useHeaderSearch({
    items: sortedPersons,
    getSearchableText: (item) => item.name,
  });

  // Swap header when search is active
  useLayoutEffect(() => {
    if (isSearchActive) {
      navigation.setOptions(
        getSearchHeaderOptions({
          searchQuery,
          onSearchChange: setSearchQuery,
          onClose: deactivateSearch,
          placeholder: t('library.searchPeoplePlaceholder'),
        })
      );
    } else {
      navigation.setOptions({
        header: undefined,
        headerTitle: undefined,
        headerRight: () => (
          <View style={styles.headerButtons}>
            <HeaderIconButton onPress={searchButton.onPress}>
              <Search size={22} color={COLORS.text} />
            </HeaderIconButton>
            <HeaderIconButton onPress={toggleViewMode}>
              {viewMode === 'grid' ? (
                <List size={24} color={COLORS.text} />
              ) : (
                <Grid3X3 size={24} color={COLORS.text} />
              )}
            </HeaderIconButton>
          </View>
        ),
      });
    }
  }, [
    navigation,
    viewMode,
    toggleViewMode,
    isSearchActive,
    searchQuery,
    setSearchQuery,
    deactivateSearch,
    searchButton,
    t,
  ]);

  const departmentTabs = useMemo<CategoryTab[]>(() => {
    const departmentSet = new Set<string>();
    (displayItems || []).forEach((person) => {
      departmentSet.add(person.known_for_department || t('common.other'));
    });

    const dynamicTabs = Array.from(departmentSet)
      .sort((a, b) => a.localeCompare(b))
      .map((department) => ({
        key: department,
        label: department,
      }));

    return [{ key: ALL_TAB_KEY, label: t('common.all', { defaultValue: 'All' }) }, ...dynamicTabs];
  }, [displayItems, t, i18n.language]);

  const groupedModeItems = useMemo(() => {
    if (!displayItems) return [];
    if (activeDepartment === ALL_TAB_KEY) return displayItems;
    return displayItems.filter(
      (person) => (person.known_for_department || t('common.other')) === activeDepartment
    );
  }, [displayItems, activeDepartment, t]);

  useEffect(() => {
    if (viewMode === 'grid') return;
    if (departmentTabs.some((tab) => tab.key === activeDepartment)) return;
    setActiveDepartment(ALL_TAB_KEY);
  }, [departmentTabs, activeDepartment, viewMode]);

  const handlePersonPress = useCallback(
    (personId: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (!currentTab) {
        console.warn('Cannot navigate to person: currentTab is null');
        return;
      }
      const path = `/(tabs)/${currentTab}/person/${personId}`;
      router.push(path as any);
    },
    [currentTab, router]
  );

  const renderGridItem = useCallback(
    ({ item }: { item: FavoritePerson }) => (
      <PersonCard person={item} onPress={handlePersonPress} hideFavoriteBadge />
    ),
    [handlePersonPress]
  );

  const renderListItem = useCallback(
    ({ item }: { item: FavoritePerson }) => (
      <PersonListCard person={item} onPress={handlePersonPress} hideFavoriteBadge />
    ),
    [handlePersonPress]
  );

  const keyExtractor = useCallback((item: FavoritePerson) => item.id.toString(), []);

  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);

  if (isLoading || isLoadingPreference) {
    return <FullScreenLoading />;
  }

  if (error) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <QueryErrorState
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      </SafeAreaView>
    );
  }

  if (sortedPersons.length === 0) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <EmptyState
          icon={User}
          title={t('library.emptyFavoritePeople')}
          description={t('library.emptyFavoritePeopleHint')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      <View style={libraryListStyles.divider} />
      {viewMode === 'grid' ? (
        <FlatList
          data={displayItems}
          renderItem={renderGridItem}
          keyExtractor={keyExtractor}
          numColumns={3}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.gridListContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            searchQuery ? (
              <SearchEmptyState height={windowHeight - insets.top - insets.bottom - 150} />
            ) : null
          }
        />
      ) : (
        <View style={styles.listModeContainer}>
          <CategoryTabs
            tabs={departmentTabs}
            activeKey={activeDepartment}
            onChange={setActiveDepartment}
            testID="favorite-people-category-tabs"
          />
          <FlatList
            data={groupedModeItems}
            renderItem={renderListItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={libraryListStyles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={ItemSeparator}
            ListEmptyComponent={
              searchQuery ? (
                <SearchEmptyState height={windowHeight - insets.top - insets.bottom - 150} />
              ) : null
            }
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  gridListContent: {
    padding: SPACING.m,
  },
  columnWrapper: {
    gap: SPACING.m,
    marginBottom: SPACING.m,
  },
  separator: {
    height: SPACING.m,
  },
  listModeContainer: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
