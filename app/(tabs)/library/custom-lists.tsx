import CreateListModal, { CreateListModalRef } from '@/src/components/CreateListModal';
import { EmptyState } from '@/src/components/library/EmptyState';
import { LibrarySortModal } from '@/src/components/library/LibrarySortModal';
import { QueryErrorState } from '@/src/components/library/QueryErrorState';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import { StackedPosterPreview } from '@/src/components/library/StackedPosterPreview';
import { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { filterCustomLists, MAX_FREE_LISTS } from '@/src/constants/lists';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { usePremium } from '@/src/context/PremiumContext';
import { useLists } from '@/src/hooks/useLists';
import { UserList } from '@/src/services/ListService';
import { useIconBadgeStyles } from '@/src/styles/iconBadgeStyles';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { getSearchHeaderOptions } from '@/src/utils/searchHeaderOptions';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { ArrowUpDown, ChevronRight, FolderPlus, Plus, Search } from 'lucide-react-native';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function CustomListsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const { data: lists, isLoading, isError, error, refetch } = useLists();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const iconBadgeStyles = useIconBadgeStyles();
  const createListModalRef = useRef<CreateListModalRef>(null);
  const listRef = useRef<any>(null);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);

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

  // Only check limits when premium status is confirmed (not loading)
  const isLimitReached = !isPremium && !isPremiumLoading && customLists.length >= MAX_FREE_LISTS;

  const handleCreateList = useCallback(() => {
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
  }, [isLimitReached, router]);

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

  useLayoutEffect(() => {
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
    isSearchActive,
    searchQuery,
    setSearchQuery,
    deactivateSearch,
    searchButton,
    t,
    iconBadgeStyles,
  ]);

  const handleListPress = useCallback(
    (listId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/(tabs)/library/custom-list/${listId}` as any);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: UserList }) => {
      // Extract poster paths from list items (up to 3)
      const posterPaths = Object.values(item.items || {})
        .slice(0, 3)
        .map((mediaItem) => mediaItem.poster_path);

      // Count total items
      const itemCount = Object.keys(item.items || {}).length;

      return (
        <Pressable
          style={({ pressed }) => [styles.listCard, pressed && styles.listCardPressed]}
          onPress={() => handleListPress(item.id)}
        >
          <StackedPosterPreview posterPaths={posterPaths} />
          <View style={styles.listInfo}>
            <Text style={styles.listName}>{item.name}</Text>
            {!!item.description?.trim() && (
              <Text style={styles.listDescription} numberOfLines={2}>
                {item.description.trim()}
              </Text>
            )}
            <Text style={styles.itemCount}>
              {itemCount === 1
                ? t('library.itemCountOne')
                : t('library.itemCount', { count: itemCount })}
            </Text>
          </View>
          <ChevronRight size={20} color={COLORS.textSecondary} />
        </Pressable>
      );
    },
    [handleListPress, t]
  );

  const keyExtractor = useCallback((item: UserList) => item.id, []);

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
        {customLists.length === 0 ? (
          <EmptyState
            icon={FolderPlus}
            title={t('library.emptyLists')}
            description={t('library.emptyListsHint')}
            actionLabel={t('library.createList')}
            onAction={handleCreateList}
          />
        ) : (
          <FlashList
            ref={listRef}
            data={displayLists}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={libraryListStyles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={ItemSeparator}
            ListEmptyComponent={
              searchQuery ? (
                <SearchEmptyState height={windowHeight - insets.top - insets.bottom - 150} />
              ) : null
            }
          />
        )}
      </SafeAreaView>
      <CreateListModal ref={createListModalRef} onSuccess={handleCreateSuccess} />

      <LibrarySortModal
        visible={sortModalVisible}
        setVisible={setSortModalVisible}
        sortState={sortState}
        onApplySort={handleApplySort}
        allowedOptions={['recentlyAdded', 'lastUpdated', 'alphabetical']}
      />
    </>
  );
}

const styles = StyleSheet.create({
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    gap: SPACING.s,
  },
  listCardPressed: {
    transform: [{ scale: 0.98 }],
  },
  listInfo: {
    flex: 1,
    gap: SPACING.xs,
  },
  listName: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  listDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  itemCount: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  separator: {
    height: SPACING.m,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
