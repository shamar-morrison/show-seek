import { EmptyState } from '@/src/components/library/EmptyState';
import { EpisodeRatingCard } from '@/src/components/library/EpisodeRatingCard';
import { SearchableHeader } from '@/src/components/ui/SearchableHeader';
import { COLORS, FONT_SIZE, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useRatings } from '@/src/hooks/useRatings';
import { RatingItem } from '@/src/services/RatingService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { List, Rows3, Search, Star } from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ViewMode = 'flat' | 'grouped';
type EpisodeSection = {
  title: string;
  tvShowId: number;
  data: RatingItem[];
};

const STORAGE_KEY = 'episodeRatingsViewMode';

export default function EpisodeRatingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const currentTab = useCurrentTab();
  const { data: ratings, isLoading } = useRatings();

  const [viewMode, setViewMode] = useState<ViewMode>('flat');
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  const activateSearch = useCallback(() => {
    setIsSearchActive(true);
  }, []);

  const deactivateSearch = useCallback(() => {
    setIsSearchActive(false);
    setSearchQuery('');
  }, []);

  useEffect(() => {
    const loadPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved === 'flat' || saved === 'grouped') {
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
    const newMode: ViewMode = viewMode === 'flat' ? 'grouped' : 'flat';
    setViewMode(newMode);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, newMode);
    } catch (error) {
      console.error('Failed to save view mode preference:', error);
    }
  }, [viewMode]);

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
            placeholder="Search episodes..."
          />
        ),
      });
    } else {
      navigation.setOptions({
        header: undefined,
        headerTitle: undefined,
        headerRight: () => (
          <View style={styles.headerButtons}>
            <Pressable onPress={activateSearch} hitSlop={HIT_SLOP.m}>
              <Search size={22} color={COLORS.text} />
            </Pressable>
            <Pressable onPress={toggleViewMode} hitSlop={HIT_SLOP.m}>
              {viewMode === 'flat' ? (
                <Rows3 size={24} color={COLORS.text} />
              ) : (
                <List size={24} color={COLORS.text} />
              )}
            </Pressable>
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
    deactivateSearch,
    activateSearch,
  ]);

  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);

  const episodeRatings = useMemo(() => {
    if (!ratings) return [];
    return ratings.filter((r) => r.mediaType === 'episode').sort((a, b) => b.ratedAt - a.ratedAt);
  }, [ratings]);

  // Filter episodes based on search query
  const displayItems = useMemo(() => {
    if (!searchQuery.trim()) return episodeRatings;
    const query = searchQuery.toLowerCase().trim();
    return episodeRatings.filter((item) => {
      const showName = item.tvShowName?.toLowerCase() || '';
      const episodeName = item.episodeName?.toLowerCase() || '';
      return showName.includes(query) || episodeName.includes(query);
    });
  }, [episodeRatings, searchQuery]);

  const groupedEpisodeRatings = useMemo(() => {
    if (!displayItems || viewMode === 'flat') return null;

    // Group episodes by TV show
    const groupedMap = new Map<number, RatingItem[]>();

    displayItems.forEach((rating) => {
      if (rating.mediaType !== 'episode' || !rating.tvShowId) return;

      if (!groupedMap.has(rating.tvShowId)) {
        groupedMap.set(rating.tvShowId, []);
      }
      groupedMap.get(rating.tvShowId)!.push(rating);
    });

    // Convert to sections array
    const sections: EpisodeSection[] = Array.from(groupedMap.entries())
      .map(([tvShowId, episodes]) => ({
        title: episodes[0].tvShowName || 'Unknown Show',
        tvShowId,
        data: episodes.sort((a, b) => b.ratedAt - a.ratedAt),
      }))
      .sort((a, b) => {
        // Sort by most recent rating in each show
        const aLatest = Math.max(...a.data.map((e) => e.ratedAt));
        const bLatest = Math.max(...b.data.map((e) => e.ratedAt));
        return bLatest - aLatest;
      });

    return sections;
  }, [displayItems, viewMode]);

  const handleItemPress = useCallback(
    (rating: RatingItem) => {
      if (rating.mediaType !== 'episode') return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (!currentTab) {
        console.warn('Cannot navigate to episode: currentTab is null');
        return;
      }

      const path = `/(tabs)/${currentTab}/tv/${rating.tvShowId}/season/${rating.seasonNumber}/episode/${rating.episodeNumber}`;
      router.push(path as any);
    },
    [currentTab, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: RatingItem }) => (
      <EpisodeRatingCard rating={item} onPress={handleItemPress} />
    ),
    [handleItemPress]
  );

  const keyExtractor = useCallback((item: RatingItem) => item.id, []);

  const renderSectionHeader = useCallback(
    ({ section }: { section: EpisodeSection }) => (
      <Text style={styles.sectionHeader}>{section.title}</Text>
    ),
    []
  );

  const renderSectionSeparator = useCallback(() => <View style={styles.sectionSeparator} />, []);

  if (isLoading || isLoadingPreference) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (episodeRatings.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={Star}
          title="No Episode Ratings"
          description="Rate episodes to see them here."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.divider} />
      {viewMode === 'flat' ? (
        <FlashList
          data={displayItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={ItemSeparator}
          ListEmptyComponent={
            searchQuery ? (
              <EmptyState
                icon={Search}
                title="No results found"
                description="Try a different search term."
              />
            ) : null
          }
        />
      ) : (
        <SectionList
          sections={groupedEpisodeRatings || []}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          SectionSeparatorComponent={renderSectionSeparator}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={ItemSeparator}
          ListEmptyComponent={
            searchQuery ? (
              <EmptyState
                icon={Search}
                title="No results found"
                description="Try a different search term."
              />
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
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
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
    gap: SPACING.m,
  },
});
