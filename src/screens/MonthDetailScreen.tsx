import { ActivityRatingCard } from '@/src/components/library/ActivityRatingCard';
import { EmptyState } from '@/src/components/library/EmptyState';
import { MediaListCard } from '@/src/components/library/MediaListCard';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useMonthDetail } from '@/src/hooks/useHistory';
import type { ListMediaItem } from '@/src/services/ListService';
import type { ActivityItem } from '@/src/types/history';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Calendar, Plus, Star, Tv } from 'lucide-react-native';
import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TabType = 'watched' | 'rated' | 'added';

/** Combined list item type for watched tab with mixed content */
type WatchedListItem =
  | { type: 'media'; data: ListMediaItem }
  | { type: 'episode'; data: ActivityItem };

/**
 * Tab button component
 */
function TabButton({
  label,
  count,
  isActive,
  onPress,
  icon: Icon,
  iconColor,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onPress: () => void;
  icon: typeof Tv;
  iconColor: string;
}) {
  const displayCount = count > 99 ? '99+' : count.toString();

  return (
    <TouchableOpacity
      style={[styles.tabButton, isActive && styles.tabButtonActive]}
      onPress={onPress}
      activeOpacity={ACTIVE_OPACITY}
    >
      <Icon size={16} color={isActive ? iconColor : COLORS.textSecondary} />
      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{label}</Text>
      <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
        <Text style={[styles.countText, isActive && styles.countTextActive]}>{displayCount}</Text>
      </View>
    </TouchableOpacity>
  );
}

function extractNumericId(id: string | number): number {
  if (typeof id === 'number') return id;
  const match = id.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

export default function MonthDetailScreen() {
  const { month } = useLocalSearchParams<{ month: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { data: monthDetail, isLoading } = useMonthDetail(month || null);

  const [activeTab, setActiveTab] = useState<TabType>('watched');
  const [hasInitializedTab, setHasInitializedTab] = useState(false);

  // Set the header title
  useLayoutEffect(() => {
    if (monthDetail?.monthName) {
      navigation.setOptions({
        title: monthDetail.monthName,
      });
    }
  }, [navigation, monthDetail?.monthName]);

  // Determine initial active tab based on available data (only once)
  useLayoutEffect(() => {
    if (!monthDetail || hasInitializedTab) return;

    const { watched, rated, added } = monthDetail.items;
    if (watched.length > 0) {
      setActiveTab('watched');
    } else if (rated.length > 0) {
      setActiveTab('rated');
    } else if (added.length > 0) {
      setActiveTab('added');
    }
    setHasInitializedTab(true);
  }, [monthDetail, hasInitializedTab]);

  const handleItemPress = useCallback(
    (item: ActivityItem) => {
      if (!currentTab) return;

      if (item.mediaType === 'episode' && item.tvShowId) {
        router.push(`/(tabs)/${currentTab}/tv/${item.tvShowId}` as any);
      } else if (item.mediaType === 'movie') {
        router.push(`/(tabs)/${currentTab}/movie/${item.id}` as any);
      } else if (item.mediaType === 'tv') {
        router.push(`/(tabs)/${currentTab}/tv/${item.id}` as any);
      }
    },
    [currentTab, router]
  );

  const handleListItemPress = useCallback(
    (listItem: ListMediaItem) => {
      if (!currentTab) return;

      if (listItem.media_type === 'movie') {
        router.push(`/(tabs)/${currentTab}/movie/${listItem.id}` as any);
      } else {
        router.push(`/(tabs)/${currentTab}/tv/${listItem.id}` as any);
      }
    },
    [currentTab, router]
  );

  const addedItems = useMemo(() => {
    if (!monthDetail) return [];

    return monthDetail.items.added.map(
      (item): ListMediaItem => ({
        id: extractNumericId(item.id),
        title: item.title,
        poster_path: item.posterPath,
        media_type: item.mediaType as 'movie' | 'tv',
        vote_average: item.voteAverage || 0,
        release_date: item.releaseDate || '',
        addedAt: item.timestamp,
        genre_ids: item.genreIds,
      })
    );
  }, [monthDetail]);

  // Create combined watched items list for a single FlashList
  // This includes movies/TV as ListMediaItem, a section header, and episodes as ActivityItem

  const combinedWatchedItems = useMemo((): WatchedListItem[] => {
    if (!monthDetail) return [];

    const items: WatchedListItem[] = [];

    // Add movies/TV shows as media items
    const mediaItems = monthDetail.items.watched
      .filter((item) => item.mediaType === 'movie' || item.mediaType === 'tv')
      .map(
        (item): ListMediaItem => ({
          id: extractNumericId(item.id),
          title: item.title,
          poster_path: item.posterPath,
          media_type: item.mediaType as 'movie' | 'tv',
          vote_average: item.voteAverage || 0,
          release_date: item.releaseDate || '',
          addedAt: item.timestamp,
          genre_ids: item.genreIds,
        })
      );

    mediaItems.forEach((media) => {
      items.push({ type: 'media', data: media });
    });

    // Add episodes
    const episodes = monthDetail.items.watched.filter((item) => item.mediaType === 'episode');
    episodes.forEach((episode) => {
      items.push({ type: 'episode', data: episode });
    });

    // Sort by timestamp (most recent first), with secondary sort by ID for stability
    return items.sort((a, b) => {
      const timestampA = a.type === 'media' ? (a.data.addedAt ?? 0) : a.data.timestamp;
      const timestampB = b.type === 'media' ? (b.data.addedAt ?? 0) : b.data.timestamp;
      if (timestampB !== timestampA) {
        return timestampB - timestampA;
      }
      // Secondary sort by ID for stable ordering when timestamps are equal
      return String(a.data.id).localeCompare(String(b.data.id));
    });
  }, [monthDetail]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!monthDetail) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={Calendar}
          title="No Data Found"
          description="Could not load data for this month."
        />
      </SafeAreaView>
    );
  }

  const { watched, rated, added } = monthDetail.items;
  const hasNoActivity = watched.length === 0 && rated.length === 0 && added.length === 0;

  if (hasNoActivity) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={Calendar}
          title="No Activity"
          description="No activity recorded for this month."
        />
      </SafeAreaView>
    );
  }

  // Get current items based on active tab
  const currentItems = activeTab === 'watched' ? watched : activeTab === 'rated' ? rated : added;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.divider} />

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Tv size={20} color={COLORS.primary} />
            <Text style={styles.summaryValue}>{monthDetail.stats.watched}</Text>
            <Text style={styles.summaryLabel}>watched</Text>
          </View>
          <View style={styles.summaryItem}>
            <Star size={20} color={COLORS.warning} />
            <Text style={styles.summaryValue}>{monthDetail.stats.averageRating ?? '-'}</Text>
            <Text style={styles.summaryLabel}>avg rating</Text>
          </View>
          <View style={styles.summaryItem}>
            <Plus size={20} color={COLORS.success} />
            <Text style={styles.summaryValue}>{monthDetail.stats.addedToLists}</Text>
            <Text style={styles.summaryLabel}>added</Text>
          </View>
        </View>

        {monthDetail.stats.topGenres.length > 0 && (
          <View style={styles.topGenresRow}>
            <Text style={styles.topGenresLabel}>Top Genres:</Text>
            <Text style={styles.topGenresValue}>{monthDetail.stats.topGenres.join(', ')}</Text>
          </View>
        )}
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <TabButton
          label="Watched"
          count={watched.length}
          isActive={activeTab === 'watched'}
          onPress={() => setActiveTab('watched')}
          icon={Tv}
          iconColor={COLORS.primary}
        />
        <TabButton
          label="Rated"
          count={rated.length}
          isActive={activeTab === 'rated'}
          onPress={() => setActiveTab('rated')}
          icon={Star}
          iconColor={COLORS.warning}
        />
        <TabButton
          label="Added"
          count={added.length}
          isActive={activeTab === 'added'}
          onPress={() => setActiveTab('added')}
          icon={Plus}
          iconColor={COLORS.success}
        />
      </View>

      {/* Content based on active tab */}
      {currentItems.length === 0 ? (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>No {activeTab} items this month</Text>
        </View>
      ) : activeTab === 'added' ? (
        <FlashList
          data={addedItems}
          renderItem={({ item }) => <MediaListCard item={item} onPress={handleListItemPress} />}
          keyExtractor={(item) => `${item.id}-${item.addedAt}`}
          contentContainerStyle={styles.listContent}
        />
      ) : activeTab === 'watched' ? (
        <FlashList
          data={combinedWatchedItems}
          renderItem={({ item }) => {
            if (item.type === 'media') {
              return <MediaListCard item={item.data} onPress={handleListItemPress} />;
            }
            return <ActivityRatingCard item={item.data} onPress={handleItemPress} />;
          }}
          keyExtractor={(item, index) => {
            if (item.type === 'media') {
              return `${item.data.media_type}-${item.data.id}`;
            }
            const showId = item.data.tvShowId ?? 'unknown';
            const season = item.data.seasonNumber ?? 0;
            const episode = item.data.episodeNumber ?? 0;
            if (!item.data.tvShowId && !item.data.seasonNumber && !item.data.episodeNumber) {
              return `ep-${item.data.id}-${index}`;
            }
            return `ep-${showId}-${season}-${episode}`;
          }}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <FlashList
          data={rated}
          renderItem={({ item }) => <ActivityRatingCard item={item} onPress={handleItemPress} />}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={styles.listContent}
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
  summaryCard: {
    backgroundColor: COLORS.surface,
    margin: SPACING.m,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.l,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  summaryValue: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  summaryLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  topGenresRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.m,
    paddingTop: SPACING.m,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceLight,
    gap: SPACING.s,
  },
  topGenresLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  topGenresValue: {
    fontSize: FONT_SIZE.s,
    color: COLORS.text,
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.m,
    gap: SPACING.s,
    marginBottom: SPACING.s,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  tabButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  tabLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: COLORS.text,
    fontWeight: '600',
  },
  countBadge: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.xs,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.s,
    minWidth: 20,
    alignItems: 'center',
  },
  countBadgeActive: {
    backgroundColor: COLORS.primary,
  },
  countText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  countTextActive: {
    color: COLORS.white,
  },
  listContent: {
    paddingHorizontal: SPACING.m,
    paddingBottom: SPACING.xxl,
  },
  emptyTabContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyTabText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  separator: {
    height: SPACING.s,
  },
});
