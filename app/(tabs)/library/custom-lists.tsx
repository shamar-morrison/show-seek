import CreateListModal, { CreateListModalRef } from '@/src/components/CreateListModal';
import { BulkRemoveProgressModal } from '@/src/components/library/BulkRemoveProgressModal';
import { CustomListCard } from '@/src/components/library/CustomListCard';
import { EmptyState } from '@/src/components/library/EmptyState';
import { LibrarySortModal } from '@/src/components/library/LibrarySortModal';
import { MultiSelectActionBar } from '@/src/components/library/MultiSelectActionBar';
import { QueryErrorState } from '@/src/components/library/QueryErrorState';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { filterCustomLists, MAX_FREE_LISTS } from '@/src/constants/lists';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { useGuestAccess } from '@/src/context/GuestAccessContext';
import { usePremium } from '@/src/context/PremiumContext';
import { useCustomListMultiSelectActions } from '@/src/hooks/useCustomListMultiSelectActions';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { useBulkDeleteLists, useLists } from '@/src/hooks/useLists';
import { UserList } from '@/src/services/ListService';
import { useIconBadgeStyles } from '@/src/styles/iconBadgeStyles';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { getSearchHeaderOptions } from '@/src/utils/searchHeaderOptions';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { ArrowUpDown, FolderPlus, Plus, Search } from 'lucide-react-native';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CustomListsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, isGuest } = useAuth();
  const { requireAccount } = useGuestAccess();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const { data: lists, isLoading, isError, error, refetch } = useLists();
  const bulkDeleteListsMutation = useBulkDeleteLists();
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const iconBadgeStyles = useIconBadgeStyles();
  const createListModalRef = useRef<CreateListModalRef>(null);
  const toastRef = useRef<ToastRef>(null);
  const listRef = useRef<any>(null);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const [refreshing, setRefreshing] = useState(false);

  const ItemSeparator = () => <View style={styles.separator} />;

  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  const customLists = useMemo(() => {
    if (!lists) return [];
    const filtered = filterCustomLists(lists);

    return [...filtered].sort((a, b) => {
      const direction = sortState.direction === 'asc' ? 1 : -1;

      switch (sortState.option) {
        case 'recentlyAdded':
          return ((a.createdAt || 0) - (b.createdAt || 0)) * direction;
        case 'lastUpdated': {
          const aTime = a.updatedAt || a.createdAt || 0;
          const bTime = b.updatedAt || b.createdAt || 0;
          return (aTime - bTime) * direction;
        }
        case 'alphabetical': {
          const nameA = a.name.toLowerCase();
          const nameB = b.name.toLowerCase();
          return nameA.localeCompare(nameB) * direction;
        }
        default:
          return 0;
      }
    });
  }, [lists, sortState]);

  const {
    searchQuery,
    isSearchActive,
    filteredItems: displayLists,
    deactivateSearch,
    setSearchQuery,
    searchButton,
  } = useHeaderSearch({
    items: customLists,
    getSearchableText: (item) => `${item.name} ${item.description ?? ''}`,
  });

  const handleShowToast = useCallback((message: string) => {
    toastRef.current?.show(message);
  }, []);

  // Only check limits when premium status is confirmed (not loading)
  const isLimitReached = !isPremium && !isPremiumLoading && customLists.length >= MAX_FREE_LISTS;

  const handleCreateList = useCallback(() => {
    if (!user || isGuest) {
      requireAccount();
      return;
    }

    if (isLimitReached) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        t('library.limitReachedTitle'),
        t('library.customListLimitReached', { count: MAX_FREE_LISTS }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('profile.upgradeToPremium'),
            style: 'default',
            onPress: () => router.push('/premium'),
          },
        ]
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    createListModalRef.current?.present();
  }, [isGuest, isLimitReached, requireAccount, router, user]);

  const handleCreateSuccess = useCallback(
    (listId: string) => {
      router.push(`/(tabs)/library/custom-list/${listId}` as any);
    },
    [router]
  );

  const handleApplySort = (newSortState: SortState) => {
    setSortState(newSortState);
    // Scroll to top after sort is applied
    setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const handleNavigateToList = useCallback(
    (listId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/(tabs)/library/custom-list/${listId}` as any);
    },
    [router]
  );

  const {
    handleListPress,
    handleListLongPress,
    selectedListIds,
    selectedCount,
    isSelectionMode,
    isListSelected,
    clearSelection,
    selectionContentBottomPadding,
    handleActionBarHeightChange,
    handleDeleteSelectedLists,
    bulkDeleteProgress,
    isBulkDeleting,
  } = useCustomListMultiSelectActions({
    isSearchActive,
    deactivateSearch,
    insetsBottom: insets.bottom,
    showToast: handleShowToast,
    onNavigateToList: handleNavigateToList,
    deleteLists: (listIds, onProgress) =>
      bulkDeleteListsMutation.mutateAsync({
        listIds,
        onProgress,
      }),
    isDeleting: bulkDeleteListsMutation.isPending,
  });

  useLayoutEffect(() => {
    if (isSelectionMode) {
      navigation.setOptions({
        header: undefined,
        headerTitle: undefined,
        headerRight: () => null,
      });
      return;
    }

    if (isSearchActive) {
      navigation.setOptions(
        getSearchHeaderOptions({
          searchQuery,
          onSearchChange: setSearchQuery,
          onClose: deactivateSearch,
          placeholder: t('library.searchListPlaceholder'),
        })
      );
      return;
    }

    navigation.setOptions({
      header: undefined,
      headerTitle: undefined,
      headerRight: () => (
        <View style={styles.headerButtons}>
          <HeaderIconButton onPress={searchButton.onPress}>
            <Search size={22} color={COLORS.text} />
          </HeaderIconButton>
          <HeaderIconButton onPress={() => setSortModalVisible(true)}>
            <View style={iconBadgeStyles.wrapper}>
              <ArrowUpDown size={22} color={COLORS.text} />
              {hasActiveSort && <View style={iconBadgeStyles.badge} />}
            </View>
          </HeaderIconButton>
          <HeaderIconButton onPress={handleCreateList}>
            <Plus size={24} color={COLORS.text} />
          </HeaderIconButton>
        </View>
      ),
    });
  }, [
    navigation,
    handleCreateList,
    hasActiveSort,
    isSelectionMode,
    isSearchActive,
    searchQuery,
    setSearchQuery,
    deactivateSearch,
    searchButton,
    t,
    iconBadgeStyles,
  ]);

  const renderItem = useCallback(
    ({ item }: { item: UserList }) => {
      return (
        <CustomListCard
          list={item}
          onPress={handleListPress}
          onLongPress={handleListLongPress}
          selectionMode={isSelectionMode}
          isSelected={isListSelected(item.id)}
        />
      );
    },
    [handleListLongPress, handleListPress, isListSelected, isSelectionMode]
  );

  const keyExtractor = useCallback((item: UserList) => item.id, []);

  const listEmptyComponent = useMemo(() => {
    if (customLists.length === 0) {
      return (
        <EmptyState
          icon={FolderPlus}
          title={t('library.emptyLists')}
          description={t('library.emptyListsHint')}
          actionLabel={t('library.createList')}
          onAction={handleCreateList}
        />
      );
    }

    if (searchQuery) {
      return <SearchEmptyState height={windowHeight - insets.top - insets.bottom - 150} />;
    }

    return null;
  }, [customLists.length, handleCreateList, insets.bottom, insets.top, searchQuery, t, windowHeight]);

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (isError) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <QueryErrorState
          title={t('library.customLists')}
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <FlashList
          ref={listRef}
          data={displayLists}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={[
            libraryListStyles.listContent,
            displayLists.length === 0 ? styles.emptyListContent : null,
            selectionContentBottomPadding > 0
              ? { paddingBottom: selectionContentBottomPadding }
              : null,
          ]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={ItemSeparator}
          ListEmptyComponent={listEmptyComponent}
          extraData={selectedListIds}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      </SafeAreaView>
      <CreateListModal ref={createListModalRef} onSuccess={handleCreateSuccess} />

      <LibrarySortModal
        visible={sortModalVisible}
        setVisible={setSortModalVisible}
        sortState={sortState}
        onApplySort={handleApplySort}
        allowedOptions={['recentlyAdded', 'lastUpdated', 'alphabetical']}
      />

      <Toast ref={toastRef} />

      <BulkRemoveProgressModal
        visible={isBulkDeleting}
        current={bulkDeleteProgress?.processed ?? 0}
        total={bulkDeleteProgress?.total ?? 0}
        title={t('library.deletingListsTitle')}
        progressText={t('library.deletingListsProgress', {
          current: bulkDeleteProgress?.processed ?? 0,
          total: bulkDeleteProgress?.total ?? 0,
        })}
      />

      {isSelectionMode && (
        <MultiSelectActionBar
          selectedCount={selectedCount}
          onCancel={clearSelection}
          onRemoveItems={handleDeleteSelectedLists}
          removeLabel={t('common.delete')}
          onHeightChange={handleActionBarHeightChange}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  separator: {
    height: SPACING.m,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
