import { EmptyState } from '@/src/components/library/EmptyState';
import { LibrarySortModal } from '@/src/components/library/LibrarySortModal';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import { SortOption, SortState } from '@/src/components/MediaSortModal';
import AppErrorState from '@/src/components/ui/AppErrorState';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { InlineUpdatingIndicator } from '@/src/components/ui/InlineUpdatingIndicator';
import { CategoryTab, CategoryTabs } from '@/src/components/ui/CategoryTabs';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { WatchingShowCard } from '@/src/components/watching/WatchingShowCard';
import { WatchProgressOptionsSheet } from '@/src/components/watching/WatchProgressOptionsSheet';
import {
  BORDER_RADIUS,
  COLORS,
  EMPTY_STATE_HEIGHT,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useCurrentTab } from '@/src/context/TabContext';
import { useCurrentlyWatching } from '@/src/hooks/useCurrentlyWatching';
import { useBulkSetHiddenFromProgress, useDeleteShowTracking } from '@/src/hooks/useEpisodeTracking';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { useIconBadgeStyles } from '@/src/styles/iconBadgeStyles';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { InProgressShow } from '@/src/types/episodeTracking';
import { getSearchHeaderOptions } from '@/src/utils/searchHeaderOptions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import {
  ArrowUpDownIcon,
  Cancel01Icon,
  Search01Icon,
  SlidersHorizontalIcon,
  Tv01Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from '@hugeicons/core-free-icons';
import type { WatchProgressOptionsSheetRef } from '@/src/components/watching/WatchProgressOptionsSheet';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const STORAGE_KEY = 'watchProgressSortState';
const HIDE_COMPLETED_STORAGE_KEY = 'watchProgressHideCompleted';
const ALLOWED_SORT_OPTIONS: SortOption[] = ['progress', 'alphabetical', 'lastWatched'];

const DEFAULT_SORT_STATE: SortState = {
  option: 'lastWatched',
  direction: 'desc',
};

type WatchProgressTab = 'watching' | 'caughtUp' | 'hidden';

// Stable empty array for useHeaderSearch: this screen performs its own
// single-pass bucket + search filtering (all tab counts), so the hook is only
// used for search UI state (query, active, buttons) with near-zero filter cost.
const EMPTY_SEARCH_ITEMS: InProgressShow[] = [];

export default function WatchProgressScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const currentTab = useCurrentTab();
  const insets = useSafeAreaInsets();
  const { data, isLoading, isFetching, error, refresh } = useCurrentlyWatching();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const iconBadgeStyles = useIconBadgeStyles();
  const listRef = useRef<React.ComponentRef<typeof FlashList<InProgressShow>>>(null);
  const toastRef = useRef<ToastRef>(null);
  const optionsSheetRef = useRef<WatchProgressOptionsSheetRef>(null);
  const isInitialMount = useRef(true);
  const hasCompletedInitialPreferenceLoad = useRef(false);

  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<WatchProgressTab>('watching');
  const [selectedIds, setSelectedIds] = useState<Record<number, true>>({});
  const [actionBarHeight, setActionBarHeight] = useState<number | null>(null);

  const bulkSetHidden = useBulkSetHiddenFromProgress();
  const deleteShowTracking = useDeleteShowTracking();
  const isAccountRequired = useAccountRequired();

  // Load sort preference + hide-completed preference from AsyncStorage
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const [savedSort, savedHideCompleted] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(HIDE_COMPLETED_STORAGE_KEY),
        ]);
        if (savedSort) {
          const parsed = JSON.parse(savedSort) as SortState;
          // Validate that the saved option is still valid
          if (ALLOWED_SORT_OPTIONS.includes(parsed.option)) {
            setSortState(parsed);
          }
        }
        if (savedHideCompleted !== null) {
          setHideCompleted(JSON.parse(savedHideCompleted) === true);
        }
      } catch (error) {
        console.error('Failed to load watch progress preferences:', error);
      } finally {
        setIsLoadingPreference(false);
      }
    };
    void loadPreferences();
  }, []);

  // Handle sort apply and save to AsyncStorage
  const handleApplySort = useCallback(async (newSortState: SortState) => {
    setSortState(newSortState);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newSortState));
    } catch (error) {
      console.error('Failed to save sort preference:', error);
    }
  }, []);

  // Handle hide-completed toggle and persist to AsyncStorage
  const handleToggleHideCompleted = useCallback(async (value: boolean) => {
    setHideCompleted(value);
    try {
      await AsyncStorage.setItem(HIDE_COMPLETED_STORAGE_KEY, JSON.stringify(value));
    } catch (error) {
      console.error('Failed to save hide completed preference:', error);
    }
  }, []);

  // Stable accessor for useHeaderSearch (avoids invalidating its filter memo).
  const getSearchableText = useCallback((item: InProgressShow) => item.tvShowName, []);

  // Search state only — items stay empty so the hook performs no real
  // filtering work. Actual filtering happens in the single-pass memo below.
  const {
    searchQuery,
    debouncedQuery,
    isSearchActive,
    deactivateSearch,
    setSearchQuery,
    searchButton,
  } = useHeaderSearch({
    items: EMPTY_SEARCH_ITEMS,
    getSearchableText,
    debounceMs: 150,
  });

  // Normalize once per debounced query change (not per item / per render).
  const normalizedQuery = useMemo(() => debouncedQuery.trim().toLowerCase(), [debouncedQuery]);

  // Lowercase names once per data change — reused for every query keystroke.
  const indexedShows = useMemo(
    () => (data ?? []).map((show) => ({ show, lower: show.tvShowName.toLowerCase() })),
    [data]
  );

  // Single pass over all shows: bucket (watching/caughtUp/hidden) + apply the
  // debounced search predicate once per item. Produces search-filtered counts
  // for every tab and collects only the active tab's matches for sorting.
  // Sort runs on the active tab subset only — inactive tabs cost just a counter.
  const { watchingCount, caughtUpCount, hiddenCount, currentTabShows } = useMemo(() => {
    let watchingCount = 0;
    let caughtUpCount = 0;
    let hiddenCount = 0;
    const current: InProgressShow[] = [];
    const hasQuery = normalizedQuery.length > 0;

    for (const { show, lower } of indexedShows) {
      let bucket: WatchProgressTab | null = null;
      if (show.isHidden || show.isUnavailable) {
        bucket = 'hidden';
      } else if (show.nextEpisode?.kind === 'unwatched') {
        bucket = 'watching';
      } else if (show.nextEpisode?.kind === 'upcoming') {
        bucket = 'caughtUp';
      } else if (show.nextEpisode?.kind === 'complete') {
        if (!hideCompleted) bucket = 'caughtUp';
      }
      if (!bucket) continue;
      if (hasQuery && !lower.includes(normalizedQuery)) continue;
      if (bucket === 'watching') watchingCount += 1;
      else if (bucket === 'caughtUp') caughtUpCount += 1;
      else hiddenCount += 1;
      if (bucket === activeTab) current.push(show);
    }

    return { watchingCount, caughtUpCount, hiddenCount, currentTabShows: current };
  }, [indexedShows, normalizedQuery, hideCompleted, activeTab]);

  const watchProgressTabs = useMemo<CategoryTab[]>(
    () => [
      { key: 'watching', label: `${t('library.watchingTab')} (${watchingCount})` },
      { key: 'caughtUp', label: `${t('library.caughtUpTab')} (${caughtUpCount})` },
      { key: 'hidden', label: `${t('library.hiddenTab')} (${hiddenCount})` },
    ],
    [t, watchingCount, caughtUpCount, hiddenCount]
  );

  // Sort the active tab's (already search-filtered) shows
  const displayItems = useMemo(() => {
    const sorted = [...currentTabShows];
    const { option, direction } = sortState;
    const multiplier = direction === 'asc' ? 1 : -1;

    sorted.sort((a: InProgressShow, b: InProgressShow) => {
      switch (option) {
        case 'progress':
          return (a.percentage - b.percentage) * multiplier;
        case 'alphabetical':
          return a.tvShowName.localeCompare(b.tvShowName) * multiplier;
        case 'lastWatched':
        default:
          return (a.lastUpdated - b.lastUpdated) * multiplier;
      }
    });

    return sorted;
  }, [currentTabShows, sortState]);

  // --- Multi-select state ---
  const selectedCount = useMemo(() => Object.keys(selectedIds).length, [selectedIds]);
  const isSelectionMode = selectedCount > 0;

  const clearSelection = useCallback(() => {
    setSelectedIds({});
  }, []);

  const toggleSelection = useCallback((tvShowId: number) => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      if (next[tvShowId]) {
        delete next[tvShowId];
      } else {
        next[tvShowId] = true;
      }
      return next;
    });
  }, []);

  const handleTabChange = useCallback(
    (tab: string) => {
      setActiveTab(tab as WatchProgressTab);
      clearSelection();
    },
    [clearSelection]
  );

  const handleRemoveUnavailableShow = useCallback(
    (show: InProgressShow) => {
      if (isAccountRequired()) return;
      Alert.alert(
        t('watching.unavailableTitle', { defaultValue: 'Show Unavailable' }),
        t('watching.unavailableRemovePrompt', {
          name: show.tvShowName,
          defaultValue: `This show could not be found on TMDB. Would you like to remove "${show.tvShowName}" from your tracking?`,
        }),
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          {
            text: t('common.remove', 'Remove'),
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteShowTracking.mutateAsync(show.tvShowId);
                toastRef.current?.show(
                  t('watching.removedToast', {
                    name: show.tvShowName,
                    defaultValue: `Removed ${show.tvShowName} from tracking`,
                  })
                );
              } catch {
                toastRef.current?.show(
                  t('watching.removeFailed', { defaultValue: 'Failed to remove show' })
                );
              }
            },
          },
        ]
      );
    },
    [deleteShowTracking, isAccountRequired, t]
  );

  const navigateToShow = useCallback(
    (show: InProgressShow) => {
      if (show.isUnavailable) {
        handleRemoveUnavailableShow(show);
        return;
      }
      const tab = currentTab || 'library';
      if (show.nextEpisode?.kind === 'unwatched') {
        router.push(
          `/(tabs)/${tab}/tv/${show.tvShowId}/seasons?season=${show.nextEpisode.season}` as any
        );
      } else if (show.nextEpisode?.kind === 'complete') {
        router.push(`/(tabs)/${tab}/tv/${show.tvShowId}` as any);
      } else {
        router.push(`/(tabs)/${tab}/tv/${show.tvShowId}/seasons` as any);
      }
    },
    [currentTab, handleRemoveUnavailableShow, router]
  );

  const handleCardPress = useCallback(
    (show: InProgressShow) => {
      if (isSelectionMode) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleSelection(show.tvShowId);
        return;
      }
      navigateToShow(show);
    },
    [isSelectionMode, navigateToShow, toggleSelection]
  );

  const handleLongPress = useCallback(
    (show: InProgressShow) => {
      if (isLoading || isLoadingPreference) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (isSearchActive) {
        deactivateSearch();
      }
      toggleSelection(show.tvShowId);
    },
    [deactivateSearch, isLoading, isLoadingPreference, isSearchActive, toggleSelection]
  );

  const isItemSelected = useCallback(
    (tvShowId: number) => !!selectedIds[tvShowId],
    [selectedIds]
  );

  const handleBulkToggleHidden = useCallback(async () => {
    const rawIds = Object.keys(selectedIds).map(Number);
    // Filter out unavailable shows (they cannot be unhidden/restored)
    const tvShowIds = rawIds.filter((id) => {
      const found = data.find((s) => s.tvShowId === id);
      return !found?.isUnavailable;
    });

    if (tvShowIds.length === 0) {
      if (rawIds.length > 0) {
        toastRef.current?.show(
          t('watching.unavailableCannotRestore', {
            defaultValue: 'Unavailable shows cannot be restored',
          })
        );
        clearSelection();
      }
      return;
    }

    if (bulkSetHidden.isPending) return;
    if (isAccountRequired()) return;
    const hidden = activeTab !== 'hidden';
    try {
      await bulkSetHidden.mutateAsync({ tvShowIds, hidden });
      toastRef.current?.show(
        hidden
          ? t('watching.hiddenToast', { count: tvShowIds.length })
          : t('watching.restoredToast', { count: tvShowIds.length })
      );
      clearSelection();
    } catch {
      toastRef.current?.show(t('watching.hideFailed'));
    }
  }, [activeTab, bulkSetHidden, clearSelection, data, isAccountRequired, selectedIds, t]);

  const handleActionBarLayout = useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    setActionBarHeight((prev) => (prev === height ? prev : height));
  }, []);

  const selectionContentBottomPadding = isSelectionMode ? (actionBarHeight ?? 176) + 16 : 0;

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!hasCompletedInitialPreferenceLoad.current) {
      return;
    }

    const timeoutId = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [sortState]);

  useEffect(() => {
    if (!isLoadingPreference) {
      hasCompletedInitialPreferenceLoad.current = true;
    }
  }, [isLoadingPreference]);

  // Configure header with search + options + sort buttons
  useLayoutEffect(() => {
    if (isSearchActive) {
      navigation.setOptions(
        getSearchHeaderOptions({
          searchQuery,
          onSearchChange: setSearchQuery,
          onClose: deactivateSearch,
          placeholder: t('library.searchShowsPlaceholder'),
        })
      );
    } else {
      navigation.setOptions({
        header: undefined,
        headerTitle: undefined,
        headerRight: () => (
          <View style={styles.headerButtons}>
            <HeaderIconButton onPress={searchButton.onPress}>
              <AppIcon icon={Search01Icon} size={22} color={COLORS.text} />
            </HeaderIconButton>
            <HeaderIconButton
              onPress={() => void optionsSheetRef.current?.present()}
              testID="watch-progress-options-button"
            >
              <View style={iconBadgeStyles.wrapper}>
                <AppIcon icon={SlidersHorizontalIcon} size={22} color={COLORS.text} />
                {hideCompleted && <View style={iconBadgeStyles.badge} />}
              </View>
            </HeaderIconButton>
            <HeaderIconButton onPress={() => setSortModalVisible(true)}>
              <View style={iconBadgeStyles.wrapper}>
                <AppIcon icon={ArrowUpDownIcon} size={22} color={COLORS.text} />
                {hasActiveSort && <View style={iconBadgeStyles.badge} />}
              </View>
            </HeaderIconButton>
          </View>
        ),
      });
    }
  }, [
    navigation,
    isSearchActive,
    searchQuery,
    setSearchQuery,
    deactivateSearch,
    searchButton,
    hasActiveSort,
    hideCompleted,
    t,
  ]);

  const renderItem = ({ item }: { item: InProgressShow }) => (
    <WatchingShowCard
      show={item}
      t={t}
      onPress={handleCardPress}
      onLongPress={handleLongPress}
      selectionMode={isSelectionMode}
      isSelected={isItemSelected(item.tvShowId)}
    />
  );

  if (isLoading || isLoadingPreference) {
    return <FullScreenLoading message={t('library.loadingWatchHistory')} />;
  }

  if (error) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <AppErrorState
          error={error}
          message={t('library.watchProgressError')}
          onRetry={() => {
            void refresh();
          }}
        />
      </SafeAreaView>
    );
  }

  const hasAnyData = (data?.length ?? 0) > 0;
  const hiding = activeTab === 'watching' || activeTab === 'caughtUp';

  if (!hasAnyData) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        {isFetching && (
          <InlineUpdatingIndicator
            message={t('library.updatingWatchProgress')}
            testID="watch-progress-updating-indicator"
          />
        )}
        <EmptyState
          icon={Tv01Icon}
          title={t('library.emptyWatchProgress')}
          description={t('library.emptyWatchProgressHint')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      <View style={libraryListStyles.divider} />
      {isFetching && (
        <InlineUpdatingIndicator
          message={t('library.updatingWatchProgress')}
          testID="watch-progress-updating-indicator"
        />
      )}
      <CategoryTabs
        tabs={watchProgressTabs}
        activeKey={activeTab}
        onChange={handleTabChange}
        testID="watch-progress-tabs"
      />
      <FlashList
        ref={listRef}
        data={displayItems}
        renderItem={renderItem}
        contentContainerStyle={[
          libraryListStyles.listContent,
          selectionContentBottomPadding > 0 && { paddingBottom: selectionContentBottomPadding },
        ]}
        keyExtractor={(item) => item.tvShowId.toString()}
        extraData={[selectedIds, activeTab, hideCompleted]}
        ListEmptyComponent={
          searchQuery ? (
            <SearchEmptyState height={EMPTY_STATE_HEIGHT} />
          ) : activeTab === 'watching' ? (
            <EmptyState
              icon={Tv01Icon}
              title={t('library.emptyWatchProgress')}
              description={t('library.emptyWatchProgressHint')}
            />
          ) : activeTab === 'caughtUp' ? (
            <EmptyState
              icon={Tv01Icon}
              title={t('library.emptyCaughtUpProgress')}
              description={t('library.emptyCaughtUpProgressHint')}
            />
          ) : (
            <EmptyState
              icon={ViewOffSlashIcon}
              title={t('library.emptyHiddenWatchProgress')}
              description={t('library.emptyHiddenWatchProgressHint')}
            />
          )
        }
      />

      {isSelectionMode && (
        <View
          style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, SPACING.s) }]}
          onLayout={handleActionBarLayout}
          testID="watch-progress-bulk-bar"
        >
          <Text style={styles.countLabel}>
            {t('library.selectedItemsCount', { count: selectedCount })}
          </Text>
          <View style={styles.buttonsRow}>
            <Pressable
              style={styles.cancelButton}
              onPress={clearSelection}
              testID="watch-progress-bulk-cancel"
            >
              <AppIcon icon={Cancel01Icon} size={18} color={COLORS.textSecondary} />
              <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.hideButton,
                { backgroundColor: accentColor },
                bulkSetHidden.isPending && styles.hideButtonDisabled,
              ]}
              onPress={() => void handleBulkToggleHidden()}
              disabled={bulkSetHidden.isPending}
              testID={
                hiding ? 'watch-progress-bulk-hide-button' : 'watch-progress-bulk-restore-button'
              }
            >
              <AppIcon
                icon={hiding ? ViewOffSlashIcon : ViewIcon}
                size={18}
                color={COLORS.white}
              />
              <Text style={styles.hideButtonText}>
                {hiding ? t('watching.hideSelected') : t('watching.restoreSelected')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      <LibrarySortModal
        visible={sortModalVisible}
        setVisible={setSortModalVisible}
        sortState={sortState}
        onApplySort={handleApplySort}
        allowedOptions={ALLOWED_SORT_OPTIONS}
      />
      <WatchProgressOptionsSheet
        ref={optionsSheetRef}
        hideCompleted={hideCompleted}
        onToggleHideCompleted={handleToggleHideCompleted}
      />
      <Toast ref={toastRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.s,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.surfaceLight,
    gap: SPACING.s,
  },
  countLabel: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: SPACING.s,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.s,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    flex: 1,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.semiBold,
  },
  hideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    flex: 1,
  },
  hideButtonDisabled: {
    opacity: 0.5,
  },
  hideButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.semiBold,
  },
});
