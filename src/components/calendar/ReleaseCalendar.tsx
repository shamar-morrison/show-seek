import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { useThemedStyles } from '@/src/hooks/useThemedStyles';
import { ReleaseSection, UpcomingRelease } from '@/src/hooks/useUpcomingReleases';
import { toLocalDateKey } from '@/src/utils/dateUtils';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Bell, Calendar, CrownIcon, Film, Tv } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface ReleaseCalendarProps {
  sections: ReleaseSection[];
  isLoading?: boolean;
  previewLimit?: number;
  showUpgradeOverlay?: boolean;
  onUpgradePress?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
}

function limitSections(sections: ReleaseSection[], previewLimit?: number): ReleaseSection[] {
  if (previewLimit === undefined) return sections;
  if (previewLimit <= 0) return [];

  let remaining = previewLimit;
  const limitedSections: ReleaseSection[] = [];

  for (const section of sections) {
    if (remaining <= 0) break;

    const sectionItems = section.data.slice(0, remaining);
    if (sectionItems.length === 0) continue;

    limitedSections.push({
      ...section,
      data: sectionItems,
    });

    remaining -= sectionItems.length;
  }

  return limitedSections;
}

interface DateLocation {
  rowIndex: number;
  isTailItem: boolean;
}

interface PendingScrollTarget {
  index: number;
  animated: boolean;
  viewPosition?: number;
  useEndFallback?: boolean;
}

interface CalendarMonthHeaderRow {
  type: 'month-header';
  key: string;
  title: string;
  isFirstSection: boolean;
}

interface CalendarReleaseRow {
  type: 'release';
  key: string;
  release: UpcomingRelease;
  isLastInSection: boolean;
}

type CalendarRow = CalendarMonthHeaderRow | CalendarReleaseRow;

const TAIL_ITEM_VIEW_POSITION = 1;
const TAIL_SCROLL_FALLBACK_DELAY_MS = 80;

/**
 * Vertical agenda/timeline calendar component for displaying upcoming releases.
 * Features a horizontal date strip selector and grouped section list.
 */
export function ReleaseCalendar({
  sections,
  isLoading,
  previewLimit,
  showUpgradeOverlay = false,
  onUpgradePress,
  refreshing = false,
  onRefresh,
}: ReleaseCalendarProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { accentColor } = useAccentColor();
  const { resolvePosterPath } = usePosterOverrides();
  const styles = useStyles();
  const listRef = useRef<FlashListRef<CalendarRow> | null>(null);
  const scrollFollowUpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScrollTargetRef = useRef<PendingScrollTarget | null>(null);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

  const visibleSections = useMemo(
    () => limitSections(sections, previewLimit),
    [sections, previewLimit]
  );

  const clearScrollFollowUp = useCallback(() => {
    if (scrollFollowUpTimeoutRef.current) {
      clearTimeout(scrollFollowUpTimeoutRef.current);
      scrollFollowUpTimeoutRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearScrollFollowUp();
    },
    [clearScrollFollowUp]
  );

  const { calendarRows, uniqueDates, dateLocations } = useMemo(() => {
    const dateMap = new Map<string, Date>();
    const locationMap = new Map<string, DateLocation>();
    const rows: CalendarRow[] = [];
    const lastSectionIndex = visibleSections.length - 1;
    const lastItemIndex =
      lastSectionIndex >= 0 ? visibleSections[lastSectionIndex].data.length - 1 : -1;

    visibleSections.forEach((section, sectionIndex) => {
      rows.push({
        type: 'month-header',
        key: `month-header-${section.title}-${sectionIndex}`,
        title: section.title,
        isFirstSection: sectionIndex === 0,
      });

      section.data.forEach((release, itemIndex) => {
        const dateKey = toLocalDateKey(release.releaseDate);
        const rowIndex = rows.length;
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, release.releaseDate);
          locationMap.set(dateKey, {
            rowIndex,
            isTailItem: sectionIndex === lastSectionIndex && itemIndex === lastItemIndex,
          });
        }

        rows.push({
          type: 'release',
          key: release.uniqueKey,
          release,
          isLastInSection: itemIndex === section.data.length - 1,
        });
      });
    });

    return {
      calendarRows: rows,
      uniqueDates: Array.from(dateMap.values()).sort((a, b) => a.getTime() - b.getTime()),
      dateLocations: locationMap,
    };
  }, [visibleSections]);

  const buildScrollTarget = useCallback((location: DateLocation): PendingScrollTarget => {
    if (location.isTailItem) {
      return {
        index: location.rowIndex,
        animated: true,
        viewPosition: TAIL_ITEM_VIEW_POSITION,
        useEndFallback: true,
      };
    }

    return {
      index: location.rowIndex,
      animated: true,
    };
  }, []);

  const scheduleTailFallback = useCallback(
    (target: PendingScrollTarget) => {
      if (!target.useEndFallback) {
        return;
      }

      clearScrollFollowUp();
      scrollFollowUpTimeoutRef.current = setTimeout(() => {
        const pendingTarget = pendingScrollTargetRef.current;
        if (!pendingTarget || pendingTarget.index !== target.index || !pendingTarget.useEndFallback) {
          return;
        }

        const visibleIndices = listRef.current?.computeVisibleIndices();
        if (visibleIndices && visibleIndices.endIndex >= target.index) {
          return;
        }

        void listRef.current?.scrollToEnd({ animated: target.animated });
      }, TAIL_SCROLL_FALLBACK_DELAY_MS);
    },
    [clearScrollFollowUp]
  );

  const scrollToDateLocation = useCallback(
    async (location: DateLocation) => {
      clearScrollFollowUp();

      const params = buildScrollTarget(location);
      pendingScrollTargetRef.current = params;
      const list = listRef.current;
      if (!list) {
        return;
      }

      list.recordInteraction();

      try {
        const scrollParams =
          params.viewPosition === undefined
            ? { index: params.index, animated: params.animated }
            : {
                index: params.index,
                animated: params.animated,
                viewPosition: params.viewPosition,
              };
        await list.scrollToIndex(scrollParams);
        scheduleTailFallback(params);
      } catch {
        if (params.useEndFallback) {
          await list.scrollToEnd({ animated: params.animated });
        }
      }
    },
    [buildScrollTarget, clearScrollFollowUp, scheduleTailFallback]
  );

  useEffect(() => {
    if (selectedDateKey && !dateLocations.has(selectedDateKey)) {
      setSelectedDateKey(null);
    }
  }, [dateLocations, selectedDateKey]);

  const handleDateSelect = useCallback(
    (date: Date) => {
      const dateKey = toLocalDateKey(date);

      if (selectedDateKey === dateKey) {
        return;
      }

      setSelectedDateKey(dateKey);

      const location = dateLocations.get(dateKey);
      if (location) {
        void scrollToDateLocation(location);
      }
    },
    [dateLocations, scrollToDateLocation, selectedDateKey]
  );

  const handleReleasePress = useCallback(
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

  const handleUpgradePress = useCallback(() => {
    if (onUpgradePress) {
      onUpgradePress();
      return;
    }

    router.push('/premium');
  }, [onUpgradePress, router]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<CalendarRow>) => {
      if (item.type === 'month-header') {
        return (
          <View
            style={[
              styles.sectionHeader,
              !item.isFirstSection && styles.sectionHeaderWithMargin,
            ]}
          >
            <Calendar size={18} color={accentColor} />
            <Text style={styles.sectionTitle}>{item.title}</Text>
          </View>
        );
      }

      return (
        <View style={!item.isLastInSection && styles.releaseRowSpacing}>
          <ReleaseCard
            release={item.release}
            onPress={handleReleasePress}
            resolvePosterPath={resolvePosterPath}
          />
        </View>
      );
    },
    [accentColor, handleReleasePress, resolvePosterPath, styles]
  );

  const keyExtractor = useCallback((item: CalendarRow) => item.key, []);
  const getItemType = useCallback((item: CalendarRow) => item.type, []);

  const listFooter = useMemo(() => {
    if (!showUpgradeOverlay) return null;

    return (
      <View style={styles.upgradeOverlayContainer} testID="release-calendar-upgrade-overlay">
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.75)']}
          locations={[0, 0.6, 1]}
          style={styles.upgradeShadow}
        />
        <View style={styles.upgradeCard}>
          <CrownIcon size={30} color={accentColor} style={styles.upgradeIcon} />
          <Text style={styles.upgradeTitle}>{t('calendar.upgradeForFullExperience')}</Text>
          <Pressable
            testID="release-calendar-upgrade-button"
            style={({ pressed }) => [styles.upgradeButton, pressed && styles.upgradeButtonPressed]}
            onPress={handleUpgradePress}
          >
            <Text style={styles.upgradeButtonText}>{t('calendar.upgradeToPremium')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }, [handleUpgradePress, showUpgradeOverlay, styles, t]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Horizontal Date Strip */}
      {uniqueDates.length > 0 && (
        <DateStrip
          dates={uniqueDates}
          selectedDateKey={selectedDateKey}
          onSelectDate={handleDateSelect}
        />
      )}

      <FlashList<CalendarRow>
        ref={listRef}
        testID="release-calendar-section-list"
        style={styles.content}
        data={calendarRows}
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
}

interface DateStripProps {
  dates: Date[];
  selectedDateKey: string | null;
  onSelectDate: (date: Date) => void;
}

/**
 * Horizontal scrollable date selector strip
 */
function DateStrip({ dates, selectedDateKey, onSelectDate }: DateStripProps) {
  const { t, i18n } = useTranslation();
  const styles = useStyles();
  const today = new Date();
  const todayStr = toLocalDateKey(today);
  const tomorrowStr = toLocalDateKey(new Date(today.getTime() + 24 * 60 * 60 * 1000));

  const formatDateLabel = (date: Date): string => {
    const dateStr = toLocalDateKey(date);
    if (dateStr === todayStr) return t('calendar.today');
    if (dateStr === tomorrowStr) return t('calendar.tomorrow');
    // Format as "Sat, Jan 24" - all on one line
    const weekday = date.toLocaleDateString(i18n.language, { weekday: 'short' });
    const monthDay = date.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
    return `${weekday}, ${monthDay}`;
  };

  return (
    <View style={styles.dateStripContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateStripContent}
        style={styles.dateStrip}
      >
        {dates.map((date) => {
          const dateStr = toLocalDateKey(date);
          const isSelected = dateStr === selectedDateKey;
          const isToday = dateStr === todayStr;

          return (
            <Pressable
              testID={`release-calendar-date-item-${dateStr}`}
              key={dateStr}
              onPress={() => onSelectDate(date)}
              style={[
                styles.dateItem,
                isSelected && styles.dateItemSelected,
                isToday && !isSelected && styles.dateItemToday,
              ]}
            >
              <Text
                style={[
                  styles.dateLabel,
                  isSelected && styles.dateLabelSelected,
                  isToday && !isSelected && styles.dateLabelToday,
                ]}
              >
                {formatDateLabel(date)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

interface ReleaseCardProps {
  release: UpcomingRelease;
  onPress: (release: UpcomingRelease) => void;
  resolvePosterPath: (
    mediaType: UpcomingRelease['mediaType'],
    mediaId: number,
    fallbackPosterPath: string | null | undefined
  ) => string | null;
}

/**
 * Individual release card component with backdrop, countdown, and episode info
 */
const ReleaseCard = React.memo(
  function ReleaseCard({ release, onPress, resolvePosterPath }: ReleaseCardProps) {
    const { t, i18n } = useTranslation();
    const styles = useStyles();
    const today = new Date();
    const todayStr = toLocalDateKey(today);
    const releaseDateStr = toLocalDateKey(release.releaseDate);
    const handlePress = useCallback(() => {
      onPress(release);
    }, [onPress, release]);

    // Calculate days until release
    const daysUntil = Math.ceil(
      (release.releaseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    const getCountdownText = (): string => {
      if (releaseDateStr === todayStr) return t('calendar.today');
      if (daysUntil === 1) return t('calendar.tomorrow');
      return t('calendar.inDays', { count: daysUntil });
    };

    const posterPath = resolvePosterPath(release.mediaType, release.id, release.posterPath);
    const imageUrl =
      getImageUrl(release.backdropPath, TMDB_IMAGE_SIZES.backdrop.medium) ||
      getImageUrl(posterPath, TMDB_IMAGE_SIZES.poster.medium);

    const isToday = releaseDateStr === todayStr;

    return (
      <Pressable
        style={({ pressed }) => [styles.releaseCard, pressed && styles.releaseCardPressed]}
        onPress={handlePress}
      >
        {/* Left: Date Column */}
        <View style={[styles.dateColumn, isToday && styles.dateColumnToday]}>
          <Text style={[styles.dateDay, isToday && styles.dateDayHighlight]}>
            {release.releaseDate.getDate()}
          </Text>
          <Text style={[styles.dateMonth, isToday && styles.dateMonthHighlight]}>
            {release.releaseDate
              .toLocaleDateString(i18n.language, { month: 'short' })
              .toLocaleUpperCase(i18n.language)}
          </Text>
          {isToday && (
            <View style={styles.todayBadge}>
              <Text style={styles.todayBadgeText}>{t('calendar.today')}</Text>
            </View>
          )}
        </View>

        {/* Right: Media Info */}
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
              {release.mediaType === 'movie' ? (
                <Film size={32} color={COLORS.textSecondary} />
              ) : (
                <Tv size={32} color={COLORS.textSecondary} />
              )}
            </View>
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,1.0)']} style={styles.gradient} />
          <View style={styles.textOverlay}>
            <View style={styles.titleRow}>
              <Text style={styles.releaseTitle} numberOfLines={1}>
                {release.title}
              </Text>
              {release.isReminder && (
                <View style={styles.reminderBadge}>
                  <Bell size={12} color={COLORS.warning} />
                </View>
              )}
            </View>
            {release.nextEpisode && (
              <Text style={styles.episodeInfo}>
                {t('calendar.seasonEpisode', {
                  season: release.nextEpisode.seasonNumber,
                  episode: release.nextEpisode.episodeNumber,
                })}
              </Text>
            )}
            <View style={styles.countdownRow}>
              <Text style={styles.countdown}>{getCountdownText()}</Text>
              <View style={styles.mediaTypeBadge}>
                {release.mediaType === 'movie' ? (
                  <Film size={12} color={COLORS.white} />
                ) : (
                  <Tv size={12} color={COLORS.white} />
                )}
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    );
  },
  (prevProps, nextProps) =>
    prevProps.release === nextProps.release &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.resolvePosterPath === nextProps.resolvePosterPath
);

const useStyles = () =>
  useThemedStyles(({ accentColor }) => ({
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      color: COLORS.textSecondary,
      fontSize: FONT_SIZE.m,
    },
    dateStripContainer: {
      flexShrink: 0,
    },
    dateStrip: {
      borderBottomWidth: 1,
      borderBottomColor: COLORS.surfaceLight,
    },
    dateStripContent: {
      paddingHorizontal: SPACING.m,
      paddingVertical: SPACING.m,
      gap: SPACING.s,
    },
    dateItem: {
      height: 44,
      paddingHorizontal: SPACING.m,
      borderRadius: BORDER_RADIUS.m,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: COLORS.surface,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    dateItemSelected: {
      backgroundColor: accentColor,
    },
    dateItemToday: {
      borderWidth: 2,
      borderColor: accentColor,
    },
    dateLabel: {
      fontSize: FONT_SIZE.s,
      color: COLORS.text,
      fontWeight: '600',
      textAlign: 'center',
    },
    dateLabelSelected: {
      color: COLORS.white,
    },
    dateLabelToday: {
      color: accentColor,
    },
    listContent: {
      paddingBottom: SPACING.xl,
    },
    content: {
      flex: 1,
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
    upgradeIcon: {
      marginTop: -30,
    },
    sectionHeaderWithMargin: {
      marginTop: SPACING.m,
    },
    sectionTitle: {
      fontSize: FONT_SIZE.l,
      fontWeight: 'bold',
      color: COLORS.text,
    },
    itemSeparator: {
      height: SPACING.s,
    },
    sectionSeparator: {
      height: SPACING.m,
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
      fontWeight: 'bold',
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
      fontWeight: 'bold',
      color: accentColor,
    },
    mediaInfo: {
      flex: 1,
      height: 100,
      position: 'relative',
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
      fontWeight: 'bold',
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
