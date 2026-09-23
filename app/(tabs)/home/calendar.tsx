import { CalendarSortModal } from '@/src/components/calendar/CalendarSortModal';
import { CalendarSourceFilterModal } from '@/src/components/calendar/CalendarSourceFilterModal';
import { ReleaseCalendar } from '@/src/components/calendar/ReleaseCalendar';
import { ReleaseCalendarSkeleton } from '@/src/components/calendar/ReleaseCalendarSkeleton';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { InlineUpdatingIndicator } from '@/src/components/ui/InlineUpdatingIndicator';
import {
  SegmentedControl,
  type SegmentedControlOption,
} from '@/src/components/ui/SegmentedControl';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { filterCustomLists } from '@/src/constants/lists';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePremium } from '@/src/context/PremiumContext';
import { useLists } from '@/src/hooks/useLists';
import { useUpcomingReleases } from '@/src/hooks/useUpcomingReleases';
import { screenStyles } from '@/src/styles/screenStyles';
import { useIconBadgeStyles } from '@/src/styles/iconBadgeStyles';
import {
  buildCalendarPresentations,
  CALENDAR_SOURCE_FILTERS,
  CALENDAR_SOURCES_STORAGE_KEY,
  CalendarMediaFilter,
  CalendarSortMode,
  CalendarSourceFilter,
  clampCalendarSources,
  filterUpcomingReleases,
  isDefaultCalendarSourceSelection,
  sanitizeCalendarSources,
} from '@/src/utils/calendarViewModel';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { ArrowUpDownIcon, Calendar03Icon, SlidersHorizontalIcon } from '@hugeicons/core-free-icons';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CalendarScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { accentColor } = useAccentColor();
  const iconBadgeStyles = useIconBadgeStyles();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const [mediaFilter, setMediaFilter] = useState<CalendarMediaFilter>('all');
  const [sortMode, setSortMode] = useState<CalendarSortMode>('soonest');
  const [selectedSources, setSelectedSources] = useState<CalendarSourceFilter[]>([
    ...CALENDAR_SOURCE_FILTERS,
  ]);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);
  const [isPreferenceReadDone, setIsPreferenceReadDone] = useState(false);
  const didHydrateSourcesRef = useRef(false);
  const savedSourcesRawRef = useRef<unknown>(null);
  const lastPersistedSourcesRef = useRef<CalendarSourceFilter[] | null>(null);
  // Exact array instance from first render. Hydration is the only other
  // writer before it completes, and it reuses the sanitized instance (see
  // below) — so any reference deviation here means the user already edited,
  // since every user-driven set creates a new array.
  const initialSourcesRef = useRef<CalendarSourceFilter[]>(selectedSources);

  const { allReleases, isLoading, isLoadingEnrichment, isRefreshing, refresh } =
    useUpcomingReleases();
  const { data: lists, isLoading: isListsLoading } = useLists();

  const customSources = useMemo(
    () =>
      filterCustomLists(lists ?? []).map((list) => ({
        id: list.id,
        name: list.name,
      })),
    [lists]
  );

  // Start the persisted-selection read immediately on mount, in parallel
  // with the lists query — it does not depend on lists to be fetched.
  useEffect(() => {
    let cancelled = false;

    const readPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem(CALENDAR_SOURCES_STORAGE_KEY);
        if (!cancelled) {
          savedSourcesRawRef.current = saved ? JSON.parse(saved) : null;
        }
      } catch (error) {
        console.error('Failed to load calendar source preference:', error);
        if (!cancelled) {
          savedSourcesRawRef.current = null;
        }
      } finally {
        if (!cancelled) {
          setIsPreferenceReadDone(true);
        }
      }
    };
    void readPreference();

    return () => {
      cancelled = true;
    };
  }, []);

  // Apply the saved selection once BOTH the stored value has been read and
  // custom lists are known (so saved custom-list IDs are not mistaken for
  // unknown IDs and dropped). The loading gate therefore reflects whichever
  // of the two finishes last, not a strict sequence of one after the other.
  useEffect(() => {
    if (!isPreferenceReadDone || isListsLoading || didHydrateSourcesRef.current) {
      return;
    }
    didHydrateSourcesRef.current = true;

    if (selectedSources !== initialSourcesRef.current) {
      // The user edited while hydration was in flight: their fresher choice
      // stands and the stale persisted value is discarded. The ref is left
      // empty on purpose so the save effect below persists the user's edit.
      setIsLoadingPreference(false);
      return;
    }

    const sanitized = sanitizeCalendarSources(
      savedSourcesRawRef.current,
      customSources.map((source) => source.id)
    );
    if (sanitized) {
      lastPersistedSourcesRef.current = sanitized;
      setSelectedSources(sanitized);
    } else if (isDefaultCalendarSourceSelection(selectedSources)) {
      // No usable saved value and selection untouched: the current (default)
      // selection is already what would be persisted, so record it to
      // suppress a redundant write. A non-default selection here can only be
      // user-driven (applied before hydration finished) — leave the ref empty
      // so the save effect still persists it.
      lastPersistedSourcesRef.current = selectedSources;
    }
    setIsLoadingPreference(false);
  }, [customSources, isListsLoading, isPreferenceReadDone, selectedSources]);

  // Persist genuine user-driven selection changes (modal apply + both resets
  // flow through setSelectedSources). The reference check skips the
  // hydration-triggered set: every user action creates a new array, while the
  // hydrated value is recorded before it is applied.
  useEffect(() => {
    if (isLoadingPreference) {
      return;
    }
    if (lastPersistedSourcesRef.current === selectedSources) {
      return;
    }
    lastPersistedSourcesRef.current = selectedSources;

    const savePreference = async () => {
      try {
        await AsyncStorage.setItem(
          CALENDAR_SOURCES_STORAGE_KEY,
          JSON.stringify(selectedSources)
        );
      } catch (error) {
        console.error('Failed to save calendar source preference:', error);
      }
    };
    void savePreference();
  }, [isLoadingPreference, selectedSources]);

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const hasActiveSourceFilters = useMemo(
    () => !isDefaultCalendarSourceSelection(selectedSources),
    [selectedSources]
  );
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
              <AppIcon icon={SlidersHorizontalIcon} size={22} color={COLORS.text} />
              {hasActiveSourceFilters ? (
                <View
                  style={iconBadgeStyles.badge}
                  testID="calendar-source-filter-active-indicator"
                />
              ) : null}
            </View>
          </HeaderIconButton>
          <HeaderIconButton testID="calendar-sort-button" onPress={() => setSortModalVisible(true)}>
            <View style={iconBadgeStyles.wrapper}>
              <AppIcon icon={ArrowUpDownIcon} size={22} color={COLORS.text} />
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

  const presentationLabels = useMemo(
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

  const previewLimit = !isPremium ? 3 : undefined;

  const presentations = useMemo(
    () =>
      buildCalendarPresentations({
        releases: sourceFilteredReleases,
        sortMode,
        previewLimit,
        locale: i18n.language,
        labels: presentationLabels,
      }),
    [i18n.language, presentationLabels, previewLimit, sortMode, sourceFilteredReleases]
  );

  const activePresentation = presentations[mediaFilter];

  const mediaOptions = useMemo<SegmentedControlOption<CalendarMediaFilter>[]>(
    () => [
      { key: 'all', label: t('library.allMedia') },
      { key: 'movie', label: t('media.movies') },
      { key: 'tv', label: t('media.tvShows') },
    ],
    [t]
  );

  const hasReleases = allReleases.length > 0;
  const shouldShowInitialEnrichmentLoading = !hasReleases && isLoadingEnrichment;
  const shouldShowInitialLoading =
    isPremiumLoading ||
    isLoading ||
    isLoadingPreference ||
    shouldShowInitialEnrichmentLoading;
  const shouldShowSkeletonUpdatingIndicator =
    isLoadingEnrichment && !isPremiumLoading && !isLoading;

  let content: React.ReactNode;

  if (shouldShowInitialLoading) {
    content = (
      <>
        {shouldShowSkeletonUpdatingIndicator ? (
          <InlineUpdatingIndicator message={t('calendar.updatingEpisodes')} />
        ) : null}
        <ReleaseCalendarSkeleton />
      </>
    );
  } else if (!hasReleases) {
    content = (
      <View style={styles.emptyContainer}>
        <View style={styles.iconContainer}>
          <AppIcon icon={Calendar03Icon} size={64} color={accentColor} />
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
    );
  } else if (activePresentation.totalContentCount === 0) {
    content = (
      <>
        <View style={styles.segmentedControlContainer}>
          <SegmentedControl
            options={mediaOptions}
            activeKey={mediaFilter}
            onChange={setMediaFilter}
            testID="calendar-media-filter"
          />
        </View>
        <View style={styles.emptyContainer}>
          <View style={styles.iconContainer}>
            <AppIcon icon={SlidersHorizontalIcon} size={56} color={accentColor} />
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
      </>
    );
  } else {
    content = (
      <>
        {isLoadingEnrichment ? (
          <InlineUpdatingIndicator message={t('calendar.updatingEpisodes')} />
        ) : null}
        <View style={styles.segmentedControlContainer}>
          <SegmentedControl
            options={mediaOptions}
            activeKey={mediaFilter}
            onChange={setMediaFilter}
            testID="calendar-media-filter"
          />
        </View>
        <ReleaseCalendar
          presentations={presentations}
          activeMediaFilter={mediaFilter}
          previewLimit={previewLimit}
          refreshing={isRefreshing}
          onRefresh={refresh}
        />
      </>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
      {content}
      <CalendarSourceFilterModal
        visible={sourceModalVisible}
        selectedSources={selectedSources}
        customSources={customSources}
        onClose={() => setSourceModalVisible(false)}
        onApply={(sources) => setSelectedSources(clampCalendarSources(sources))}
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
    fontFamily: FONT_FAMILY.bold,
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
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.white,
  },
});
