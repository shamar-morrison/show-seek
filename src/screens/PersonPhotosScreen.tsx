import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi, type ImageData } from '@/src/api/tmdb';
import ImageLightbox from '@/src/components/ImageLightbox';
import AppErrorState from '@/src/components/ui/AppErrorState';
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
import { getThreeColumnGridMetrics, GRID_COLUMN_COUNT } from '@/src/utils/gridLayout';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Image01Icon } from '@hugeicons/core-free-icons';
import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PersonPhotosScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { width: windowWidth } = useWindowDimensions();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();

  const personId = Number(id);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const screenTitle = name ? `${name} - ${t('media.photos')}` : t('media.photos');

  // Set header options synchronously before first paint to prevent status bar overlap
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: screenTitle,
      headerStyle: { backgroundColor: COLORS.background },
      headerTintColor: COLORS.text,
    });
  }, [navigation, screenTitle]);

  const imagesQuery = useQuery({
    queryKey: ['person', personId, 'images'],
    queryFn: () => tmdbApi.getPersonImages(personId),
    enabled: !!personId,
  });

  const { itemWidth, itemHorizontalMargin, listPaddingHorizontal } =
    getThreeColumnGridMetrics(windowWidth);

  const photos = useMemo(() => {
    const profiles = imagesQuery.data?.profiles ?? [];
    const seen = new Set<string>();
    return profiles.filter((photo) => {
      if (!photo.file_path || seen.has(photo.file_path)) {
        return false;
      }
      seen.add(photo.file_path);
      return true;
    });
  }, [imagesQuery.data?.profiles]);

  const lightboxDisplayImages = useMemo(
    () =>
      photos
        .map((img) => getImageUrl(img.file_path, TMDB_IMAGE_SIZES.profile.large))
        .filter((url): url is string => url !== null),
    [photos]
  );

  const lightboxDownloadImages = useMemo(
    () =>
      photos
        .map((img) => getImageUrl(img.file_path, TMDB_IMAGE_SIZES.profile.original))
        .filter((url): url is string => url !== null),
    [photos]
  );

  const handlePhotoPress = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxVisible(true);
  }, []);

  const renderGridItem = useCallback(
    ({ item, index }: { item: ImageData; index: number }) => (
      <TouchableOpacity
        style={[styles.gridCard, { width: itemWidth, marginHorizontal: itemHorizontalMargin }]}
        onPress={() => handlePhotoPress(index)}
        activeOpacity={ACTIVE_OPACITY}
        accessibilityRole="imagebutton"
      >
        <MediaImage
          source={{ uri: getImageUrl(item.file_path, TMDB_IMAGE_SIZES.profile.medium) }}
          style={[styles.gridPhoto, { width: itemWidth, height: itemWidth * 1.5 }]}
          contentFit="cover"
        />
      </TouchableOpacity>
    ),
    [handlePhotoPress, itemHorizontalMargin, itemWidth]
  );

  if (imagesQuery.isLoading) {
    return <FullScreenLoading />;
  }

  if (imagesQuery.isError) {
    return (
      <AppErrorState
        error={imagesQuery.error}
        message={t('person.failedToLoadPhotos')}
        onRetry={() => {
          void imagesQuery.refetch();
        }}
        onSecondaryAction={() => router.back()}
        secondaryActionLabel={t('common.goBack')}
        accentColor={accentColor}
      />
    );
  }

  return (
    <>
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        {photos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <AppIcon icon={Image01Icon} size={48} color={COLORS.textSecondary} />
            <Text style={styles.emptyTitle}>{t('person.noPhotosTitle')}</Text>
            <Text style={styles.emptyDescription}>{t('person.noPhotosDescription')}</Text>
          </View>
        ) : (
          <FlashList
            data={photos}
            renderItem={renderGridItem}
            keyExtractor={(item) => item.file_path}
            numColumns={GRID_COLUMN_COUNT}
            drawDistance={400}
            contentContainerStyle={[
              styles.gridContent,
              { paddingHorizontal: listPaddingHorizontal },
            ]}
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>

      <ImageLightbox
        visible={lightboxVisible}
        onClose={() => setLightboxVisible(false)}
        images={lightboxDisplayImages}
        downloadImages={lightboxDownloadImages}
        initialIndex={lightboxIndex}
      />
    </>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.l,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
    textAlign: 'center',
    marginTop: SPACING.m,
    marginBottom: SPACING.s,
  },
  emptyDescription: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  gridContent: {
    paddingTop: SPACING.m,
  },
  gridCard: {
    marginBottom: SPACING.m,
  },
  gridPhoto: {
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
});
