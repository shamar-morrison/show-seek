import { LibraryNavigationCard } from '@/src/components/library/LibraryNavigationCard';
import { PremiumBadge } from '@/src/components/ui/PremiumBadge';
import { COLORS, FONT_SIZE, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { screenStyles } from '@/src/styles/screenStyles';
import { sectionTitleStyles } from '@/src/styles/sectionTitleStyles';
import { useRouter } from 'expo-router';
import {
  BarChart3,
  Bell,
  Film,
  Heart,
  Layers,
  Layout,
  ListPlus,
  Play,
  Settings2,
  StickyNote,
  Tv,
  TvMinimal,
  User,
} from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
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
        id: 'watch-progress',
        icon: Play,
        title: 'Watch Progress',
        route: '/(tabs)/library/watch-progress',
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
      {
        id: 'stats',
        icon: BarChart3,
        title: 'Stats & History',
        route: '/(tabs)/library/stats',
      },
      {
        id: 'notes',
        icon: StickyNote,
        title: 'Notes',
        route: '/(tabs)/library/notes',
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
  {
    title: 'WIDGETS',
    data: [
      {
        id: 'widgets',
        icon: Layout,
        title: 'Home Screen Widgets',
        route: '/(tabs)/library/widgets',
      },
    ],
  },
];

export default function LibraryScreen() {
  const router = useRouter();
  const { isPremium } = usePremium();
  const { t } = useTranslation();

  // Define sections with translation keys
  const sections = useMemo(
    () => [
      {
        title: t('library.listsAndStats'),
        data: [
          {
            id: 'watch-progress',
            icon: Play,
            title: t('library.watchProgress'),
            route: '/(tabs)/library/watch-progress',
          },
          {
            id: 'collection-progress',
            icon: Layers,
            title: t('library.collectionProgress'),
            route: '/(tabs)/library/collection-progress',
          },
          {
            id: 'watch-status',
            icon: Tv,
            title: t('library.watchLists'),
            route: '/(tabs)/library/watch-status',
          },
          {
            id: 'custom-lists',
            icon: ListPlus,
            title: t('library.customLists'),
            route: '/(tabs)/library/custom-lists',
          },
          {
            id: 'stats',
            icon: BarChart3,
            title: t('library.statsAndHistory'),
            route: '/(tabs)/library/stats',
          },
          {
            id: 'notes',
            icon: StickyNote,
            title: t('library.notes'),
            route: '/(tabs)/library/notes',
          },
        ],
      },
      {
        title: t('library.ratingsSection'),
        data: [
          {
            id: 'episode-ratings',
            icon: TvMinimal,
            title: t('library.episodeRatings'),
            route: '/(tabs)/library/ratings/episodes',
          },
          {
            id: 'movie-ratings',
            icon: Film,
            title: t('library.movieRatings'),
            route: '/(tabs)/library/ratings/movies',
          },
          {
            id: 'tv-ratings',
            icon: Tv,
            title: t('library.tvShowRatings'),
            route: '/(tabs)/library/ratings/tv-shows',
          },
        ],
      },
      {
        title: t('library.favoritesSection'),
        data: [
          {
            id: 'favorite-content',
            icon: Heart,
            title: t('library.favoriteContent'),
            route: '/(tabs)/library/favorites',
          },
          {
            id: 'favorite-people',
            icon: User,
            title: t('library.favoritePeople'),
            route: '/(tabs)/library/favorite-people',
          },
        ],
      },
      {
        title: t('settings.notifications'),
        data: [
          {
            id: 'reminders',
            icon: Bell,
            title: t('library.reminders'),
            route: '/(tabs)/library/reminders',
          },
        ],
      },
      {
        title: t('library.widgets'),
        data: [
          {
            id: 'widgets',
            icon: Layout,
            title: t('library.homeScreenWidgets'),
            route: '/(tabs)/library/widgets',
          },
        ],
      },
    ],
    [t]
  );

  const handleNavigate = useCallback(
    (route: string) => {
      router.push(route as any);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: NavigationItem }) => {
      const isPremiumFeature =
        item.id === 'reminders' || item.id === 'notes' || item.id === 'widgets';
      const showPremiumBadge = isPremiumFeature && !isPremium;

      const handlePress = () => {
        if (isPremiumFeature && !isPremium) {
          router.push('/premium' as any);
        } else {
          handleNavigate(item.route);
        }
      };

      return (
        <LibraryNavigationCard
          icon={item.icon}
          title={item.title}
          onPress={handlePress}
          testID={`library-nav-${item.id}`}
          badge={showPremiumBadge ? <PremiumBadge /> : undefined}
          isLocked={showPremiumBadge}
        />
      );
    },
    [handleNavigate, isPremium]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionData }) => (
      <Text style={sectionTitleStyles.title}>{section.title}</Text>
    ),
    []
  );

  const renderSectionSeparator = useCallback(() => <View style={styles.sectionSeparator} />, []);
  const ItemSeparator = useCallback(() => <View style={styles.itemSeparator} />, []);

  const keyExtractor = useCallback((item: NavigationItem) => item.id, []);

  return (
    <SafeAreaView style={screenStyles.container} edges={['top']}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>{t('tabs.library')}</Text>
        <Pressable onPress={() => router.push('/manage-lists' as any)} hitSlop={HIT_SLOP.m}>
          <Settings2 size={24} color={COLORS.text} />
        </Pressable>
      </View>

      <SectionList
        sections={sections}
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
  sectionSeparator: {
    height: SPACING.xl,
  },
  itemSeparator: {
    height: SPACING.m,
  },
});
