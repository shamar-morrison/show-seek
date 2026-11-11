/**
 * Every photo of a movie or TV show, in a Posters tab and a Backdrops tab. Opened from "See All"
 * on the Photos row of the detail page. Images follow the app language (see organizeMediaImages).
 */
import { getImageUrl, tmdbApi, TMDB_IMAGE_SIZES, type ImageData } from '@/src/api/tmdb';
import ImageLightbox from '@/src/components/ImageLightbox';
import AppErrorState from '@/src/components/ui/AppErrorState';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { MediaImage } from '@/src/components/ui/MediaImage';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { screenStyles } from '@/src/styles/screenStyles';
import { getGridMetrics } from '@/src/utils/gridLayout';
import type { MediaImages } from '@/src/utils/mediaImages';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { FlashList, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type PhotoTab = 'posters' | 'backdrops';

const TAB_LAYOUT: Record<PhotoTab, { columns: number; aspectRatio: number }> = {
  posters: { columns: 3, aspectRatio: 2 / 3 },
  backdrops: { columns: 2, aspectRatio: 16 / 9 },
};

interface MediaPhotosScreenProps {
  mediaType: 'movie' | 'tv';
}

export default function MediaPhotosScreen({ mediaType }: MediaPhotosScreenProps) {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const mediaId = Number(id);
  const router = useRouter();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { width: windowWidth } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<PhotoTab>('posters');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Same query key as the detail page, so the photos are usually already loaded.
  const imagesQuery = useQuery<MediaImages>({
    queryKey: [mediaType, mediaId, 'images'],
    queryFn: () =>
      mediaType === 'movie' ? tmdbApi.getMovieImages(mediaId) : tmdbApi.getTVImages(mediaId),
    enabled: Number.isFinite(mediaId) && mediaId > 0,
  });

  const posters = useMemo(() => imagesQuery.data?.posters ?? [], [imagesQuery.data]);
  const backdrops = useMemo(() => imagesQuery.data?.backdrops ?? [], [imagesQuery.data]);
  const activeImages = activeTab === 'posters' ? posters : backdrops;
  const { columns, aspectRatio } = TAB_LAYOUT[activeTab];
  const { itemWidth, itemHorizontalMargin, listPaddingHorizontal } = getGridMetrics(
    windowWidth,
    columns,
    SPACING.s,
    SPACING.l
  );

  const lightboxImages = useMemo(
    () =>
      activeImages.map(
        (image) =>
          getImageUrl(
            image.file_path,
            activeTab === 'posters'
              ? TMDB_IMAGE_SIZES.poster.large
              : TMDB_IMAGE_SIZES.backdrop.large
          ) || ''
      ),
    [activeImages, activeTab]
  );
  const lightboxDownloadImages = useMemo(
    () =>
      activeImages.map(
        (image) => getImageUrl(image.file_path, TMDB_IMAGE_SIZES.poster.original) || ''
      ),
    [activeImages]
  );
  const lightboxProfileBackgrounds = useMemo(
    () =>
      activeImages.map((image) => ({
        path: image.file_path,
        kind: activeTab === 'posters' ? ('poster' as const) : ('backdrop' as const),
      })),
    [activeImages, activeTab]
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ImageData>) => (
      <TouchableOpacity
        onPress={() => setLightboxIndex(index)}
        activeOpacity={ACTIVE_OPACITY}
        style={{
          width: itemWidth,
          marginHorizontal: itemHorizontalMargin,
          marginBottom: SPACING.s,
        }}
        accessibilityRole="imagebutton"
        accessibilityLabel={t('media.photoNumber', { number: index + 1 })}
        testID={`media-photo-${index}`}
      >
        <MediaImage
          source={{
            uri: getImageUrl(
              item.file_path,
              activeTab === 'posters'
                ? TMDB_IMAGE_SIZES.poster.medium
                : TMDB_IMAGE_SIZES.backdrop.small
            ),
          }}
          style={[styles.image, { aspectRatio }]}
          contentFit="cover"
        />
      </TouchableOpacity>
    ),
    [activeTab, aspectRatio, itemHorizontalMargin, itemWidth, t]
  );

  const header = (
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
        <Text style={styles.headerTitle}>{t('media.photos')}</Text>
        {title ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
    </View>
  );

  if (imagesQuery.isLoading) {
    return <FullScreenLoading />;
  }

  if (imagesQuery.isError || !imagesQuery.data) {
    return (
      <AppErrorState
        error={imagesQuery.error}
        message={t('media.photosFailedToLoad')}
        onRetry={() => {
          void imagesQuery.refetch();
        }}
        onSecondaryAction={() => router.back()}
        secondaryActionLabel={t('common.goBack')}
        accentColor={accentColor}
      />
    );
  }

  const tabs: { id: PhotoTab; label: string; count: number }[] = [
    { id: 'posters', label: t('media.posters'), count: posters.length },
    { id: 'backdrops', label: t('media.backdrops'), count: backdrops.length },
  ];

  return (
    <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      {header}

      <View style={styles.tabContainer} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, isActive && { backgroundColor: accentColor }]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={ACTIVE_OPACITY}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              testID={`media-photos-tab-${tab.id}`}
            >
              <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                {`${tab.label} (${tab.count})`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeImages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {activeTab === 'posters' ? t('media.noPosters') : t('media.noBackdrops')}
          </Text>
        </View>
      ) : (
        <FlashList
          key={activeTab}
          data={activeImages}
          renderItem={renderItem}
          keyExtractor={(item) => item.file_path}
          numColumns={columns}
          contentContainerStyle={{
            paddingHorizontal: listPaddingHorizontal,
            paddingBottom: SPACING.xl,
          }}
          drawDistance={600}
          showsVerticalScrollIndicator={false}
          testID="media-photos-list"
        />
      )}

      <ImageLightbox
        visible={lightboxIndex !== null}
        onClose={() => setLightboxIndex(null)}
        images={lightboxImages}
        downloadImages={lightboxDownloadImages}
        profileBackgrounds={lightboxProfileBackgrounds}
        initialIndex={lightboxIndex ?? 0}
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
  tabContainer: {
    flexDirection: 'row',
    gap: SPACING.m,
    padding: SPACING.m,
  },
  tab: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    flex: 1,
    paddingVertical: SPACING.s,
  },
  tabText: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.m,
  },
  activeTabText: {
    color: COLORS.white,
  },
  image: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    width: '100%',
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
