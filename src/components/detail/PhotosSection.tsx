import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, SPACING } from '@/src/constants/theme';
import { HorizontalFlashList } from '@/src/components/ui/HorizontalFlashList';
import { SectionViewAllButton } from '@/src/components/ui/SectionViewAllButton';
import React, { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { useDetailStyles } from './detailStyles';
import type { PhotosSectionProps } from './types';

export const PhotosSection = memo<PhotosSectionProps>(
  ({ images, onPhotoPress, style, variant = 'landscape', onViewAll }) => {
    const { t } = useTranslation();
    const styles = useDetailStyles();
    const isPortrait = variant === 'portrait';

    // Limit to 10 images
    const displayImages = images.slice(0, 10);

    // Hook must be called unconditionally (before any early returns)
    const renderItem = useCallback(
      ({ item, index }: { item: (typeof images)[0]; index: number }) => (
        <TouchableOpacity onPress={() => onPhotoPress(index)} activeOpacity={ACTIVE_OPACITY}>
          <MediaImage
            source={{
              uri: getImageUrl(
                item.file_path,
                isPortrait ? TMDB_IMAGE_SIZES.profile.medium : TMDB_IMAGE_SIZES.backdrop.small
              ),
            }}
            style={isPortrait ? styles.photoImagePortrait : styles.photoImage}
            contentFit="cover"
          />
        </TouchableOpacity>
      ),
      [isPortrait, onPhotoPress, styles.photoImage, styles.photoImagePortrait]
    );

    if (images.length === 0) {
      return null;
    }

    return (
      <View style={style}>
        {onViewAll ? (
          <TouchableOpacity
            style={[styles.sectionHeader, { paddingBottom: SPACING.s }]}
            onPress={onViewAll}
            activeOpacity={ACTIVE_OPACITY}
            accessibilityRole="button"
          >
            <Text style={styles.sectionTitle}>{t('media.photos')}</Text>
            <SectionViewAllButton onPress={onViewAll} />
          </TouchableOpacity>
        ) : (
          <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>
            {t('media.photos')}
          </Text>
        )}
        <HorizontalFlashList
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
      prevProps.style === nextProps.style &&
      (prevProps.variant ?? 'landscape') === (nextProps.variant ?? 'landscape') &&
      prevProps.onViewAll === nextProps.onViewAll
    );
  }
);

PhotosSection.displayName = 'PhotosSection';
