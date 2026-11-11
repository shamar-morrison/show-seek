/**
 * Every video of a movie or TV show, with a tab per type (Trailers, Teasers, Clips and so on).
 * Opened from "See All" on the Videos row of the detail page. Videos follow the app language
 * (see organizeVideos); tabs only appear for types the title has.
 */
import { tmdbApi, type Video } from '@/src/api/tmdb';
import TrailerPlayer from '@/src/components/VideoPlayerModal';
import AppErrorState from '@/src/components/ui/AppErrorState';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { HORIZONTAL_SCROLL_PROPS } from '@/src/components/ui/horizontalScrollProps';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { SearchableHeader } from '@/src/components/ui/SearchableHeader';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { screenStyles } from '@/src/styles/screenStyles';
import { formatTmdbDateShort } from '@/src/utils/dateUtils';
import { groupVideosByType, VIDEO_TYPE_LABEL_KEYS } from '@/src/utils/mediaVideos';
import { foldForSearch } from '@/src/utils/searchText';
import { ArrowLeft01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const NO_ITEMS: Video[] = [];
const getNoSearchText = () => '';

interface MediaVideosScreenProps {
  mediaType: 'movie' | 'tv';
}

export default function MediaVideosScreen({ mediaType }: MediaVideosScreenProps) {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const mediaId = Number(id);
  const router = useRouter();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [playingVideo, setPlayingVideo] = useState<Video | null>(null);

  // Same query key as the detail page, so the videos are usually already loaded.
  const videosQuery = useQuery<Video[]>({
    queryKey: [mediaType, mediaId, 'videos'],
    queryFn: () =>
      mediaType === 'movie' ? tmdbApi.getMovieVideos(mediaId) : tmdbApi.getTVVideos(mediaId),
    enabled: Number.isFinite(mediaId) && mediaId > 0,
  });

  const groups = useMemo(() => groupVideosByType(videosQuery.data ?? []), [videosQuery.data]);
  const activeGroup = groups.find((group) => group.type === selectedType) ?? groups[0];

  // One search filters every tab, like Cast & Crew: each tab shows its matches and the tabs with
  // none are dimmed, so it's clear where the matches are without switching tabs.
  const {
    searchQuery,
    debouncedQuery,
    isSearchActive,
    activateSearch,
    deactivateSearch,
    setSearchQuery,
  } = useHeaderSearch({ items: NO_ITEMS, getSearchableText: getNoSearchText, debounceMs: 150 });
  const foldedQuery = useMemo(() => foldForSearch(debouncedQuery), [debouncedQuery]);
  const isFiltering = foldedQuery.length > 0;
  const matchesByType = useMemo(() => {
    const matches = new Map<string, Video[]>();
    for (const group of groups) {
      matches.set(
        group.type,
        isFiltering
          ? group.videos.filter((video) => foldForSearch(video.name).includes(foldedQuery))
          : group.videos
      );
    }
    return matches;
  }, [foldedQuery, groups, isFiltering]);
  const activeVideos = activeGroup ? (matchesByType.get(activeGroup.type) ?? []) : [];

  // Results start at the top; clearing the search returns to where each tab's full list was.
  const listRef = useRef<FlashListRef<Video>>(null);
  const scrollOffsetsRef = useRef<Record<string, number>>({});
  const activeType = activeGroup?.type;
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (isFiltering || !activeType) return;
      scrollOffsetsRef.current[activeType] = event.nativeEvent.contentOffset.y;
    },
    [activeType, isFiltering]
  );
  useEffect(() => {
    if (!activeType) return;
    const offset = isFiltering ? 0 : (scrollOffsetsRef.current[activeType] ?? 0);
    const frameId = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset, animated: false });
    });
    return () => cancelAnimationFrame(frameId);
  }, [activeType, foldedQuery, isFiltering]);

  const typeLabel = useCallback(
    (type: string) =>
      VIDEO_TYPE_LABEL_KEYS[type] ? t(`media.videoTypes.${VIDEO_TYPE_LABEL_KEYS[type]}`) : type,
    [t]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Video>) => (
      <TouchableOpacity
        style={styles.row}
        onPress={() => setPlayingVideo(item)}
        activeOpacity={ACTIVE_OPACITY}
        accessibilityRole="button"
        accessibilityLabel={item.name}
        testID={`media-video-${item.key}`}
      >
        <MediaImage
          source={{ uri: `https://img.youtube.com/vi/${item.key}/hqdefault.jpg` }}
          style={styles.thumbnail}
          contentFit="cover"
        />
        <View style={styles.rowText}>
          <Text style={styles.videoTitle} numberOfLines={3}>
            {item.name}
          </Text>
          {item.published_at ? (
            <Text style={styles.videoDate}>
              {formatTmdbDateShort(item.published_at.slice(0, 10))}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    ),
    []
  );

  if (videosQuery.isLoading) {
    return <FullScreenLoading />;
  }

  if (videosQuery.isError || !videosQuery.data) {
    return (
      <AppErrorState
        error={videosQuery.error}
        message={t('media.videosFailedToLoad')}
        onRetry={() => {
          void videosQuery.refetch();
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
      {isSearchActive ? (
        <SearchableHeader
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onClose={deactivateSearch}
          placeholder={t('media.searchVideos')}
          includeTopInset={false}
        />
      ) : (
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
            <Text style={styles.headerTitle}>{t('media.videos')}</Text>
            {title ? (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {title}
              </Text>
            ) : null}
          </View>
          {groups.length > 0 ? (
            <HeaderIconButton
              onPress={activateSearch}
              accessibilityLabel={t('common.search')}
              testID="media-videos-search-button"
            >
              <AppIcon icon={Search01Icon} size={22} color={COLORS.text} />
            </HeaderIconButton>
          ) : null}
        </View>
      )}

      {activeGroup ? (
        <>
          <View>
            {/* No edge bounce: its spring-back swallows taps on the end tabs. */}
            <ScrollView
              {...HORIZONTAL_SCROLL_PROPS}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabs}
              accessibilityRole="tablist"
              testID="media-videos-tabs"
            >
              {groups.map((group) => {
                const isActive = group.type === activeGroup.type;
                const count = matchesByType.get(group.type)?.length ?? 0;
                return (
                  <TouchableOpacity
                    key={group.type}
                    style={[
                      styles.tab,
                      isActive && { backgroundColor: accentColor },
                      count === 0 && !isActive && styles.tabNoMatches,
                    ]}
                    onPress={() => setSelectedType(group.type)}
                    activeOpacity={ACTIVE_OPACITY}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    testID={`media-videos-tab-${group.type}`}
                  >
                    <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                      {`${typeLabel(group.type)} (${count})`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {activeVideos.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {t('media.noVideoMatches', { type: typeLabel(activeGroup.type) })}
              </Text>
            </View>
          ) : (
            <FlashList
              ref={listRef}
              key={activeGroup.type}
              data={activeVideos}
              renderItem={renderItem}
              keyExtractor={(item) => item.key}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onScroll={handleScroll}
              scrollEventThrottle={16}
              testID="media-videos-list"
            />
          )}
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t('media.noVideos')}</Text>
        </View>
      )}

      <TrailerPlayer
        visible={playingVideo !== null}
        onClose={() => setPlayingVideo(null)}
        videoKey={playingVideo?.key ?? null}
        title={playingVideo?.name}
      />
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
  tabs: {
    gap: SPACING.s,
    padding: SPACING.m,
  },
  tab: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
  },
  tabText: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
  },
  tabNoMatches: {
    opacity: 0.5,
  },
  activeTabText: {
    color: COLORS.white,
  },
  listContent: {
    paddingBottom: SPACING.xl,
    paddingHorizontal: SPACING.l,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: SPACING.m,
    marginBottom: SPACING.m,
  },
  thumbnail: {
    aspectRatio: 16 / 9,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    width: 160,
  },
  rowText: {
    flex: 1,
    gap: SPACING.xs,
  },
  videoTitle: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.s,
  },
  videoDate: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.xs,
  },
  empty: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.m,
    textAlign: 'center',
  },
});
