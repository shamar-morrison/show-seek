import { ActivityRatingCard } from '@/src/components/library/ActivityRatingCard';
import { EmptyState } from '@/src/components/library/EmptyState';
import { MediaListCard } from '@/src/components/library/MediaListCard';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useCurrentTab } from '@/src/context/TabContext';
import { useMonthDetail } from '@/src/hooks/useHistory';
import { HORIZONTAL_SCROLL_PROPS } from '@/src/components/ui/horizontalScrollProps';
import { screenStyles } from '@/src/styles/screenStyles';
import { formatWatchHours } from '@/src/utils/formatWatchTime';
import type { ListMediaItem } from '@/src/services/ListService';
import type { ActivityItem, MonthWatchedItem } from '@/src/types/history';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  Calendar03Icon,
  Clock01Icon,
  PlusSignIcon,
  StarIcon,
  Tv01Icon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';
import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, ScrollView, ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type TabType = 'watched' | 'rated' | 'added';

/**
 * Tab button component
 *
 * Follows the app-wide tab pattern (Cast/Crew tabs, CategoryTabs):
 * compact content-sized pills, borderless surface background, accent fill
 * when active. Tabs that overflow the screen width scroll horizontally.
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
  icon: IconSvgElement;
  iconColor: string;
}) {
  const { accentColor } = useAccentColor();
  const displayCount = count > 99 ? '99+' : count.toString();

  return (
    <TouchableOpacity
      style={[styles.tabButton, isActive && { backgroundColor: accentColor }]}
      onPress={onPress}
      activeOpacity={ACTIVE_OPACITY}
    >
      <AppIcon icon={Icon} size={16} color={isActive ? COLORS.white : iconColor} />
      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
        <Text style={[styles.countText, isActive && { color: accentColor }]}>
          {displayCount}
        </Text>
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
  const { t } = useTranslation();
  const movieLabel = t('media.movie');
  const tvShowLabel = t('media.tvShow');
  const { month } = useLocalSearchParams<{ month: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { accentColor } = useAccentColor();
  const { data: monthDetail, isLoading, isFetching } = useMonthDetail(month || null);
  // Background refresh (e.g. measured watch-time runtimes landing) only.
  const showRefreshIndicator = isFetching && !isLoading && !!monthDetail;
  const addedItems = useMemo(() => {
    if (!monthDetail) return [];

    return monthDetail.items.added
      .filter(
        (
          item
        ): item is ActivityItem & {
          mediaType: 'movie' | 'tv';
        } => item.mediaType === 'movie' || item.mediaType === 'tv'
      )
      .map(
        (item): ListMediaItem => ({
          id: extractNumericId(item.id),
          title: item.title,
          poster_path: item.posterPath,
          media_type: item.mediaType,
          vote_average: item.voteAverage || 0,
          release_date: item.releaseDate || '',
          addedAt: item.timestamp,
          genre_ids: item.genreIds,
        })
      );
  }, [monthDetail]);
  const filteredAddedCount = addedItems.length;

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

    const { watched, rated } = monthDetail.items;
    if (watched.length > 0) {
      setActiveTab('watched');
    } else if (rated.length > 0) {
      setActiveTab('rated');
    } else if (filteredAddedCount > 0) {
      setActiveTab('added');
    }
    setHasInitializedTab(true);
  }, [filteredAddedCount, hasInitializedTab, monthDetail]);

  const handleItemPress = useCallback(
    (item: ActivityItem) => {
      if (!currentTab) return;

      if (item.mediaType === 'episode' && item.tvShowId) {
        router.push(`/(tabs)/${currentTab}/tv/${item.tvShowId}` as any);
      } else if (
        item.mediaType === 'season' &&
        item.tvShowId &&
        typeof item.seasonNumber === 'number'
      ) {
        router.push(
          `/(tabs)/${currentTab}/tv/${item.tvShowId}/seasons?season=${item.seasonNumber}` as any
        );
      } else if (item.mediaType === 'movie') {
        router.push(`/(tabs)/${currentTab}/movie/${item.id}` as any);
      } else if (item.mediaType === 'tv') {
        router.push(`/(tabs)/${currentTab}/tv/${item.id}` as any);
      }
    },
    [currentTab, router]
  );

  const handleWatchedItemPress = useCallback(
    (item: MonthWatchedItem) => {
      if (!currentTab) return;

      const mediaId = extractNumericId(item.id);

      if (item.mediaType === 'movie') {
        router.push(`/(tabs)/${currentTab}/movie/${mediaId}` as any);
      } else {
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

  const watchedItems = useMemo(
    () =>
      monthDetail?.items.watched.map((item) => ({
        item,
        media: {
          id: extractNumericId(item.id),
          title: item.title,
          poster_path: item.posterPath,
          media_type: item.mediaType,
          vote_average: item.voteAverage || 0,
          release_date: item.releaseDate || '',
          addedAt: item.timestamp,
        } satisfies ListMediaItem,
        subtitle:
          item.kind === 'episode-group'
            ? t('media.numberOfEpisodes', { count: item.episodeCount })
            : undefined,
      })) ?? [],
    [monthDetail, t]
  );

  const currentItemCount = useMemo(() => {
    if (!monthDetail) return 0;

    if (activeTab === 'watched') return monthDetail.items.watched.length;
    if (activeTab === 'rated') return monthDetail.items.rated.length;
    return filteredAddedCount;
  }, [activeTab, filteredAddedCount, monthDetail]);

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (!monthDetail) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={Calendar03Icon}
          title={t('stats.monthDetail.noDataTitle')}
          description={t('stats.monthDetail.noDataDescription')}
        />
      </SafeAreaView>
    );
  }

  const { watched, rated } = monthDetail.items;
  const hasNoActivity = watched.length === 0 && rated.length === 0 && filteredAddedCount === 0;

  if (hasNoActivity) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={Calendar03Icon}
          title={t('stats.monthDetail.noActivityTitle')}
          description={t('stats.monthDetail.noActivityDescription')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      <View style={styles.divider} />

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        {showRefreshIndicator && (
          <ActivityIndicator
            size="small"
            color={COLORS.textSecondary}
            style={styles.summaryRefreshIndicator}
            accessibilityLabel={t('stats.updatingTotals')}
            testID="month-detail-refresh-indicator"
          />
        )}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <AppIcon icon={Tv01Icon} size={20} color={accentColor} />
            <Text style={styles.summaryValue}>{monthDetail.stats.watched}</Text>
            <Text style={styles.summaryLabel}>{t('stats.watched')}</Text>
          </View>
          <View style={styles.summaryItem}>
            <AppIcon icon={StarIcon} size={20} color={COLORS.warning} />
            <Text style={styles.summaryValue}>{monthDetail.stats.averageRating ?? '-'}</Text>
            <Text style={styles.summaryLabel}>{t('stats.avgRating')}</Text>
          </View>
          <View style={styles.summaryItem}>
            <AppIcon icon={PlusSignIcon} size={20} color={COLORS.success} />
            <Text style={styles.summaryValue}>{filteredAddedCount}</Text>
            <Text style={styles.summaryLabel}>{t('stats.added')}</Text>
          </View>
        </View>

        <View style={styles.summaryWatchTimeRow}>
          <View style={styles.summaryWatchTimeTotal}>
            <AppIcon icon={Clock01Icon} size={20} color={accentColor} />
            <Text style={styles.summaryValue}>
              {formatWatchHours(monthDetail.stats.totalWatchMinutes)}
            </Text>
          </View>
          <Text style={styles.summaryLabel}>{t('stats.watchTime')}</Text>
        </View>

        {monthDetail.stats.topGenres.length > 0 && (
          <View style={styles.topGenresRow}>
            <Text style={styles.topGenresLabel}>{t('stats.topGenres')}</Text>
            <Text style={styles.topGenresValue}>{monthDetail.stats.topGenres.join(', ')}</Text>
          </View>
        )}
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <ScrollView
          {...HORIZONTAL_SCROLL_PROPS}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
          testID="month-tab-bar"
        >
        <TabButton
          label={t('stats.watched')}
          count={monthDetail.stats.watched}
          isActive={activeTab === 'watched'}
          onPress={() => setActiveTab('watched')}
          icon={Tv01Icon}
          iconColor={accentColor}
        />
        <TabButton
          label={t('stats.rated')}
          count={rated.length}
          isActive={activeTab === 'rated'}
          onPress={() => setActiveTab('rated')}
          icon={StarIcon}
          iconColor={COLORS.warning}
        />
        <TabButton
          label={t('stats.added')}
          count={filteredAddedCount}
          isActive={activeTab === 'added'}
          onPress={() => setActiveTab('added')}
          icon={PlusSignIcon}
          iconColor={COLORS.success}
        />
        </ScrollView>
      </View>

      {/* Content based on active tab */}
      {currentItemCount === 0 ? (
        <View style={styles.emptyTabContent}>
          <Text style={styles.emptyTabText}>{t(`stats.monthDetail.emptyTab.${activeTab}`)}</Text>
        </View>
      ) : activeTab === 'added' ? (
        <FlashList
          data={addedItems}
          renderItem={({ item }) => (
            <MediaListCard
              item={item}
              onPress={handleListItemPress}
              movieLabel={movieLabel}
              tvShowLabel={tvShowLabel}
            />
          )}
          keyExtractor={(item) => `${item.id}-${item.addedAt}`}
          getItemType={(item) => item.media_type}
          drawDistance={400}
          contentContainerStyle={styles.listContent}
        />
      ) : activeTab === 'watched' ? (
        <FlashList
          data={watchedItems}
          renderItem={({ item }) => (
            <MediaListCard
              item={item.media}
              onPress={() => handleWatchedItemPress(item.item)}
              subtitle={item.subtitle}
              movieLabel={movieLabel}
              tvShowLabel={tvShowLabel}
            />
          )}
          keyExtractor={({ item }) => `${item.kind}-${item.mediaType}-${item.id}`}
          getItemType={({ item }) =>
            item.kind === 'episode-group' ? 'episode-group' : `media-${item.mediaType}`
          }
          drawDistance={400}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <FlashList
          data={rated}
          renderItem={({ item }) => (
            <ActivityRatingCard item={item} onPress={handleItemPress} t={t} />
          )}
          keyExtractor={(item) => `${item.id}-${item.timestamp}`}
          getItemType={(item) => `rated-${item.mediaType}`}
          drawDistance={400}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    margin: SPACING.m,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.l,
  },
  summaryRefreshIndicator: {
    position: 'absolute',
    top: SPACING.s,
    right: SPACING.s,
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
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
  },
  summaryLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  summaryWatchTimeRow: {
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.m,
    paddingTop: SPACING.m,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceLight,
  },
  summaryWatchTimeTotal: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
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
    marginBottom: SPACING.s,
  },
  tabBarContent: {
    paddingHorizontal: SPACING.m,
    gap: SPACING.s,
  },
  tabButton: {
    flexShrink: 0,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
  },
  tabLabel: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
  },
  tabLabelActive: {
    color: COLORS.white,
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
    backgroundColor: COLORS.white,
  },
  countText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
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
