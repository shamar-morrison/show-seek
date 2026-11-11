/**
 * See All for "Similar" (More like this) and "Recommendations" on a movie or TV page: a poster
 * grid that loads more as you scroll (up to about 100 titles), with the person's content filters
 * applied. Tap opens a title; long-press adds it to a list.
 */
import type { Movie, TVShow } from '@/src/api/tmdb';
import AddToListModal, { type AddToListModalRef } from '@/src/components/AddToListModal';
import { MediaGrid } from '@/src/components/library/MediaGrid';
import AppErrorState from '@/src/components/ui/AppErrorState';
import { AppIcon } from '@/src/components/ui/AppIcon';
import Toast, { type ToastRef } from '@/src/components/ui/Toast';
import { ACTIVE_OPACITY, COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useCurrentTab } from '@/src/context/TabContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { useContentFilter } from '@/src/hooks/useContentFilter';
import { useMoreTitles, type MoreTitlesKind } from '@/src/hooks/useMoreTitles';
import type { ListMediaItem } from '@/src/services/ListService';
import { screenStyles } from '@/src/styles/screenStyles';
import { ArrowLeft01Icon, Film01Icon, Tv01Icon } from '@hugeicons/core-free-icons';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface MediaMoreTitlesScreenProps {
  kind: MoreTitlesKind;
  mediaType: 'movie' | 'tv';
}

const toListItem = (item: Movie | TVShow, mediaType: 'movie' | 'tv'): ListMediaItem => {
  const movie = item as Movie;
  const show = item as TVShow;
  return {
    id: item.id,
    media_type: mediaType,
    title: movie.title ?? show.name ?? '',
    name: show.name,
    poster_path: item.poster_path,
    vote_average: item.vote_average,
    release_date: movie.release_date ?? show.first_air_date ?? '',
    first_air_date: show.first_air_date,
    genre_ids: item.genre_ids,
    addedAt: 0,
  };
};

export default function MediaMoreTitlesScreen({ kind, mediaType }: MediaMoreTitlesScreenProps) {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const mediaId = Number(id);
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const isAccountRequired = useAccountRequired();
  const toastRef = useRef<ToastRef>(null);
  const addToListModalRef = useRef<AddToListModalRef>(null);
  const [selectedItem, setSelectedItem] = useState<Omit<ListMediaItem, 'addedAt'> | null>(null);

  const {
    items,
    isLoading,
    isError,
    error,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useMoreTitles(kind, mediaType, mediaId);
  const visibleItems = useContentFilter(items);
  const gridItems = useMemo(
    () => visibleItems.map((item) => toListItem(item, mediaType)),
    [mediaType, visibleItems]
  );

  const heading =
    kind === 'recommendations'
      ? t('media.youMayAlsoLike')
      : mediaType === 'movie'
        ? t('media.similarMovies')
        : t('media.similarShows');

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handlePress = useCallback(
    (item: ListMediaItem) => {
      const path = `/${item.media_type}/${item.id}`;
      router.push((currentTab ? `/(tabs)/${currentTab}${path}` : path) as any);
    },
    [currentTab, router]
  );

  const handleLongPress = useCallback(
    (item: ListMediaItem) => {
      if (isAccountRequired()) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { addedAt: _addedAt, ...mediaItem } = item;
      setSelectedItem(mediaItem);
    },
    [isAccountRequired]
  );

  useEffect(() => {
    if (selectedItem) addToListModalRef.current?.present();
  }, [selectedItem]);

  if (isError && items.length === 0) {
    return (
      <AppErrorState
        error={error}
        message={t('media.moreTitlesFailedToLoad')}
        onRetry={() => {
          void refetch();
        }}
        onSecondaryAction={() => router.back()}
        secondaryActionLabel={t('common.goBack')}
        accentColor={accentColor}
      />
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
          activeOpacity={ACTIVE_OPACITY}
          accessibilityRole="button"
          accessibilityLabel={t('common.goBack')}
        >
          <AppIcon icon={ArrowLeft01Icon} size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {heading}
          </Text>
          {title ? (
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.grid}>
        <MediaGrid
          items={gridItems}
          isLoading={isLoading}
          emptyState={{
            icon: mediaType === 'movie' ? Film01Icon : Tv01Icon,
            title: t('media.noMoreTitles'),
            description: t('media.noMoreTitlesDescription'),
          }}
          onItemPress={handlePress}
          onItemLongPress={handleLongPress}
          onEndReached={handleEndReached}
          isFetchingMore={isFetchingNextPage}
          contentBottomPadding={SPACING.xl}
        />
      </View>

      {selectedItem ? (
        <AddToListModal
          ref={addToListModalRef}
          mediaItem={selectedItem}
          onDismiss={() => setSelectedItem(null)}
          onShowToast={(message) => toastRef.current?.show(message)}
        />
      ) : null}
      <Toast ref={toastRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    borderBottomColor: COLORS.surfaceLight,
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
  },
  headerButton: {
    marginRight: SPACING.s,
    padding: SPACING.s,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.l,
  },
  headerSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    marginTop: 2,
  },
  grid: {
    flex: 1,
    paddingTop: SPACING.m,
  },
});
