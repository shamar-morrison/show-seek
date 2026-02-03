import { EmptyState } from '@/src/components/library/EmptyState';
import { EpisodeRatingCard } from '@/src/components/library/EpisodeRatingCard';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { COLORS, FONT_SIZE, HEADER_CHROME_HEIGHT, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { useRatings } from '@/src/hooks/useRatings';
import { RatingItem } from '@/src/services/RatingService';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { getSearchHeaderOptions } from '@/src/utils/searchHeaderOptions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { List, Rows3, Search, Star } from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  SectionList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [viewMode, setViewMode] = useState<ViewMode>('flat');
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

  // Filter episode ratings from all ratings
  const episodeRatings = useMemo(() => {
    if (!ratings) return [];
    return ratings.filter((r) => r.mediaType === 'episode').sort((a, b) => b.ratedAt - a.ratedAt);
  }, [ratings]);

  // Search functionality using shared hook
  const {
    searchQuery,
    isSearchActive,
    deactivateSearch,
    setSearchQuery,
    searchButton,
    filteredItems,
  } = useHeaderSearch({
    items: episodeRatings,
    getSearchableText: (item) => `${item.tvShowName || ''} ${item.episodeName || ''}`,
  });

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
      navigation.setOptions(
        getSearchHeaderOptions({
          searchQuery,
          onSearchChange: setSearchQuery,
          onClose: deactivateSearch,
          placeholder: 'Search episodes...',
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
              {viewMode === 'flat' ? (
                <Rows3 size={24} color={COLORS.text} />
              ) : (
                <List size={24} color={COLORS.text} />
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
    deactivateSearch,
    searchButton,
  ]);

  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);

  const groupedEpisodeRatings = useMemo(() => {
    if (!filteredItems || viewMode === 'flat') return null;

    // Group episodes by TV show
    const groupedMap = new Map<number, RatingItem[]>();

    filteredItems.forEach((rating) => {
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
  }, [filteredItems, viewMode]);

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

  const searchEmptyComponent = useMemo(
    () =>
      searchQuery ? (
        <SearchEmptyState
          height={windowHeight - insets.top - insets.bottom - HEADER_CHROME_HEIGHT}
        />
      ) : null,
    [searchQuery, windowHeight, insets.top, insets.bottom]
  );

  if (isLoading || isLoadingPreference) {
    return <FullScreenLoading />;
  }

  if (episodeRatings.length === 0) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <EmptyState
          icon={Star}
          title="No Episode Ratings"
          description="Rate episodes to see them here."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      <View style={libraryListStyles.divider} />
      {viewMode === 'flat' ? (
        <FlashList
          data={filteredItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={libraryListStyles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={ItemSeparator}
          ListEmptyComponent={searchEmptyComponent}
        />
      ) : (
        <SectionList
          sections={groupedEpisodeRatings || []}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          SectionSeparatorComponent={renderSectionSeparator}
          keyExtractor={keyExtractor}
          contentContainerStyle={libraryListStyles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ItemSeparatorComponent={ItemSeparator}
          ListEmptyComponent={searchEmptyComponent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
