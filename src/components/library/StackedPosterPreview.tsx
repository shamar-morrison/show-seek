import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { BORDER_RADIUS, COLORS } from '@/src/constants/theme';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';

export interface StackedPosterItem {
  mediaType: 'movie' | 'tv';
  mediaId: number;
  posterPath: string | null;
}

interface StackedPosterPreviewProps {
  /** Up to 3 media items to display */
  items: StackedPosterItem[];
  /** Size variant for the posters */
  size?: 'small' | 'medium';
}

// Poster dimensions based on size
const POSTER_SIZES = {
  small: { width: 80, height: 120 },
  medium: { width: 100, height: 150 },
};

// Stacking configuration for each layer (front to back)
const STACK_CONFIG = [
  { rotation: 0, offsetX: 0, offsetY: 0, zIndex: 3 }, // Front poster
  { rotation: -0, offsetX: -8, offsetY: -5, zIndex: 2 }, // Middle poster
  { rotation: -0, offsetX: -16, offsetY: -8, zIndex: 1 }, // Back poster
];

/**
 * Displays up to 3 stacked movie/TV show posters with rotation offsets.
 * Used in custom list cards to preview list contents.
 */
export const StackedPosterPreview = memo<StackedPosterPreviewProps>(
  ({ items, size = 'small' }) => {
    const { resolvePosterPath } = usePosterOverrides();
    const dimensions = POSTER_SIZES[size];

    // Take up to 3 posters, keep media identity for override resolution.
    const displayItems = useMemo(() => items.slice(0, 3), [items]);

    // If no posters at all, show a single placeholder
    const hasItems = displayItems.length > 0;

    // Calculate container dimensions to accommodate rotated posters
    const containerWidth = dimensions.width + 20;
    const containerHeight = dimensions.height + 12;

    return (
      <View style={[styles.container, { width: containerWidth, height: containerHeight }]}>
        {(hasItems ? displayItems : [null]).map((stackItem, index) => {
          // Reverse the render order so back posters are rendered first (underneath)
          const reverseIndex = (hasItems ? displayItems.length : 1) - 1 - index;
          const config = STACK_CONFIG[reverseIndex];
          const resolvedPosterPath = stackItem
            ? resolvePosterPath(stackItem.mediaType, stackItem.mediaId, stackItem.posterPath)
            : null;
          const placeholderType = stackItem?.mediaType ?? 'movie';

          return (
            <View
              key={
                stackItem
                  ? `${stackItem.mediaType}-${stackItem.mediaId}-${index}`
                  : `poster-placeholder-${index}`
              }
              style={[
                styles.posterWrapper,
                {
                  width: dimensions.width,
                  height: dimensions.height,
                  transform: [
                    { translateX: config.offsetX },
                    { translateY: config.offsetY },
                    { rotate: `${config.rotation}deg` },
                  ],
                  zIndex: config.zIndex,
                },
              ]}
            >
              <MediaImage
                source={{ uri: getImageUrl(resolvedPosterPath, TMDB_IMAGE_SIZES.poster.small) }}
                style={[styles.poster, { width: dimensions.width, height: dimensions.height }]}
                contentFit="cover"
                placeholderType={placeholderType}
              />
            </View>
          );
        })}
      </View>
    );
  }
);

StackedPosterPreview.displayName = 'StackedPosterPreview';

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterWrapper: {
    position: 'absolute',
    borderRadius: BORDER_RADIUS.s,
    overflow: 'hidden',
    // Shadow for depth effect
    shadowColor: COLORS.background,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  poster: {
    borderRadius: BORDER_RADIUS.s,
  },
});
