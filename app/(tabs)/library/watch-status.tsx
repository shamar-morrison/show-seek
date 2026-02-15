import { EmptyState } from '@/src/components/library/EmptyState';
import { LibrarySortModal } from '@/src/components/library/LibrarySortModal';
import { QueryErrorState } from '@/src/components/library/QueryErrorState';
import { StackedPosterPreview } from '@/src/components/library/StackedPosterPreview';
import { SortState } from '@/src/components/MediaSortModal';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { WATCH_STATUS_LISTS } from '@/src/constants/lists';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useLists } from '@/src/hooks/useLists';
import { useIconBadgeStyles } from '@/src/styles/iconBadgeStyles';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { ArrowUpDown, Bookmark, ChevronRight } from 'lucide-react-native';
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WatchStatusScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { data: lists, isLoading, isError, error, refetch } = useLists();
  const { t } = useTranslation();
  const iconBadgeStyles = useIconBadgeStyles();
  const listRef = useRef<any>(null);
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>({
    option: 'lastUpdated',
    direction: 'desc',
  });

  const ItemSeparator = () => <View style={styles.separator} />;

  const hasActiveSort = sortState.option !== 'lastUpdated' || sortState.direction !== 'desc';

  // Build watch status lists with data from useLists
  const watchStatusLists = useMemo(() => {
    if (!lists) return [];

    // Map each config to its corresponding list data
    const mapped = WATCH_STATUS_LISTS.map((config) => {
      const listData = lists.find((l) => l.id === config.id);
      return {
        id: config.id,
        labelKey: config.labelKey,
        name: t(config.labelKey),
        items: listData?.items || {},
        createdAt: listData?.createdAt || 0,
        updatedAt: listData?.updatedAt || 0,
      };
    });

    // Apply sorting
    return [...mapped].sort((a, b) => {
      const direction = sortState.direction === 'asc' ? 1 : -1;

      switch (sortState.option) {
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
  }, [lists, sortState, t]);

  const handleApplySort = (newSortState: SortState) => {
    setSortState(newSortState);
    setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <HeaderIconButton onPress={() => setSortModalVisible(true)}>
            <View style={iconBadgeStyles.wrapper}>
              <ArrowUpDown size={22} color={COLORS.text} />
              {hasActiveSort && <View style={iconBadgeStyles.badge} />}
            </View>
          </HeaderIconButton>
        </View>
      ),
    });
  }, [navigation, hasActiveSort]);

  const handleListPress = useCallback(
    (listId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/(tabs)/library/watch-status/${listId}` as any);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: (typeof watchStatusLists)[number] }) => {
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

  const keyExtractor = useCallback((item: (typeof watchStatusLists)[number]) => item.id, []);

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (isError) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <QueryErrorState
          title={t('library.watchStatus')}
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
        {watchStatusLists.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title={t('library.emptyLists')}
            description={t('library.browseContent')}
            actionLabel={t('library.browseContent')}
            onAction={() => router.push('/(tabs)/discover' as any)}
          />
        ) : (
          <FlashList
            ref={listRef}
            data={watchStatusLists}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={libraryListStyles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={ItemSeparator}
          />
        )}
      </SafeAreaView>

      <LibrarySortModal
        visible={sortModalVisible}
        setVisible={setSortModalVisible}
        sortState={sortState}
        onApplySort={handleApplySort}
        allowedOptions={['lastUpdated', 'alphabetical']}
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
