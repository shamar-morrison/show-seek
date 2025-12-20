import { LibraryNavigationCard } from '@/src/components/library/LibraryNavigationCard';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useRouter } from 'expo-router';
import {
  BarChart3,
  Bell,
  Film,
  Heart,
  ListPlus,
  Settings2,
  Tv,
  TvMinimal,
  User,
} from 'lucide-react-native';
import React, { useCallback } from 'react';
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type NavigationItem = {
  id: string;
  icon: typeof Tv;
  title: string;
  route: string;
};

type SectionData = {
  title: string;
  data: NavigationItem[];
};

const SECTIONS: SectionData[] = [
  {
    title: 'LISTS & STATS',
    data: [
      {
        id: 'stats',
        icon: BarChart3,
        title: 'Stats & History',
        route: '/(tabs)/library/stats',
      },
      {
        id: 'watch-status',
        icon: Tv,
        title: 'Watch Lists',
        route: '/(tabs)/library/watch-status',
      },
      {
        id: 'custom-lists',
        icon: ListPlus,
        title: 'Custom Lists',
        route: '/(tabs)/library/custom-lists',
      },
    ],
  },
  {
    title: 'RATINGS',
    data: [
      {
        id: 'episode-ratings',
        icon: TvMinimal,
        title: 'Episode Ratings',
        route: '/(tabs)/library/ratings/episodes',
      },
      {
        id: 'movie-ratings',
        icon: Film,
        title: 'Movie Ratings',
        route: '/(tabs)/library/ratings/movies',
      },
      {
        id: 'tv-ratings',
        icon: Tv,
        title: 'TV Show Ratings',
        route: '/(tabs)/library/ratings/tv-shows',
      },
    ],
  },
  {
    title: 'FAVORITES',
    data: [
      {
        id: 'favorite-content',
        icon: Heart,
        title: 'Favorite Content',
        route: '/(tabs)/library/favorites',
      },
      {
        id: 'favorite-people',
        icon: User,
        title: 'Favorite People',
        route: '/(tabs)/library/favorite-people',
      },
    ],
  },
  {
    title: 'NOTIFICATIONS',
    data: [
      {
        id: 'reminders',
        icon: Bell,
        title: 'Reminders',
        route: '/(tabs)/library/reminders',
      },
    ],
  },
];

export default function LibraryScreen() {
  const router = useRouter();

  const handleNavigate = useCallback(
    (route: string) => {
      router.push(route as any);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: NavigationItem }) => (
      <LibraryNavigationCard
        icon={item.icon}
        title={item.title}
        onPress={() => handleNavigate(item.route)}
        testID={`library-nav-${item.id}`}
      />
    ),
    [handleNavigate]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionData }) => (
      <Text style={styles.sectionTitle}>{section.title}</Text>
    ),
    []
  );

  const renderSectionSeparator = useCallback(() => <View style={styles.sectionSeparator} />, []);
  const ItemSeparator = useCallback(() => <View style={styles.itemSeparator} />, []);

  const keyExtractor = useCallback((item: NavigationItem) => item.id, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Library</Text>
        <TouchableOpacity onPress={() => router.push('/manage-lists' as any)}>
          <Settings2 size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <SectionList
        sections={SECTIONS}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        SectionSeparatorComponent={renderSectionSeparator}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={ItemSeparator}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  content: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.l,
    paddingBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionSeparator: {
    height: SPACING.xl,
  },
  itemSeparator: {
    height: SPACING.m,
  },
});
