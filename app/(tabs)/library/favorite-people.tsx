import { EmptyState } from '@/src/components/library/EmptyState';
import { PersonCard } from '@/src/components/library/PersonCard';
import { PersonListCard } from '@/src/components/library/PersonListCard';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { SearchableHeader } from '@/src/components/ui/SearchableHeader';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useFavoritePersons } from '@/src/hooks/useFavoritePersons';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { FavoritePerson } from '@/src/types/favoritePerson';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { Grid3X3, List, Search, User } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SectionList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type ViewMode = 'grid' | 'list';
type PersonSection = {
  title: string;
  data: FavoritePerson[];
};

const STORAGE_KEY = 'favoritePeopleViewMode';

export default function FavoritePeopleScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const currentTab = useCurrentTab();
  const { data: favoritePersons, isLoading } = useFavoritePersons();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

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
      navigation.setOptions({
        headerTitle: () => null,
        headerRight: () => null,
        header: () => (
          <SearchableHeader
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onClose={deactivateSearch}
            placeholder="Search people..."
          />
        ),
      });
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
  ]);

  const groupedPersons = useMemo(() => {
    if (!displayItems || viewMode === 'grid') return null;

    // Group by known_for_department
    const groupedMap = new Map<string, FavoritePerson[]>();

    displayItems.forEach((person) => {
      const department = person.known_for_department || 'Other';

      if (!groupedMap.has(department)) {
        groupedMap.set(department, []);
      }
      groupedMap.get(department)!.push(person);
    });

    // Convert to sections array, sorted by department name
    const sections: PersonSection[] = Array.from(groupedMap.entries())
      .map(([department, people]) => ({
        title: department,
        data: people,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));

    return sections;
  }, [displayItems, viewMode]);

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

  const renderSectionHeader = useCallback(
    ({ section }: { section: PersonSection }) => (
      <Text style={styles.sectionHeader}>{section.title}</Text>
    ),
    []
  );

  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);
  const SectionSeparator = useCallback(() => <View style={styles.sectionSeparator} />, []);

  if (isLoading || isLoadingPreference) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (sortedPersons.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={User}
          title="No Favorite People"
          description="Favorite actors and directors to see them here."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.divider} />
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
              <View style={{ height: windowHeight - insets.top - insets.bottom - 150 }}>
                <EmptyState
                  icon={Search}
                  title="No results found"
                  description="Try a different search term."
                />
              </View>
            ) : null
          }
        />
      ) : (
        <SectionList
          sections={groupedPersons || []}
          renderItem={renderListItem}
          renderSectionHeader={renderSectionHeader}
          SectionSeparatorComponent={SectionSeparator}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={ItemSeparator}
          ListEmptyComponent={
            searchQuery ? (
              <View style={{ height: windowHeight - insets.top - insets.bottom - 150 }}>
                <EmptyState
                  icon={Search}
                  title="No results found"
                  description="Try a different search term."
                />
              </View>
            ) : null
          }
        />
      )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  gridListContent: {
    padding: SPACING.m,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
  },
  columnWrapper: {
    gap: SPACING.m,
    marginBottom: SPACING.m,
  },
  separator: {
    height: SPACING.m,
  },
  sectionHeader: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    backgroundColor: COLORS.background,
    paddingVertical: SPACING.s,
  },
  sectionSeparator: {
    height: SPACING.l,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
