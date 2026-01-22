import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { ReleaseSection, UpcomingRelease } from '@/src/hooks/useUpcomingReleases';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Bell, Calendar, Film, Tv } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';

interface ReleaseCalendarProps {
  sections: ReleaseSection[];
  isLoading?: boolean;
}

/**
 * Vertical agenda/timeline calendar component for displaying upcoming releases.
 * Features a horizontal date strip selector and grouped section list.
 */
export function ReleaseCalendar({ sections, isLoading }: ReleaseCalendarProps) {
  const { t } = useTranslation();
  const router = useRouter();

  // Get all unique dates for the date strip
  const uniqueDates = useMemo(() => {
    const dateMap = new Map<string, Date>();
    sections.forEach((section) => {
      section.data.forEach((release) => {
        const dateKey = release.releaseDate.toISOString().split('T')[0];
        if (!dateMap.has(dateKey)) {
          dateMap.set(dateKey, release.releaseDate);
        }
      });
    });
    return Array.from(dateMap.values()).sort((a, b) => a.getTime() - b.getTime());
  }, [sections]);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Filter sections based on selected date
  const filteredSections = useMemo(() => {
    if (!selectedDate) return sections;

    const selectedDateStr = selectedDate.toISOString().split('T')[0];
    return sections
      .map((section) => ({
        ...section,
        data: section.data.filter((release) => {
          const releaseDateStr = release.releaseDate.toISOString().split('T')[0];
          return releaseDateStr >= selectedDateStr;
        }),
      }))
      .filter((section) => section.data.length > 0);
  }, [sections, selectedDate]);

  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate((prev) => {
      const prevStr = prev?.toISOString().split('T')[0];
      const newStr = date.toISOString().split('T')[0];
      return prevStr === newStr ? null : date;
    });
  }, []);

  const handleReleasePress = useCallback(
    (release: UpcomingRelease) => {
      if (release.mediaType === 'movie') {
        router.push({ pathname: '/(tabs)/home/movie/[id]', params: { id: release.id } });
      } else {
        router.push({ pathname: '/(tabs)/home/tv/[id]', params: { id: release.id } });
      }
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: UpcomingRelease }) => (
      <ReleaseCard release={item} onPress={() => handleReleasePress(item)} />
    ),
    [handleReleasePress]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: ReleaseSection }) => (
      <View style={styles.sectionHeader}>
        <Calendar size={18} color={COLORS.primary} />
        <Text style={styles.sectionTitle}>{section.title}</Text>
      </View>
    ),
    []
  );

  const keyExtractor = useCallback((item: UpcomingRelease) => `${item.mediaType}-${item.id}`, []);

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
          selectedDate={selectedDate}
          onSelectDate={handleDateSelect}
        />
      )}

      {/* Section List */}
      <SectionList<UpcomingRelease, ReleaseSection>
        style={styles.content}
        sections={filteredSections}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
        SectionSeparatorComponent={() => <View style={styles.sectionSeparator} />}
      />
    </View>
  );
}

interface DateStripProps {
  dates: Date[];
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
}

/**
 * Horizontal scrollable date selector strip
 */
function DateStrip({ dates, selectedDate, onSelectDate }: DateStripProps) {
  const { t, i18n } = useTranslation();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const tomorrowStr = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const formatDateLabel = (date: Date): string => {
    const dateStr = date.toISOString().split('T')[0];
    if (dateStr === todayStr) return t('calendar.today');
    if (dateStr === tomorrowStr) return t('calendar.tomorrow');
    // Format as "Sat, Jan 24" - all on one line
    const weekday = date.toLocaleDateString(i18n.language, { weekday: 'short' });
    const monthDay = date.toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
    return `${weekday}, ${monthDay}`;
  };

  const selectedStr = selectedDate?.toISOString().split('T')[0];

  return (
    <View style={styles.dateStripContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateStripContent}
        style={styles.dateStrip}
      >
        {dates.map((date) => {
          const dateStr = date.toISOString().split('T')[0];
          const isSelected = dateStr === selectedStr;
          const isToday = dateStr === todayStr;

          return (
            <Pressable
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
  onPress: () => void;
}

/**
 * Individual release card component with backdrop, countdown, and episode info
 */
function ReleaseCard({ release, onPress }: ReleaseCardProps) {
  const { t, i18n } = useTranslation();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const releaseDateStr = release.releaseDate.toISOString().split('T')[0];

  // Calculate days until release
  const daysUntil = Math.ceil(
    (release.releaseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  const getCountdownText = (): string => {
    if (releaseDateStr === todayStr) return t('calendar.today');
    if (daysUntil === 1) return t('calendar.tomorrow');
    return t('calendar.inDays', { count: daysUntil });
  };

  const imageUrl =
    getImageUrl(release.backdropPath, TMDB_IMAGE_SIZES.backdrop.medium) ||
    getImageUrl(release.posterPath, TMDB_IMAGE_SIZES.poster.medium);

  const isToday = releaseDateStr === todayStr;

  return (
    <Pressable
      style={({ pressed }) => [styles.releaseCard, pressed && styles.releaseCardPressed]}
      onPress={onPress}
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
}

const styles = StyleSheet.create({
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
    backgroundColor: COLORS.primary,
  },
  dateItemToday: {
    borderWidth: 2,
    borderColor: COLORS.primary,
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
    color: COLORS.primary,
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
    backgroundColor: COLORS.primary,
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
    color: COLORS.primary,
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
    color: COLORS.primary,
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
});
