import CreateListModal, { CreateListModalRef } from '@/src/components/CreateListModal';
import { EmptyState } from '@/src/components/library/EmptyState';
import MediaSortModal, { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { filterCustomLists, MAX_FREE_LISTS } from '@/src/constants/lists';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import { useLists } from '@/src/hooks/useLists';
import { UserList } from '@/src/services/ListService';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { ArrowUpDown, ChevronRight, FolderPlus, List, Plus } from 'lucide-react-native';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CustomListsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const { data: lists, isLoading } = useLists();
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
          const aTime = (a as any).updatedAt || a.createdAt || 0;
          const bTime = (b as any).updatedAt || b.createdAt || 0;
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

  const { requireAuth, AuthGuardModal } = useAuthGuard();

  // Only check limits when premium status is confirmed (not loading)
  const isLimitReached = !isPremium && !isPremiumLoading && customLists.length >= MAX_FREE_LISTS;

  const handleCreateList = useCallback(() => {
    if (isLimitReached) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert(
        'Limit Reached',
        'Free users can only create 5 custom lists. Upgrade to Premium for unlimited lists!',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Upgrade',
            style: 'default',
            onPress: () => router.push('/premium'),
          },
        ]
      );
      return;
    }

    requireAuth(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      createListModalRef.current?.present();
    });
  }, [requireAuth, isLimitReached, router]);

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
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <HeaderIconButton onPress={() => setSortModalVisible(true)}>
            <View style={styles.sortIconWrapper}>
              <ArrowUpDown size={22} color={COLORS.text} />
              {hasActiveSort && <View style={styles.sortBadge} />}
            </View>
          </HeaderIconButton>
          <HeaderIconButton onPress={handleCreateList}>
            <Plus size={24} color={COLORS.text} />
          </HeaderIconButton>
        </View>
      ),
    });
  }, [navigation, handleCreateList, hasActiveSort]);

  const handleListPress = useCallback(
    (listId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/(tabs)/library/custom-list/${listId}` as any);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: UserList }) => (
      <Pressable
        style={({ pressed }) => [styles.listCard, pressed && styles.listCardPressed]}
        onPress={() => handleListPress(item.id)}
      >
        <List size={24} color={COLORS.primary} />
        <Text style={styles.listName}>{item.name}</Text>
        <ChevronRight size={20} color={COLORS.textSecondary} />
      </Pressable>
    ),
    [handleListPress]
  );

  const keyExtractor = useCallback((item: UserList) => item.id, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        {customLists.length === 0 ? (
          <EmptyState
            icon={FolderPlus}
            title="No Custom Lists"
            description="Create custom lists to organize your favorite content"
            actionLabel="Create List"
            onAction={handleCreateList}
          />
        ) : (
          <FlashList
            ref={listRef}
            data={customLists}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={ItemSeparator}
          />
        )}
      </SafeAreaView>
      <CreateListModal ref={createListModalRef} onSuccess={handleCreateSuccess} />
      {AuthGuardModal}

      <MediaSortModal
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        sortState={sortState}
        onApplySort={handleApplySort}
        allowedOptions={['recentlyAdded', 'lastUpdated', 'alphabetical']}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    gap: SPACING.m,
  },
  listCardPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.8,
  },
  listName: {
    flex: 1,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  separator: {
    height: SPACING.m,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortIconWrapper: {
    position: 'relative',
  },
  sortBadge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: SPACING.s,
    height: SPACING.s,
    borderRadius: SPACING.xs,
    backgroundColor: COLORS.primary,
  },
});
