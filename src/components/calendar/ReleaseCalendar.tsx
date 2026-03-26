import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ReleaseCalendarSkeleton } from '@/src/components/calendar/ReleaseCalendarSkeleton';
import { CategoryTabs } from '@/src/components/ui/CategoryTabs';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { useProgressiveRender } from '@/src/hooks/useProgressiveRender';
import { useThemedStyles } from '@/src/hooks/useThemedStyles';
import type { UpcomingRelease } from '@/src/hooks/useUpcomingReleases';
import {
  getCalendarDayOffset,
  type CalendarDisplayItem,
  type CalendarGroupedDisplayItem,
  type CalendarMediaFilter,
  type CalendarPresentationMap,
  type CalendarRow,
} from '@/src/utils/calendarViewModel';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Bell, Calendar, CrownIcon, Film, Tv } from 'lucide-react-native';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

interface ReleaseCalendarProps {
  presentations: CalendarPresentationMap;
  activeMediaFilter?: CalendarMediaFilter;
  isLoading?: boolean;
  previewLimit?: number;
  showUpgradeOverlay?: boolean;
  onUpgradePress?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}

interface MediaTabState {
  scrollOffset: number;
  selectedTemporalTab: string | null;
}

type ReleaseCalendarListRef = FlashListRef<CalendarRow> & {
  scrollToOffset?: (params: { offset: number; animated: boolean }) => void;
};

const INITIAL_TAB_STATE: Record<CalendarMediaFilter, MediaTabState> = {
  all: {
    scrollOffset: 0,
    selectedTemporalTab: null,
  },
  movie: {
    scrollOffset: 0,
    selectedTemporalTab: null,
  },
  tv: {
    scrollOffset: 0,
    selectedTemporalTab: null,
  },
};

export function ReleaseCalendar({
  presentations,
  activeMediaFilter = 'all',
  isLoading,
  previewLimit,
  showUpgradeOverlay,
  onUpgradePress,
  refreshing = false,
  onRefresh,
}: ReleaseCalendarProps) {
  const router = useRouter();
  const { resolvePosterPath } = usePosterOverrides();
  const styles = useStyles();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { isReady } = useProgressiveRender(activeMediaFilter);
  const listRef = useRef<ReleaseCalendarListRef | null>(null);
  const tabStateRef = useRef<Record<CalendarMediaFilter, MediaTabState>>({
    all: { ...INITIAL_TAB_STATE.all },
    movie: { ...INITIAL_TAB_STATE.movie },
    tv: { ...INITIAL_TAB_STATE.tv },
  });
  const [selectedTemporalTab, setSelectedTemporalTab] = useState<string | null>(
    tabStateRef.current[activeMediaFilter].selectedTemporalTab
  );

  const presentation = presentations[activeMediaFilter];

  const handleSingleReleasePress = useCallback(
    (release: UpcomingRelease) => {
      if (release.mediaType === 'movie') {
        router.push({ pathname: '/(tabs)/home/movie/[id]', params: { id: release.id } });
        return;
      }

      if (
        release.nextEpisode &&
        Number.isInteger(release.nextEpisode.seasonNumber) &&
        release.nextEpisode.seasonNumber >= 0 &&
        Number.isInteger(release.nextEpisode.episodeNumber) &&
        release.nextEpisode.episodeNumber > 0
      ) {
        router.push({
          pathname: '/(tabs)/home/tv/[id]/season/[seasonNum]/episode/[episodeNum]',
          params: {
            id: release.id,
            seasonNum: release.nextEpisode.seasonNumber,
            episodeNum: release.nextEpisode.episodeNumber,
          },
        });
        return;
      }

      router.push({ pathname: '/(tabs)/home/tv/[id]', params: { id: release.id } });
    },
    [router]
  );

  const handleGroupedShowPress = useCallback(
    (groupedItem: CalendarGroupedDisplayItem) => {
      router.push({ pathname: '/(tabs)/home/tv/[id]', params: { id: groupedItem.showId } });
    },
    [router]
  );

  const handleUpgrade = useCallback(() => {
    if (onUpgradePress) {
      onUpgradePress();
      return;
    }

    router.push('/premium');
  }, [onUpgradePress, router]);

  const shouldShowUpgrade =
    showUpgradeOverlay ??
    (previewLimit !== undefined && presentation.totalContentCount > previewLimit);

  useLayoutEffect(() => {
    const nextSelectedTemporalTab = tabStateRef.current[activeMediaFilter].selectedTemporalTab;

    if (
      nextSelectedTemporalTab &&
      presentation.temporalTabAnchors[nextSelectedTemporalTab] === undefined
    ) {
      tabStateRef.current[activeMediaFilter].selectedTemporalTab = null;
      setSelectedTemporalTab(null);
      return;
    }

    setSelectedTemporalTab(nextSelectedTemporalTab);
  }, [activeMediaFilter, presentation.temporalTabAnchors]);

  useLayoutEffect(() => {
    if (!isReady) {
      return;
    }

    listRef.current?.scrollToOffset?.({
      offset: tabStateRef.current[activeMediaFilter].scrollOffset,
      animated: false,
    });
  }, [activeMediaFilter, isReady, presentation.rows]);

  const scrollToIndex = useCallback(async (index: number) => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    list.recordInteraction();

    try {
      await list.scrollToIndex({
        index,
        animated: true,
      });
    } catch {
      await list.scrollToEnd({ animated: true });
    }
  }, []);

  const handleTemporalTabChange = useCallback(
    (tabKey: string) => {
      if (tabStateRef.current[activeMediaFilter].selectedTemporalTab === tabKey) {
        return;
      }

      const targetIndex = presentation.temporalTabAnchors[tabKey];
      if (targetIndex === undefined) {
        return;
      }

      tabStateRef.current[activeMediaFilter].selectedTemporalTab = tabKey;
      setSelectedTemporalTab(tabKey);
      void scrollToIndex(targetIndex);
    },
    [activeMediaFilter, presentation.temporalTabAnchors, scrollToIndex]
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      tabStateRef.current[activeMediaFilter].scrollOffset = event.nativeEvent.contentOffset.y;
    },
    [activeMediaFilter]
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<CalendarRow>) => {
      if (item.type === 'section-header') {
        return (
          <View style={[styles.sectionHeader, index !== 0 && styles.sectionHeaderWithMargin]}>
            <Calendar size={18} color={accentColor} />
            <Text style={styles.sectionTitle}>{item.title}</Text>
          </View>
        );
      }

      if (item.type === 'grouped-release') {
        return (
          <View style={styles.releaseRowSpacing}>
            <GroupedReleaseCard
              mediaFilterKey={activeMediaFilter}
              item={item.item}
              onShowPress={handleGroupedShowPress}
              onEpisodePress={handleSingleReleasePress}
              resolvePosterPath={resolvePosterPath}
            />
          </View>
        );
      }

      return (
        <View style={styles.releaseRowSpacing}>
          <SingleReleaseCard
            mediaFilterKey={activeMediaFilter}
            item={item.item}
            onPress={handleSingleReleasePress}
            resolvePosterPath={resolvePosterPath}
          />
        </View>
      );
    },
    [
      accentColor,
      activeMediaFilter,
      handleGroupedShowPress,
      handleSingleReleasePress,
      resolvePosterPath,
      styles,
    ]
  );

  const listFooter = useMemo(() => {
    if (!shouldShowUpgrade) {
      return null;
    }

    return (
      <View
        style={styles.upgradeOverlayContainer}
        testID={buildMediaTestId(activeMediaFilter, 'upgrade-overlay')}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.75)']}
          locations={[0, 0.6, 1]}
          style={styles.upgradeShadow}
        />
        <View style={styles.upgradeCard}>
          <CrownIcon size={30} color={accentColor} style={styles.upgradeIcon} />
          <Text style={styles.upgradeTitle}>{t('calendar.upgradeForFullExperience')}</Text>
          <Pressable
            testID={buildMediaTestId(activeMediaFilter, 'upgrade-button')}
            style={({ pressed }) => [styles.upgradeButton, pressed && styles.upgradeButtonPressed]}
            onPress={handleUpgrade}
          >
            <Text style={styles.upgradeButtonText}>{t('calendar.upgradeToPremium')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }, [accentColor, activeMediaFilter, handleUpgrade, shouldShowUpgrade, styles, t]);

  if (isLoading) {
    return <ReleaseCalendarSkeleton />;
  }

  if (!isReady) {
    return <ReleaseCalendarSkeleton showMediaFilterRow={false} />;
  }

  return (
    <View style={styles.container}>
      {presentation.temporalTabs.length > 0 ? (
        <View style={styles.temporalTabsContainer}>
          <CategoryTabs
            tabs={presentation.temporalTabs.map((tab) => ({
              key: tab.key,
              label: tab.label,
            }))}
            activeKey={selectedTemporalTab ?? presentation.temporalTabs[0].key}
            onChange={handleTemporalTabChange}
            testID={buildMediaTestId(activeMediaFilter, 'temporal-tabs')}
          />
        </View>
      ) : null}

      <FlashList<CalendarRow>
        ref={listRef}
        testID={buildMediaTestId(activeMediaFilter, 'section-list')}
        style={styles.content}
        data={presentation.rows}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemType={getItemType}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        drawDistance={600}
        ListFooterComponent={listFooter}
      />
    </View>
  );
}

function keyExtractor(item: CalendarRow) {
  return item.key;
}

function getItemType(item: CalendarRow) {
  return item.type;
}

function buildMediaTestId(mediaFilter: CalendarMediaFilter, suffix: string) {
  return `release-calendar-${suffix}-${mediaFilter}`;
}

interface SingleReleaseCardProps {
  mediaFilterKey: CalendarMediaFilter;
  item: Extract<CalendarDisplayItem, { type: 'single' }>;
  onPress: (release: UpcomingRelease) => void;
  resolvePosterPath: (
    mediaType: UpcomingRelease['mediaType'],
    mediaId: number,
    fallbackPosterPath: string | null | undefined
  ) => string | null;
}

const SingleReleaseCard = React.memo(function SingleReleaseCard({
  mediaFilterKey,
  item,
  onPress,
  resolvePosterPath,
}: SingleReleaseCardProps) {
  const { t } = useTranslation();
  const styles = useStyles();

  const handlePress = useCallback(() => {
    onPress(item.release);
  }, [item.release, onPress]);

  return (
    <Pressable
      testID={buildMediaTestId(mediaFilterKey, `single-${item.release.uniqueKey}`)}
      style={({ pressed }) => [styles.releaseCard, pressed && styles.releaseCardPressed]}
      onPress={handlePress}
    >
      <ReleaseDateColumn date={item.releaseDate} />
      <CardMediaInfoShell
        contentTestID={buildMediaTestId(mediaFilterKey, `single-content-${item.release.uniqueKey}`)}
        title={item.release.title}
        mediaType={item.release.mediaType}
        mediaId={item.release.id}
        posterPath={item.release.posterPath}
        backdropPath={item.release.backdropPath}
        isReminder={item.release.isReminder}
        releaseDate={item.releaseDate}
        resolvePosterPath={resolvePosterPath}
        body={
          item.release.nextEpisode ? (
            <View>
              <Text style={styles.episodeInfo}>
                {t('calendar.seasonEpisode', {
                  season: item.release.nextEpisode.seasonNumber,
                  episode: item.release.nextEpisode.episodeNumber,
                })}
              </Text>
              {item.release.nextEpisode.episodeName ? (
                <Text numberOfLines={1} style={styles.episodeName}>
                  {item.release.nextEpisode.episodeName}
                </Text>
              ) : null}
            </View>
          ) : null
        }
      />
    </Pressable>
  );
});

interface GroupedReleaseCardProps {
  mediaFilterKey: CalendarMediaFilter;
  item: CalendarGroupedDisplayItem;
  onShowPress: (item: CalendarGroupedDisplayItem) => void;
  onEpisodePress: (release: UpcomingRelease) => void;
  resolvePosterPath: (
    mediaType: UpcomingRelease['mediaType'],
    mediaId: number,
    fallbackPosterPath: string | null | undefined
  ) => string | null;
}

const GroupedReleaseCard = React.memo(function GroupedReleaseCard({
  mediaFilterKey,
  item,
  onShowPress,
  onEpisodePress,
  resolvePosterPath,
}: GroupedReleaseCardProps) {
  const { t, i18n } = useTranslation();
  const styles = useStyles();

  const handleShowPress = useCallback(() => {
    onShowPress(item);
  }, [item, onShowPress]);

  return (
    <View style={styles.releaseCard}>
      <ReleaseDateColumn date={item.releaseDate} />
      <View style={styles.groupedMediaInfo}>
        <Pressable
          testID={buildMediaTestId(mediaFilterKey, `group-${item.key}`)}
          style={({ pressed }) => [
            styles.groupedHeaderPressable,
            pressed && styles.releaseCardPressed,
          ]}
          onPress={handleShowPress}
        >
          <CardMediaInfoShell
            contentTestID={buildMediaTestId(mediaFilterKey, `group-content-${item.key}`)}
            title={item.title}
            mediaType="tv"
            mediaId={item.showId}
            posterPath={item.posterPath}
            backdropPath={item.backdropPath}
            isReminder={item.isReminder}
            releaseDate={item.releaseDate}
            resolvePosterPath={resolvePosterPath}
            body={
              <Text style={styles.episodeInfo}>
                {t('calendar.upcomingEpisodesCount', { count: item.episodes.length })}
              </Text>
            }
          />
        </Pressable>

        <View style={styles.groupedEpisodeList}>
          {item.episodes.map((episode, index) => (
            <Pressable
              key={episode.uniqueKey}
              testID={buildMediaTestId(mediaFilterKey, `grouped-episode-${episode.uniqueKey}`)}
              style={({ pressed }) => [
                styles.episodeRow,
                index > 0 && styles.episodeRowBorder,
                pressed && styles.episodeRowPressed,
              ]}
              onPress={() => onEpisodePress(episode)}
            >
              <View style={styles.episodeRowText}>
                <Text style={styles.episodeRowLabel} numberOfLines={1}>
                  {t('calendar.seasonEpisode', {
                    season: episode.nextEpisode?.seasonNumber ?? 0,
                    episode: episode.nextEpisode?.episodeNumber ?? 0,
                  })}
                </Text>
                {episode.nextEpisode?.episodeName ? (
                  <Text numberOfLines={1} style={styles.episodeRowTitle}>
                    {episode.nextEpisode.episodeName}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.episodeRowDate}>
                {formatEpisodeDate(episode.releaseDate, i18n.language, t)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
});

interface CardMediaInfoShellProps {
  contentTestID?: string;
  title: string;
  mediaType: UpcomingRelease['mediaType'];
  mediaId: number;
  posterPath: string | null;
  backdropPath: string | null;
  isReminder: boolean;
  releaseDate: Date;
  resolvePosterPath: (
    mediaType: UpcomingRelease['mediaType'],
    mediaId: number,
    fallbackPosterPath: string | null | undefined
  ) => string | null;
  body?: React.ReactNode;
}

function CardMediaInfoShell({
  contentTestID,
  title,
  mediaType,
  mediaId,
  posterPath,
  backdropPath,
  isReminder,
  releaseDate,
  resolvePosterPath,
  body,
}: CardMediaInfoShellProps) {
  const styles = useStyles();
  const { t } = useTranslation();

  const resolvedPosterPath = resolvePosterPath(mediaType, mediaId, posterPath);
  const imageUrl =
    getImageUrl(backdropPath, TMDB_IMAGE_SIZES.backdrop.medium) ||
    getImageUrl(resolvedPosterPath, TMDB_IMAGE_SIZES.poster.medium);

  return (
    <View style={styles.mediaInfo}>
      <View style={styles.previewContainer}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.backdrop}
            contentFit="cover"
            transition={200}
            recyclingKey={imageUrl}
          />
        ) : (
          <View style={[styles.backdrop, styles.placeholderBackdrop]}>
            {mediaType === 'movie' ? (
              <Film size={32} color={COLORS.textSecondary} />
            ) : (
              <Tv size={32} color={COLORS.textSecondary} />
            )}
          </View>
        )}
      </View>

      <View style={styles.metaPanel} testID={contentTestID}>
        <View style={styles.titleRow}>
          <Text style={styles.releaseTitle} numberOfLines={2}>
            {title}
          </Text>
          {isReminder ? (
            <View style={styles.reminderBadge}>
              <Bell size={12} color={COLORS.warning} />
            </View>
          ) : null}
        </View>
        {body}
        <View style={styles.countdownRow}>
          <Text style={styles.countdown}>{getCountdownLabel(releaseDate, t)}</Text>
          <View style={styles.metaBadgeRow}>
            <View style={styles.mediaTypeBadge}>
              {mediaType === 'movie' ? (
                <Film size={12} color={COLORS.white} />
              ) : (
                <Tv size={12} color={COLORS.white} />
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function ReleaseDateColumn({ date }: { date: Date }) {
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const isToday = getCalendarDayOffset(date) === 0;

  return (
    <View style={[styles.dateColumn, isToday && styles.dateColumnToday]}>
      <Text style={[styles.dateDay, isToday && styles.dateDayHighlight]}>{date.getDate()}</Text>
      <Text style={[styles.dateMonth, isToday && styles.dateMonthHighlight]}>
        {date
          .toLocaleDateString(i18n.language, { month: 'short' })
          .toLocaleUpperCase(i18n.language)}
      </Text>
      {isToday ? (
        <View style={styles.todayBadge}>
          <Text style={styles.todayBadgeText}>{t('calendar.today')}</Text>
        </View>
      ) : null}
    </View>
  );
}

function formatEpisodeDate(
  releaseDate: Date,
  locale: string,
  t: ReturnType<typeof useTranslation>['t']
): string {
  const dayOffset = getCalendarDayOffset(releaseDate);

  if (dayOffset === 0) {
    return t('calendar.today');
  }

  if (dayOffset === 1) {
    return t('calendar.tomorrow');
  }

  return releaseDate.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
  });
}

function getCountdownLabel(releaseDate: Date, t: ReturnType<typeof useTranslation>['t']): string {
  const dayOffset = getCalendarDayOffset(releaseDate);

  if (dayOffset === 0) {
    return t('calendar.today');
  }

  if (dayOffset === 1) {
    return t('calendar.tomorrow');
  }

  return t('calendar.inDays', { count: dayOffset });
}

const useStyles = () =>
  useThemedStyles(({ accentColor }) => ({
    container: {
      flex: 1,
    },
    temporalTabsContainer: {
      borderBottomWidth: 1,
      borderBottomColor: COLORS.surfaceLight,
    },
    content: {
      flex: 1,
    },
    listContent: {
      paddingBottom: SPACING.xl,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.m,
      paddingTop: SPACING.m,
      paddingBottom: SPACING.s,
      backgroundColor: COLORS.background,
      gap: SPACING.s,
    },
    sectionHeaderWithMargin: {
      marginTop: SPACING.m,
    },
    sectionTitle: {
      fontSize: FONT_SIZE.l,
      fontWeight: '700',
      color: COLORS.text,
    },
    releaseRowSpacing: {
      marginBottom: SPACING.s,
    },
    releaseCard: {
      flexDirection: 'row',
      marginHorizontal: SPACING.m,
      borderRadius: BORDER_RADIUS.l,
      overflow: 'hidden',
      backgroundColor: COLORS.surface,
      borderWidth: 1,
      borderColor: COLORS.surfaceLight,
    },
    releaseCardPressed: {
      opacity: ACTIVE_OPACITY,
    },
    dateColumn: {
      width: 60,
      paddingVertical: SPACING.m,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.surfaceLight,
    },
    dateColumnToday: {
      backgroundColor: accentColor,
    },
    dateDay: {
      fontSize: 24,
      fontWeight: '700',
      color: COLORS.text,
    },
    dateDayHighlight: {
      color: COLORS.white,
    },
    dateMonth: {
      fontSize: FONT_SIZE.xs,
      color: COLORS.textSecondary,
      fontWeight: '600',
    },
    dateMonthHighlight: {
      color: COLORS.white,
    },
    todayBadge: {
      marginTop: SPACING.xs,
      paddingHorizontal: SPACING.xs,
      paddingVertical: 2,
      backgroundColor: COLORS.white,
      borderRadius: BORDER_RADIUS.s,
    },
    todayBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: accentColor,
    },
    mediaInfo: {
      flex: 1,
    },
    groupedMediaInfo: {
      flex: 1,
      backgroundColor: COLORS.black,
    },
    groupedHeaderPressable: {
      flex: 1,
    },
    previewContainer: {
      height: 88,
      position: 'relative',
      backgroundColor: COLORS.surfaceLight,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    placeholderBackdrop: {
      backgroundColor: COLORS.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    metaPanel: {
      backgroundColor: COLORS.black,
      paddingHorizontal: SPACING.s,
      paddingVertical: SPACING.s,
      gap: SPACING.xs,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.xs,
    },
    releaseTitle: {
      fontSize: FONT_SIZE.m,
      fontWeight: '700',
      color: COLORS.white,
      flex: 1,
      lineHeight: 20,
    },
    reminderBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.12)',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 1,
    },
    episodeInfo: {
      fontSize: FONT_SIZE.xs,
      color: COLORS.textSecondary,
    },
    episodeName: {
      fontSize: FONT_SIZE.xs,
      color: COLORS.white,
      marginTop: 2,
    },
    countdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.s,
      marginTop: SPACING.xs / 2,
    },
    countdown: {
      flex: 1,
      fontSize: FONT_SIZE.xs,
      color: accentColor,
      fontWeight: '600',
    },
    metaBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
    },
    mediaTypeBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: COLORS.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    groupedEpisodeList: {
      backgroundColor: COLORS.black,
    },
    episodeRow: {
      minHeight: 52,
      paddingHorizontal: SPACING.m,
      paddingVertical: SPACING.s,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.s,
    },
    episodeRowBorder: {
      borderTopWidth: 1,
      borderTopColor: COLORS.surfaceLight,
    },
    episodeRowPressed: {
      opacity: ACTIVE_OPACITY,
    },
    episodeRowText: {
      flex: 1,
      minWidth: 0,
    },
    episodeRowLabel: {
      color: COLORS.text,
      fontSize: FONT_SIZE.s,
      fontWeight: '600',
    },
    episodeRowTitle: {
      color: COLORS.textSecondary,
      fontSize: FONT_SIZE.xs,
      marginTop: 2,
    },
    episodeRowDate: {
      color: accentColor,
      fontSize: FONT_SIZE.xs,
      fontWeight: '600',
    },
    upgradeOverlayContainer: {
      marginTop: SPACING.l,
      marginHorizontal: SPACING.m,
      borderRadius: BORDER_RADIUS.l,
      overflow: 'hidden',
      backgroundColor: COLORS.surface,
    },
    upgradeShadow: {
      height: 72,
      width: '100%',
    },
    upgradeCard: {
      backgroundColor: 'rgba(0,0,0,0.78)',
      paddingHorizontal: SPACING.l,
      paddingBottom: SPACING.l,
      alignItems: 'center',
      gap: SPACING.m,
    },
    upgradeIcon: {
      marginTop: -30,
    },
    upgradeTitle: {
      fontSize: FONT_SIZE.m,
      fontWeight: '700',
      color: COLORS.white,
      textAlign: 'center',
    },
    upgradeButton: {
      backgroundColor: accentColor,
      paddingHorizontal: SPACING.l,
      paddingVertical: SPACING.s + 2,
      borderRadius: BORDER_RADIUS.m,
    },
    upgradeButtonPressed: {
      opacity: ACTIVE_OPACITY,
    },
    upgradeButtonText: {
      color: COLORS.white,
      fontSize: FONT_SIZE.s,
      fontWeight: '700',
    },
  }));
