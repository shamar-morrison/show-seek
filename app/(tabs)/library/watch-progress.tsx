import { EmptyState } from '@/src/components/library/EmptyState';
import { LibrarySortModal } from '@/src/components/library/LibrarySortModal';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import { SortOption, SortState } from '@/src/components/MediaSortModal';
import AppErrorState from '@/src/components/ui/AppErrorState';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { InlineUpdatingIndicator } from '@/src/components/ui/InlineUpdatingIndicator';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { WatchingShowCard } from '@/src/components/watching/WatchingShowCard';
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
import { useBulkSetHiddenFromProgress } from '@/src/hooks/useEpisodeTracking';
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
  Tv01Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from '@hugeicons/core-free-icons';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const STORAGE_KEY = 'watchProgressSortState';
const ALLOWED_SORT_OPTIONS: SortOption[] = ['progress', 'alphabetical', 'lastWatched'];

const DEFAULT_SORT_STATE: SortState = {
  option: 'lastWatched',
  direction: 'desc',
};

type WatchProgressTab = 'watching' | 'caughtUp' | 'hidden';

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
  const isInitialMount = useRef(true);
  const hasCompletedInitialPreferenceLoad = useRef(false);

  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);
  const [activeTab, setActiveTab] = useState<WatchProgressTab>('watching');
  const [selectedIds, setSelectedIds] = useState<Record<number, true>>({});
  const [actionBarHeight, setActionBarHeight] = useState<number | null>(null);

  const bulkSetHidden = useBulkSetHiddenFromProgress();
  const isAccountRequired = useAccountRequired();

  // Load sort preference from AsyncStorage
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as SortState;
          // Validate that the saved option is still valid
          if (ALLOWED_SORT_OPTIONS.includes(parsed.option)) {
            setSortState(parsed);
          }
        }
      } catch (error) {
        console.error('Failed to load sort preference:', error);
      } finally {
        setIsLoadingPreference(false);
      }
    };
    loadPreference();
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

  // Split into watching vs caught up vs hidden shows
  const watchingShows = useMemo(
    () => (data ?? []).filter((show) => !show.isHidden && show.nextEpisode?.kind === 'unwatched'),
    [data]
  );
  const caughtUpShows = useMemo(
    () =>
      (data ?? []).filter(
        (show) =>
          !show.isHidden &&
          (show.nextEpisode?.kind === 'upcoming' || show.nextEpisode?.kind === 'complete')
      ),
    [data]
  );
  const hiddenShows = useMemo(() => (data ?? []).filter((show) => show.isHidden), [data]);
  const currentTabShows =
    activeTab === 'watching'
      ? watchingShows
      : activeTab === 'caughtUp'
        ? caughtUpShows
        : hiddenShows;

  // Sort the data based on current sort state
  const sortedData = useMemo(() => {
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

  // Search01Icon functionality
  const {
    searchQuery,
    isSearchActive,
    filteredItems: displayItems,
    deactivateSearch,
    setSearchQuery,
    searchButton,
  } = useHeaderSearch({
    items: sortedData,
    getSearchableText: (item) => item.tvShowName,
  });

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
    (tab: WatchProgressTab) => {
      setActiveTab(tab);
      clearSelection();
    },
    [clearSelection]
  );

  const navigateToShow = useCallback(
    (show: InProgressShow) => {
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
    [currentTab, router]
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
    const tvShowIds = Object.keys(selectedIds).map(Number);
    if (tvShowIds.length === 0 || bulkSetHidden.isPending) return;
    if (isAccountRequired()) return;
    const hidden = activeTab === 'watching';
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
  }, [activeTab, bulkSetHidden, clearSelection, isAccountRequired, selectedIds, t]);

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

  // Configure header with search + sort buttons
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
      <View style={styles.tabsContainer}>
        <SegmentedControl<WatchProgressTab>
          options={[
            { key: 'watching', label: t('library.watchingTab') },
            { key: 'caughtUp', label: t('library.caughtUpTab') },
            { key: 'hidden', label: t('library.hiddenTab') },
          ]}
          activeKey={activeTab}
          onChange={handleTabChange}
          testID="watch-progress-tabs"
        />
      </View>
      <FlashList
        ref={listRef}
        data={displayItems}
        renderItem={renderItem}
        contentContainerStyle={[
          libraryListStyles.listContent,
          selectionContentBottomPadding > 0 && { paddingBottom: selectionContentBottomPadding },
        ]}
        keyExtractor={(item) => item.tvShowId.toString()}
        extraData={[selectedIds, activeTab]}
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
      <Toast ref={toastRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabsContainer: {
    paddingHorizontal: SPACING.m,
    paddingTop: SPACING.s,
    paddingBottom: SPACING.s,
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
