import { getImageUrl } from '@/src/api/tmdb';
import { EmptyState } from '@/src/components/library/EmptyState';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useMonthDetail } from '@/src/hooks/useHistory';
import type { ActivityItem } from '@/src/types/history';
import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Calendar, Plus, Star, Tv } from 'lucide-react-native';
import React, { useCallback, useLayoutEffect } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
 * Activity item row component
 */
function ActivityRow({ item, onPress }: { item: ActivityItem; onPress?: () => void }) {
  const hasPoster = !!item.posterPath;

  return (
    <TouchableOpacity
      style={styles.activityRow}
      onPress={onPress}
      activeOpacity={onPress ? ACTIVE_OPACITY : 1}
      disabled={!onPress}
    >
      {hasPoster ? (
        <Image
          source={{ uri: getImageUrl(item.posterPath!, 'w92') ?? undefined }}
          style={styles.poster}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.poster, styles.posterPlaceholder]}>
          <Tv size={20} color={COLORS.textSecondary} />
        </View>
      )}

      <View style={styles.activityInfo}>
        <Text style={styles.activityTitle} numberOfLines={2}>
          {item.title}
        </Text>

        {item.type === 'watched' && item.seasonNumber && item.episodeNumber && (
          <Text style={styles.activityMeta}>
            S{item.seasonNumber} E{item.episodeNumber}
            {item.tvShowName ? ` • ${item.tvShowName}` : ''}
          </Text>
        )}

        {item.type === 'rated' && item.seasonNumber && item.episodeNumber && (
          <Text style={styles.activityMeta}>
            S{item.seasonNumber} E{item.episodeNumber}
          </Text>
        )}

        {item.type === 'added' && item.listName && (
          <Text style={styles.activityMeta}>Added to {item.listName}</Text>
        )}

        <Text style={styles.activityDate}>{formatDate(item.timestamp)}</Text>
      </View>

      {item.type === 'rated' && item.rating && (
        <View style={styles.ratingBadge}>
          <Star size={14} color={COLORS.warning} fill={COLORS.warning} />
          <Text style={styles.ratingText}>{item.rating}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/**
 * Section data type
 */
interface SectionData {
  title: string;
  icon: typeof Tv;
  iconColor: string;
  data: ActivityItem[];
}

export default function MonthDetailScreen() {
  const { month } = useLocalSearchParams<{ month: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { data: monthDetail, isLoading } = useMonthDetail(month || null);

  // Set the header title
  useLayoutEffect(() => {
    if (monthDetail?.monthName) {
      navigation.setOptions({
        title: monthDetail.monthName,
      });
    }
  }, [navigation, monthDetail?.monthName]);

  const handleItemPress = useCallback(
    (item: ActivityItem) => {
      if (!currentTab) return;

      // Navigate to detail screen based on media type
      if (item.mediaType === 'movie') {
        router.push(`/(tabs)/${currentTab}/movie/${item.id}` as any);
      } else if (item.mediaType === 'tv' && item.tvShowName) {
        // For TV shows, navigate to the show
        const tvShowId = typeof item.id === 'string' ? item.id.split('-')[1] : item.id;
        router.push(`/(tabs)/${currentTab}/tv/${tvShowId}` as any);
      }
    },
    [currentTab, router]
  );

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

  // Build sections
  const sections: SectionData[] = [];

  if (monthDetail.items.watched.length > 0) {
    sections.push({
      title: `Watched (${monthDetail.items.watched.length})`,
      icon: Tv,
      iconColor: COLORS.primary,
      data: monthDetail.items.watched,
    });
  }

  if (monthDetail.items.rated.length > 0) {
    sections.push({
      title: `Rated (${monthDetail.items.rated.length})`,
      icon: Star,
      iconColor: COLORS.warning,
      data: monthDetail.items.rated,
    });
  }

  if (monthDetail.items.added.length > 0) {
    sections.push({
      title: `Added to Lists (${monthDetail.items.added.length})`,
      icon: Plus,
      iconColor: COLORS.success,
      data: monthDetail.items.added,
    });
  }

  const hasNoActivity = sections.length === 0;

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

      <SectionList
        sections={sections}
        renderItem={({ item }) => (
          <ActivityRow
            item={item}
            onPress={item.mediaType !== 'episode' ? () => handleItemPress(item) : undefined}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <section.icon size={18} color={section.iconColor} />
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
      />
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
    margin: SPACING.l,
    marginBottom: 0,
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
  listContent: {
    padding: SPACING.l,
    paddingBottom: SPACING.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    paddingVertical: SPACING.s,
    backgroundColor: COLORS.background,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.text,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.s,
    gap: SPACING.m,
  },
  poster: {
    width: 50,
    height: 75,
    borderRadius: BORDER_RADIUS.s,
  },
  posterPlaceholder: {
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityInfo: {
    flex: 1,
    gap: SPACING.xs,
  },
  activityTitle: {
    fontSize: FONT_SIZE.s,
    fontWeight: '500',
    color: COLORS.text,
  },
  activityMeta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  activityDate: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.s,
  },
  ratingText: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.text,
  },
  separator: {
    height: SPACING.s,
  },
  sectionSeparator: {
    height: SPACING.l,
  },
});
