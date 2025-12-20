import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { EmptyState } from '@/src/components/library/EmptyState';
import { MediaListCard } from '@/src/components/library/MediaListCard';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useMonthDetail } from '@/src/hooks/useHistory';
import type { ListMediaItem } from '@/src/services/ListService';
import type { ActivityItem } from '@/src/types/history';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Calendar, Plus, Star, Tv } from 'lucide-react-native';
import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TabType = 'watched' | 'rated' | 'added';

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
  return (
    <TouchableOpacity
      style={[styles.tabButton, isActive && styles.tabButtonActive]}
      onPress={onPress}
      activeOpacity={ACTIVE_OPACITY}
    >
      <Icon size={16} color={isActive ? iconColor : COLORS.textSecondary} />
      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{label}</Text>
      <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
        <Text style={[styles.countText, isActive && styles.countTextActive]}>{count}</Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * Format timestamp to readable date
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Episode item row for watched episodes
 */
function EpisodeRow({ item }: { item: ActivityItem }) {
  return (
    <View style={styles.episodeRow}>
      <View style={[styles.episodePoster, styles.posterPlaceholder]}>
        <Tv size={20} color={COLORS.textSecondary} />
      </View>

      <View style={styles.episodeInfo}>
        <Text style={styles.episodeTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.seasonNumber && item.episodeNumber && (
          <Text style={styles.episodeMeta}>
            S{item.seasonNumber} E{item.episodeNumber}
            {item.tvShowName ? ` • ${item.tvShowName}` : ''}
          </Text>
        )}
        <Text style={styles.episodeDate}>{formatDate(item.timestamp)}</Text>
      </View>
    </View>
  );
}

/**
 * Rating item row with user rating badge
 */
function RatingRow({ item, onPress }: { item: ActivityItem; onPress?: () => void }) {
  const hasPoster = !!item.posterPath;

  return (
    <TouchableOpacity
      style={styles.ratingRow}
      onPress={onPress}
      activeOpacity={onPress ? ACTIVE_OPACITY : 1}
      disabled={!onPress}
    >
      {hasPoster ? (
        <Image
          source={{
            uri: getImageUrl(item.posterPath!, TMDB_IMAGE_SIZES.poster.small) ?? undefined,
          }}
          style={styles.ratingPoster}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.ratingPoster, styles.posterPlaceholder]}>
          <Tv size={20} color={COLORS.textSecondary} />
        </View>
      )}

      <View style={styles.ratingInfo}>
        <Text style={styles.ratingTitle} numberOfLines={2}>
          {item.title}
        </Text>
        {item.mediaType === 'episode' && item.seasonNumber && item.episodeNumber && (
          <Text style={styles.ratingMeta}>
            S{item.seasonNumber} E{item.episodeNumber}
          </Text>
        )}
        <Text style={styles.ratingDate}>{formatDate(item.timestamp)}</Text>
      </View>

      {item.rating && (
        <View style={styles.userRatingBadge}>
          <Star size={14} color={COLORS.warning} fill={COLORS.warning} />
          <Text style={styles.userRatingText}>{item.rating}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function MonthDetailScreen() {
  const { month } = useLocalSearchParams<{ month: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { data: monthDetail, isLoading } = useMonthDetail(month || null);

  const [activeTab, setActiveTab] = useState<TabType>('watched');

  // Set the header title
  useLayoutEffect(() => {
    if (monthDetail?.monthName) {
      navigation.setOptions({
        title: monthDetail.monthName,
      });
    }
  }, [navigation, monthDetail?.monthName]);

  // Determine initial active tab based on available data
  useLayoutEffect(() => {
    if (!monthDetail) return;

    const { watched, rated, added } = monthDetail.items;
    if (watched.length > 0) {
      setActiveTab('watched');
    } else if (rated.length > 0) {
      setActiveTab('rated');
    } else if (added.length > 0) {
      setActiveTab('added');
    }
  }, [monthDetail]);

  const handleItemPress = useCallback(
    (item: ActivityItem) => {
      if (!currentTab) return;

      // Navigate to detail screen based on media type
      if (item.mediaType === 'movie') {
        const mediaId = typeof item.id === 'string' ? item.id.replace('movie-', '') : item.id;
        router.push(`/(tabs)/${currentTab}/movie/${mediaId}` as any);
      } else if (item.mediaType === 'tv') {
        const mediaId = typeof item.id === 'string' ? item.id.replace('tv-', '') : item.id;
        router.push(`/(tabs)/${currentTab}/tv/${mediaId}` as any);
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

  // Convert ActivityItem to ListMediaItem for MediaListCard
  const addedItems = useMemo(() => {
    if (!monthDetail) return [];
    return monthDetail.items.added.map(
      (item): ListMediaItem => ({
        id: typeof item.id === 'string' ? parseInt(item.id, 10) : item.id,
        title: item.title,
        poster_path: item.posterPath,
        media_type: item.mediaType as 'movie' | 'tv',
        vote_average: 0,
        release_date: '',
        addedAt: item.timestamp,
        genre_ids: item.genreIds,
      })
    );
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
          data={watched}
          renderItem={({ item }) => <EpisodeRow item={item} />}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      ) : (
        <FlashList
          data={rated}
          renderItem={({ item }) => (
            <RatingRow
              item={item}
              onPress={item.mediaType !== 'episode' ? () => handleItemPress(item) : undefined}
            />
          )}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
  // Episode row styles
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.s,
    gap: SPACING.m,
  },
  episodePoster: {
    width: 60,
    height: 90,
    borderRadius: BORDER_RADIUS.s,
  },
  posterPlaceholder: {
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  episodeInfo: {
    flex: 1,
    gap: SPACING.xs,
  },
  episodeTitle: {
    fontSize: FONT_SIZE.s,
    fontWeight: '500',
    color: COLORS.text,
  },
  episodeMeta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  episodeDate: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  // Rating row styles
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.s,
    gap: SPACING.m,
  },
  ratingPoster: {
    width: 60,
    height: 90,
    borderRadius: BORDER_RADIUS.s,
  },
  ratingInfo: {
    flex: 1,
    gap: SPACING.xs,
  },
  ratingTitle: {
    fontSize: FONT_SIZE.s,
    fontWeight: '500',
    color: COLORS.text,
  },
  ratingMeta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  ratingDate: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  userRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.s,
  },
  userRatingText: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.text,
  },
});
