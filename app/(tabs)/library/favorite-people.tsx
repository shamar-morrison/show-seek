import { EmptyState } from '@/src/components/library/EmptyState';
import { PersonCard } from '@/src/components/library/PersonCard';
import { PersonListCard } from '@/src/components/library/PersonListCard';
import { ACTIVE_OPACITY, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useFavoritePersons } from '@/src/hooks/useFavoritePersons';
import { FavoritePerson } from '@/src/types/favoritePerson';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { Grid3X3, List, User } from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={toggleViewMode}
          style={{ marginRight: SPACING.s }}
          activeOpacity={ACTIVE_OPACITY}
        >
          {viewMode === 'grid' ? (
            <List size={24} color={COLORS.text} />
          ) : (
            <Grid3X3 size={24} color={COLORS.text} />
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, viewMode, toggleViewMode]);

  const sortedPersons = useMemo(() => {
    if (!favoritePersons) return [];
    return [...favoritePersons].sort((a, b) => b.addedAt - a.addedAt);
  }, [favoritePersons]);

  const groupedPersons = useMemo(() => {
    if (!sortedPersons || viewMode === 'grid') return null;

    // Group by known_for_department
    const groupedMap = new Map<string, FavoritePerson[]>();

    sortedPersons.forEach((person) => {
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
  }, [sortedPersons, viewMode]);

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
      <PersonCard person={item} onPress={handlePersonPress} />
    ),
    [handlePersonPress]
  );

  const renderListItem = useCallback(
    ({ item }: { item: FavoritePerson }) => (
      <PersonListCard person={item} onPress={handlePersonPress} />
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
      {viewMode === 'grid' ? (
        <FlatList
          data={sortedPersons}
          renderItem={renderGridItem}
          keyExtractor={keyExtractor}
          numColumns={3}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.gridListContent}
          showsVerticalScrollIndicator={false}
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
});
