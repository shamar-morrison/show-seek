import { EmptyState } from '@/src/components/library/EmptyState';
import { QueryErrorState } from '@/src/components/library/QueryErrorState';
import { StackedPosterPreview } from '@/src/components/library/StackedPosterPreview';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { WATCH_STATUS_LISTS } from '@/src/constants/lists';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useLists } from '@/src/hooks/useLists';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Bookmark, ChevronRight } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WatchStatusScreen() {
  const router = useRouter();
  const { data: lists, isLoading, isError, error, refetch } = useLists();
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);

  const ItemSeparator = () => <View style={styles.separator} />;

  // Build watch status lists with data from useLists
  const watchStatusLists = useMemo(() => {
    const listDataById = new Map(lists.map((list) => [list.id, list]));

    return WATCH_STATUS_LISTS.map((config) => {
      const listData = listDataById.get(config.id);
      return {
        id: config.id,
        name: t(config.labelKey),
        items: listData?.items ?? {},
      };
    });
  }, [lists, t]);

  const handleListPress = useCallback(
    (listId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`/(tabs)/library/watch-status/${listId}` as any);
    },
    [router]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const renderItem = useCallback(
    ({ item }: { item: (typeof watchStatusLists)[number] }) => {
      const previewItems = Object.values(item.items || {})
        .slice(0, 3)
        .map((mediaItem) => ({
          mediaType: mediaItem.media_type,
          mediaId: mediaItem.id,
          posterPath: mediaItem.poster_path,
        }));

      // Count total items
      const itemCount = Object.keys(item.items || {}).length;

      return (
        <Pressable
          style={({ pressed }) => [styles.listCard, pressed && styles.listCardPressed]}
          onPress={() => handleListPress(item.id)}
        >
          <StackedPosterPreview items={previewItems} />
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
          data={watchStatusLists}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={libraryListStyles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={ItemSeparator}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}
    </SafeAreaView>
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
});
