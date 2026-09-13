import { LibraryNavigationCard } from '@/src/components/library/LibraryNavigationCard';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { PremiumBadge } from '@/src/components/ui/PremiumBadge';
import { SearchableHeader } from '@/src/components/ui/SearchableHeader';
import { COLORS, FONT_FAMILY, FONT_SIZE, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { screenStyles } from '@/src/styles/screenStyles';
import { sectionTitleStyles } from '@/src/styles/sectionTitleStyles';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  AddToListIcon,
  BarChartIcon,
  DashboardSquare03Icon,
  CalendarFavorite01Icon,
  FolderHeartIcon,
  ListVideoIcon,
  MessageFavourite01Icon,
  MonitorPlayIcon,
  CalendarClockIcon,
  PlayIcon,
  Search01Icon,
  Settings02Icon,
  Note01Icon,
  TicketStarIcon,
  Tv01Icon,
  TvMinimalPlayIcon,
  UserLove02Icon,
} from '@hugeicons/core-free-icons';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type NavigationItem = {
  id: string;
  icon: typeof Tv01Icon;
  title: string;
  route: string;
};

type SectionData = {
  title: string;
  data: NavigationItem[];
};

export default function LibraryScreen() {
  const router = useRouter();
  const { isPremium } = usePremium();
  const isAccountRequired = useAccountRequired();
  const { t } = useTranslation();

  // Define sections with translation keys
  const sections = useMemo(
    () => [
      {
        title: t('library.listsAndStats'),
        data: [
          {
            id: 'watch-progress',
            icon: PlayIcon,
            title: t('library.watchProgress'),
            route: '/(tabs)/library/watch-progress',
          },
          {
            id: 'collection-progress',
            icon: ListVideoIcon,
            title: t('library.collectionProgress'),
            route: '/(tabs)/library/collection-progress',
          },
          {
            id: 'watch-status',
            icon: TvMinimalPlayIcon,
            title: t('library.watchLists'),
            route: '/(tabs)/library/watch-status',
          },
          {
            id: 'custom-lists',
            icon: AddToListIcon,
            title: t('library.customLists'),
            route: '/(tabs)/library/custom-lists',
          },
          {
            id: 'stats',
            icon: BarChartIcon,
            title: t('library.statsAndHistory'),
            route: '/(tabs)/library/stats',
          },
          {
            id: 'notes',
            icon: Note01Icon,
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
            icon: Tv01Icon,
            title: t('library.episodeRatings'),
            route: '/(tabs)/library/ratings/episodes',
          },
          {
            id: 'season-ratings',
            icon: CalendarFavorite01Icon,
            title: t('library.seasonRatings'),
            route: '/(tabs)/library/ratings/seasons',
          },
          {
            id: 'movie-ratings',
            icon: TicketStarIcon,
            title: t('library.movieRatings'),
            route: '/(tabs)/library/ratings/movies',
          },
          {
            id: 'tv-ratings',
            icon: MonitorPlayIcon,
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
            icon: FolderHeartIcon,
            title: t('library.favoriteContent'),
            route: '/(tabs)/library/favorites',
          },
          {
            id: 'favorite-episodes',
            icon: MessageFavourite01Icon,
            title: t('library.favoriteEpisodes'),
            route: '/(tabs)/library/favorite-episodes',
          },
          {
            id: 'favorite-people',
            icon: UserLove02Icon,
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
            icon: CalendarClockIcon,
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
            icon: DashboardSquare03Icon,
            title: t('library.homeScreenWidgets'),
            route: '/(tabs)/library/widgets',
          },
        ],
      },
    ],
    [t]
  );

  type SearchableLibraryItem = NavigationItem & { sectionTitle: string };

  const searchableItems = useMemo<SearchableLibraryItem[]>(
    () =>
      sections.flatMap((section) =>
        section.data.map((item) => ({ ...item, sectionTitle: section.title }))
      ),
    [sections]
  );

  const {
    searchQuery,
    isSearchActive,
    filteredItems: searchFilteredItems,
    activateSearch,
    deactivateSearch,
    setSearchQuery,
  } = useHeaderSearch({
    items: searchableItems,
    getSearchableText: (item) => `${item.sectionTitle} ${item.title}`,
  });

  const displaySections = useMemo(() => {
    if (!isSearchActive || !searchQuery.trim()) {
      return sections;
    }

    const matchedIds = new Set(searchFilteredItems.map((item) => item.id));
    return sections
      .map((section) => ({
        ...section,
        data: section.data.filter((item) => matchedIds.has(item.id)),
      }))
      .filter((section) => section.data.length > 0);
  }, [isSearchActive, searchQuery, searchFilteredItems, sections]);

  const showSearchEmptyState =
    isSearchActive && searchQuery.trim().length > 0 && displaySections.length === 0;

  const handleNavigate = useCallback(
    (route: string) => {
      router.push(route as any);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: NavigationItem }) => {
      const isPremiumFeature = item.id === 'widgets';
      const showPremiumBadge = isPremiumFeature && !isPremium;

      const handlePress = () => {
        if (isPremiumFeature) {
          if (isAccountRequired()) {
            return;
          }

          if (!isPremium) {
            router.push('/premium' as any);
            return;
          }
        }

        handleNavigate(item.route);
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
    [handleNavigate, isAccountRequired, isPremium, router]
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
      {isSearchActive ? (
        <SearchableHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onClose={deactivateSearch}
          placeholder={t('library.searchLibraryPlaceholder')}
          includeTopInset={false}
        />
      ) : (
        <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>{t('tabs.library')}</Text>
          <View style={styles.headerActions}>
            <HeaderIconButton onPress={activateSearch} testID="library-search-button">
              <AppIcon icon={Search01Icon} size={22} color={COLORS.text} />
            </HeaderIconButton>
            <Pressable onPress={() => router.push('/manage-lists' as any)} hitSlop={HIT_SLOP.m}>
              <AppIcon icon={Settings02Icon} size={24} color={COLORS.text} />
            </Pressable>
          </View>
        </View>
      )}

      {showSearchEmptyState ? (
        <SearchEmptyState />
      ) : (
        <SectionList
          sections={displaySections}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          SectionSeparatorComponent={renderSectionSeparator}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.content}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={ItemSeparator}
        />
      )}
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
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
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
