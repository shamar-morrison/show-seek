import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { CategoryTabs } from '@/src/components/ui/CategoryTabs';
import { ReleaseCalendarSkeleton } from '@/src/components/calendar/ReleaseCalendarSkeleton';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { useThemedStyles } from '@/src/hooks/useThemedStyles';
import type { UpcomingRelease } from '@/src/hooks/useUpcomingReleases';
import {
  buildCalendarPresentation,
  type CalendarDisplayItem,
  type CalendarGroupedDisplayItem,
  type CalendarMediaFilter,
  type CalendarPresentation,
  type CalendarRow,
  type CalendarSortMode,
  getCalendarDayOffset,
} from '@/src/utils/calendarViewModel';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Bell, Calendar, CrownIcon, Film, Tv } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface ReleaseCalendarProps {
  releases: UpcomingRelease[];
  activeMediaFilter?: CalendarMediaFilter;
  sortMode: CalendarSortMode;
  isLoading?: boolean;
  previewLimit?: number;
  showUpgradeOverlay?: boolean;
  onUpgradePress?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}

const MEDIA_FILTER_KEYS: CalendarMediaFilter[] = ['all', 'movie', 'tv'];

export function ReleaseCalendar({
  releases,
  activeMediaFilter = 'all',
  sortMode,
  isLoading,
  previewLimit,
  showUpgradeOverlay,
  onUpgradePress,
  refreshing = false,
  onRefresh,
}: ReleaseCalendarProps) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { resolvePosterPath } = usePosterOverrides();
  const styles = useStyles();

  const labels = useMemo(
    () => ({
      today: t('calendar.today'),
      tomorrow: t('calendar.tomorrow'),
      thisWeek: t('common.thisWeek'),
      nextWeek: t('calendar.nextWeek'),
      movies: t('media.movies'),
      tvShows: t('media.tvShows'),
    }),
    [t]
  );

  const presentations = useMemo(() => {
    const buildPresentationFor = (mediaFilter: CalendarMediaFilter) =>
      buildCalendarPresentation({
        releases:
          mediaFilter === 'all'
            ? releases
            : releases.filter((release) => release.mediaType === mediaFilter),
        sortMode,
        previewLimit,
        locale: i18n.language,
        labels,
      });

    return {
      all: buildPresentationFor('all'),
      movie: buildPresentationFor('movie'),
      tv: buildPresentationFor('tv'),
    };
  }, [i18n.language, labels, previewLimit, releases, sortMode]);

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

  if (isLoading) {
    return <ReleaseCalendarSkeleton />;
  }

  return (
    <View style={styles.container}>
      {MEDIA_FILTER_KEYS.map((sceneKey) => (
        <View
          key={sceneKey}
          style={[styles.scene, sceneKey === activeMediaFilter ? styles.sceneActive : styles.sceneHidden]}
          pointerEvents={sceneKey === activeMediaFilter ? 'auto' : 'none'}
          testID={`release-calendar-scene-${sceneKey}`}
        >
          <CalendarListSceneContent
            sceneKey={sceneKey}
            presentation={presentations[sceneKey]}
            previewLimit={previewLimit}
            showUpgradeOverlay={showUpgradeOverlay}
            onUpgradePress={handleUpgrade}
            refreshing={refreshing}
            onRefresh={onRefresh}
            onSingleReleasePress={handleSingleReleasePress}
            onGroupedShowPress={handleGroupedShowPress}
            resolvePosterPath={resolvePosterPath}
          />
        </View>
      ))}
    </View>
  );
}

interface CalendarListSceneContentProps {
  sceneKey: CalendarMediaFilter;
  presentation: CalendarPresentation;
  previewLimit?: number;
  showUpgradeOverlay?: boolean;
  onUpgradePress: () => void;
  refreshing: boolean;
  onRefresh?: () => void;
  onSingleReleasePress: (release: UpcomingRelease) => void;
  onGroupedShowPress: (item: CalendarGroupedDisplayItem) => void;
  resolvePosterPath: (
    mediaType: UpcomingRelease['mediaType'],
    mediaId: number,
    fallbackPosterPath: string | null | undefined
  ) => string | null;
}

const CalendarListSceneContent = React.memo(function CalendarListSceneContent({
  sceneKey,
  presentation,
  previewLimit,
  showUpgradeOverlay,
  onUpgradePress,
  refreshing,
  onRefresh,
  onSingleReleasePress,
  onGroupedShowPress,
  resolvePosterPath,
}: CalendarListSceneContentProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const styles = useStyles();
  const listRef = useRef<FlashListRef<CalendarRow> | null>(null);
  const [selectedTemporalTab, setSelectedTemporalTab] = useState<string | null>(null);

  const shouldShowUpgrade =
    showUpgradeOverlay ??
    (previewLimit !== undefined && presentation.totalContentCount > previewLimit);

  useEffect(() => {
    if (selectedTemporalTab && presentation.temporalTabAnchors[selectedTemporalTab] === undefined) {
      setSelectedTemporalTab(null);
    }
  }, [presentation.temporalTabAnchors, selectedTemporalTab]);

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
      if (selectedTemporalTab === tabKey) {
        return;
      }

      const targetIndex = presentation.temporalTabAnchors[tabKey];
      if (targetIndex === undefined) {
        return;
      }

      setSelectedTemporalTab(tabKey);
      void scrollToIndex(targetIndex);
    },
    [presentation.temporalTabAnchors, scrollToIndex, selectedTemporalTab]
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
              sceneKey={sceneKey}
              item={item.item}
              onShowPress={onGroupedShowPress}
              onEpisodePress={onSingleReleasePress}
              resolvePosterPath={resolvePosterPath}
            />
          </View>
        );
      }

      return (
        <View style={styles.releaseRowSpacing}>
          <SingleReleaseCard
            sceneKey={sceneKey}
            item={item.item}
            onPress={onSingleReleasePress}
            resolvePosterPath={resolvePosterPath}
          />
        </View>
      );
    },
    [accentColor, onGroupedShowPress, onSingleReleasePress, resolvePosterPath, sceneKey, styles]
  );

  const listFooter = useMemo(() => {
    if (!shouldShowUpgrade) {
      return null;
    }

    return (
      <View
        style={styles.upgradeOverlayContainer}
        testID={buildSceneTestId(sceneKey, 'upgrade-overlay')}
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
            testID={buildSceneTestId(sceneKey, 'upgrade-button')}
            style={({ pressed }) => [styles.upgradeButton, pressed && styles.upgradeButtonPressed]}
            onPress={onUpgradePress}
          >
            <Text style={styles.upgradeButtonText}>{t('calendar.upgradeToPremium')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }, [accentColor, onUpgradePress, sceneKey, shouldShowUpgrade, styles, t]);

  return (
    <View style={styles.sceneContent}>
      {presentation.temporalTabs.length > 0 ? (
        <View style={styles.temporalTabsContainer}>
          <CategoryTabs
            tabs={presentation.temporalTabs.map((tab) => ({
              key: tab.key,
              label: tab.label,
            }))}
            activeKey={selectedTemporalTab ?? presentation.temporalTabs[0].key}
            onChange={handleTemporalTabChange}
            testID={buildSceneTestId(sceneKey, 'temporal-tabs')}
          />
        </View>
      ) : null}

      <FlashList<CalendarRow>
        ref={listRef}
        testID={buildSceneTestId(sceneKey, 'section-list')}
        style={styles.content}
        data={presentation.rows}
        refreshing={refreshing}
        onRefresh={onRefresh}
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
});

function keyExtractor(item: CalendarRow) {
  return item.key;
}

function getItemType(item: CalendarRow) {
  return item.type;
}

function buildSceneTestId(sceneKey: CalendarMediaFilter, suffix: string) {
  return `release-calendar-${suffix}-${sceneKey}`;
}

interface SingleReleaseCardProps {
  sceneKey: CalendarMediaFilter;
  item: Extract<CalendarDisplayItem, { type: 'single' }>;
  onPress: (release: UpcomingRelease) => void;
  resolvePosterPath: (
    mediaType: UpcomingRelease['mediaType'],
    mediaId: number,
    fallbackPosterPath: string | null | undefined
  ) => string | null;
}

const SingleReleaseCard = React.memo(function SingleReleaseCard({
  sceneKey,
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
      testID={buildSceneTestId(sceneKey, `single-${item.release.uniqueKey}`)}
      style={({ pressed }) => [styles.releaseCard, pressed && styles.releaseCardPressed]}
      onPress={handlePress}
    >
      <ReleaseDateColumn date={item.releaseDate} />
      <CardMediaInfoShell
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
            <Text style={styles.episodeInfo}>
              {t('calendar.seasonEpisode', {
                season: item.release.nextEpisode.seasonNumber,
                episode: item.release.nextEpisode.episodeNumber,
              })}
            </Text>
          ) : null
        }
      />
    </Pressable>
  );
});

interface GroupedReleaseCardProps {
  sceneKey: CalendarMediaFilter;
  item: CalendarGroupedDisplayItem;
  onShowPress: (item: CalendarGroupedDisplayItem) => void;
  onEpisodePress: (release: UpcomingRelease) => void;
  resolvePosterPath: (
    mediaType: UpcomingRelease['mediaType'],
    mediaId: number,
    fallbackPosterPath: string | null | undefined
  ) => string | null;
}

function GroupedReleaseCard({
  sceneKey,
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
          testID={buildSceneTestId(sceneKey, `group-${item.key}`)}
          style={({ pressed }) => [styles.groupedHeaderPressable, pressed && styles.releaseCardPressed]}
          onPress={handleShowPress}
        >
          <CardMediaInfoShell
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
              testID={buildSceneTestId(sceneKey, `grouped-episode-${episode.uniqueKey}`)}
              style={({ pressed }) => [
                styles.episodeRow,
                index > 0 && styles.episodeRowBorder,
                pressed && styles.episodeRowPressed,
              ]}
              onPress={() => onEpisodePress(episode)}
            >
              <Text style={styles.episodeRowLabel} numberOfLines={1}>
                {t('calendar.seasonEpisode', {
                  season: episode.nextEpisode?.seasonNumber ?? 0,
                  episode: episode.nextEpisode?.episodeNumber ?? 0,
                })}
              </Text>
              <Text style={styles.episodeRowDate}>
                {formatEpisodeDate(episode.releaseDate, i18n.language, t)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

interface CardMediaInfoShellProps {
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
      <LinearGradient colors={['transparent', 'rgba(0,0,0,1)']} style={styles.gradient} />
      <View style={styles.textOverlay}>
        <View style={styles.titleRow}>
          <Text style={styles.releaseTitle} numberOfLines={1}>
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
        {date.toLocaleDateString(i18n.language, { month: 'short' }).toLocaleUpperCase(i18n.language)}
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

function getCountdownLabel(
  releaseDate: Date,
  t: ReturnType<typeof useTranslation>['t']
): string {
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
      position: 'relative',
    },
    scene: {
      ...StyleSheet.absoluteFillObject,
    },
    sceneActive: {
      opacity: 1,
      zIndex: 1,
    },
    sceneHidden: {
      opacity: 0,
      zIndex: 0,
    },
    sceneContent: {
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
      height: 100,
      position: 'relative',
    },
    groupedMediaInfo: {
      flex: 1,
      backgroundColor: COLORS.surface,
    },
    groupedHeaderPressable: {
      flex: 1,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    placeholderBackdrop: {
      backgroundColor: COLORS.surfaceLight,
      justifyContent: 'center',
      alignItems: 'center',
    },
    gradient: {
      ...StyleSheet.absoluteFillObject,
    },
    textOverlay: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: SPACING.s,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    releaseTitle: {
      fontSize: FONT_SIZE.m,
      fontWeight: '700',
      color: COLORS.white,
      flex: 1,
    },
    reminderBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: SPACING.xs,
    },
    episodeInfo: {
      fontSize: FONT_SIZE.xs,
      color: COLORS.text,
      opacity: 0.7,
      marginTop: SPACING.xs / 2,
    },
    countdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.xs,
    },
    countdown: {
      fontSize: FONT_SIZE.xs,
      color: accentColor,
      fontWeight: '600',
    },
    mediaTypeBadge: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    groupedEpisodeList: {
      backgroundColor: COLORS.surface,
    },
    episodeRow: {
      minHeight: 40,
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
    episodeRowLabel: {
      flex: 1,
      color: COLORS.text,
      fontSize: FONT_SIZE.s,
      fontWeight: '600',
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
