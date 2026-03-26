import { CalendarSortModal } from '@/src/components/calendar/CalendarSortModal';
import { CalendarSourceFilterModal } from '@/src/components/calendar/CalendarSourceFilterModal';
import { ReleaseCalendar } from '@/src/components/calendar/ReleaseCalendar';
import { ReleaseCalendarSkeleton } from '@/src/components/calendar/ReleaseCalendarSkeleton';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { InlineUpdatingIndicator } from '@/src/components/ui/InlineUpdatingIndicator';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePremium } from '@/src/context/PremiumContext';
import { useProgressiveRender } from '@/src/hooks/useProgressiveRender';
import { useUpcomingReleases } from '@/src/hooks/useUpcomingReleases';
import { screenStyles } from '@/src/styles/screenStyles';
import { useIconBadgeStyles } from '@/src/styles/iconBadgeStyles';
import {
  CALENDAR_SOURCE_FILTERS,
  CalendarMediaFilter,
  CalendarSortMode,
  CalendarSourceFilter,
  filterUpcomingReleases,
} from '@/src/utils/calendarViewModel';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { ArrowUpDown, Calendar, SlidersHorizontal } from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CalendarScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const iconBadgeStyles = useIconBadgeStyles();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const { isReady } = useProgressiveRender();
  const [mediaFilter, setMediaFilter] = useState<CalendarMediaFilter>('all');
  const [sortMode, setSortMode] = useState<CalendarSortMode>('soonest');
  const [selectedSources, setSelectedSources] =
    useState<CalendarSourceFilter[]>([...CALENDAR_SOURCE_FILTERS]);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);

  const { allReleases, isLoading, isLoadingEnrichment, isRefreshing, refresh } =
    useUpcomingReleases();

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const hasActiveSourceFilters = selectedSources.length !== CALENDAR_SOURCE_FILTERS.length;
  const hasActiveSort = sortMode !== 'soonest';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <HeaderIconButton
            testID="calendar-source-filter-button"
            onPress={() => setSourceModalVisible(true)}
          >
            <View style={iconBadgeStyles.wrapper}>
              <SlidersHorizontal size={22} color={COLORS.text} />
              {hasActiveSourceFilters ? (
                <View style={iconBadgeStyles.badge} testID="calendar-source-filter-active-indicator" />
              ) : null}
            </View>
          </HeaderIconButton>
          <HeaderIconButton testID="calendar-sort-button" onPress={() => setSortModalVisible(true)}>
            <View style={iconBadgeStyles.wrapper}>
              <ArrowUpDown size={22} color={COLORS.text} />
              {hasActiveSort ? (
                <View style={iconBadgeStyles.badge} testID="calendar-sort-active-indicator" />
              ) : null}
            </View>
          </HeaderIconButton>
        </View>
      ),
    });
  }, [hasActiveSort, hasActiveSourceFilters, iconBadgeStyles, navigation]);

  const handleGoToLibrary = useCallback(() => {
    router.push({ pathname: '/(tabs)/library' });
  }, [router]);

  const handleResetFilters = useCallback(() => {
    setMediaFilter('all');
    setSelectedSources([...CALENDAR_SOURCE_FILTERS]);
  }, []);

  const sourceFilteredReleases = useMemo(
    () =>
      filterUpcomingReleases(allReleases, {
        mediaFilter: 'all',
        selectedSources,
      }),
    [allReleases, selectedSources]
  );

  const activeFilteredReleases = useMemo(
    () =>
      filterUpcomingReleases(allReleases, {
        mediaFilter,
        selectedSources,
      }),
    [allReleases, mediaFilter, selectedSources]
  );

  const mediaOptions = useMemo(
    () => [
      { key: 'all', label: t('library.allMedia') },
      { key: 'movie', label: t('media.movies') },
      { key: 'tv', label: t('media.tvShows') },
    ],
    [t]
  );

  const hasReleases = allReleases.length > 0;
  const shouldShowInitialEnrichmentLoading = !hasReleases && isLoadingEnrichment;
  const shouldDelayCalendarRender = hasReleases && !isReady;

  if (
    isPremiumLoading ||
    isLoading ||
    shouldShowInitialEnrichmentLoading ||
    shouldDelayCalendarRender
  ) {
    const shouldShowUpdatingIndicator = isLoadingEnrichment && !isPremiumLoading && !isLoading;

    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
        {shouldShowUpdatingIndicator ? (
          <InlineUpdatingIndicator message={t('calendar.updatingEpisodes')} />
        ) : null}
        <ReleaseCalendarSkeleton />
        <CalendarSourceFilterModal
          visible={sourceModalVisible}
          selectedSources={selectedSources}
          onClose={() => setSourceModalVisible(false)}
          onApply={setSelectedSources}
        />
        <CalendarSortModal
          visible={sortModalVisible}
          sortMode={sortMode}
          onClose={() => setSortModalVisible(false)}
          onApply={setSortMode}
        />
      </SafeAreaView>
    );
  }

  if (!hasReleases) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.emptyContainer}>
          <View style={styles.iconContainer}>
            <Calendar size={64} color={accentColor} />
          </View>
          <Text style={styles.emptyTitle}>{t('calendar.empty')}</Text>
          <Text style={styles.emptyDescription}>{t('calendar.emptyHint')}</Text>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: accentColor }]}
            onPress={handleGoToLibrary}
          >
            <Text style={styles.primaryButtonText}>{t('calendar.goToWatchlist')}</Text>
          </Pressable>
        </View>
        <CalendarSourceFilterModal
          visible={sourceModalVisible}
          selectedSources={selectedSources}
          onClose={() => setSourceModalVisible(false)}
          onApply={setSelectedSources}
        />
        <CalendarSortModal
          visible={sortModalVisible}
          sortMode={sortMode}
          onClose={() => setSortModalVisible(false)}
          onApply={setSortMode}
        />
      </SafeAreaView>
    );
  }

  if (activeFilteredReleases.length === 0) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.segmentedControlContainer}>
          <SegmentedControl
            options={mediaOptions}
            activeKey={mediaFilter}
            onChange={(key) => setMediaFilter(key as CalendarMediaFilter)}
            testID="calendar-media-filter"
          />
        </View>
        <View style={styles.emptyContainer}>
          <View style={styles.iconContainer}>
            <SlidersHorizontal size={56} color={accentColor} />
          </View>
          <Text style={styles.emptyTitle}>{t('calendar.filteredEmptyTitle')}</Text>
          <Text style={styles.emptyDescription}>{t('calendar.filteredEmptyDescription')}</Text>
          <Pressable
            style={[styles.primaryButton, { backgroundColor: accentColor }]}
            onPress={handleResetFilters}
          >
            <Text style={styles.primaryButtonText}>{t('common.clearFilters')}</Text>
          </Pressable>
        </View>
        <CalendarSourceFilterModal
          visible={sourceModalVisible}
          selectedSources={selectedSources}
          onClose={() => setSourceModalVisible(false)}
          onApply={setSelectedSources}
        />
        <CalendarSortModal
          visible={sortModalVisible}
          sortMode={sortMode}
          onClose={() => setSortModalVisible(false)}
          onApply={setSortMode}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
      {isLoadingEnrichment ? (
        <InlineUpdatingIndicator message={t('calendar.updatingEpisodes')} />
      ) : null}
      <View style={styles.segmentedControlContainer}>
        <SegmentedControl
          options={mediaOptions}
          activeKey={mediaFilter}
          onChange={(key) => setMediaFilter(key as CalendarMediaFilter)}
          testID="calendar-media-filter"
        />
      </View>
      <ReleaseCalendar
        releases={sourceFilteredReleases}
        activeMediaFilter={mediaFilter}
        sortMode={sortMode}
        previewLimit={!isPremium ? 3 : undefined}
        refreshing={isRefreshing}
        onRefresh={refresh}
      />
      <CalendarSourceFilterModal
        visible={sourceModalVisible}
        selectedSources={selectedSources}
        onClose={() => setSourceModalVisible(false)}
        onApply={setSelectedSources}
      />
      <CalendarSortModal
        visible={sortModalVisible}
        sortMode={sortMode}
        onClose={() => setSortModalVisible(false)}
        onApply={setSortMode}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentedControlContainer: {
    padding: SPACING.m,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.m,
  },
  emptyDescription: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  primaryButton: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.white,
  },
});
