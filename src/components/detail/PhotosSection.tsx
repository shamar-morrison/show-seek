import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, SPACING } from '@/src/constants/theme';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { useDetailStyles } from './detailStyles';
import type { PhotosSectionProps } from './types';

export const PhotosSection = memo<PhotosSectionProps>(
  ({ images, onPhotoPress, style }) => {
    const { t } = useTranslation();
    const styles = useDetailStyles();

    // Limit to 10 images
    const displayImages = images.slice(0, 10);

    // Hook must be called unconditionally (before any early returns)
    const renderItem = useCallback(
      ({ item, index }: { item: (typeof images)[0]; index: number }) => (
        <TouchableOpacity onPress={() => onPhotoPress(index)} activeOpacity={ACTIVE_OPACITY}>
          <MediaImage
            source={{
              uri: getImageUrl(item.file_path, TMDB_IMAGE_SIZES.backdrop.small),
            }}
            style={styles.photoImage}
            contentFit="cover"
          />
        </TouchableOpacity>
      ),
      [onPhotoPress]
    );

    if (images.length === 0) {
      return null;
    }

    return (
      <View style={style}>
        <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>
          {t('media.photos')}
        </Text>
        <FlashList
          horizontal
          data={displayImages}
          renderItem={renderItem}
          keyExtractor={(_, index) => `photo-${index}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SPACING.l }}
          style={{ marginHorizontal: -SPACING.l }}
          removeClippedSubviews={true}
          drawDistance={400}
        />
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: check array length, first image's file_path, and all props
    return (
      prevProps.images.length === nextProps.images.length &&
      (prevProps.images.length === 0 ||
        prevProps.images[0]?.file_path === nextProps.images[0]?.file_path) &&
      prevProps.onPhotoPress === nextProps.onPhotoPress &&
      prevProps.style === nextProps.style
    );
  }
);

PhotosSection.displayName = 'PhotosSection';
