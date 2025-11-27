import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, SPACING } from '@/src/constants/theme';
import React, { memo } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { detailStyles } from './detailStyles';
import type { PhotosSectionProps } from './types';

export const PhotosSection = memo<PhotosSectionProps>(
  ({ images, onPhotoPress, style }) => {
    if (images.length === 0) {
      return null;
    }

    return (
      <View style={style}>
        <Text style={[detailStyles.sectionTitle, { paddingBottom: SPACING.s }]}>Photos</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={detailStyles.photosList}
        >
          {images.slice(0, 10).map((image, index) => (
            <TouchableOpacity
              key={`photo-${index}`}
              onPress={() => onPhotoPress(index)}
              activeOpacity={ACTIVE_OPACITY}
            >
              <MediaImage
                source={{
                  uri: getImageUrl(image.file_path, TMDB_IMAGE_SIZES.backdrop.small),
                }}
                style={detailStyles.photoImage}
                contentFit="cover"
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
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
