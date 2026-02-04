import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { CollectionSectionProps } from './types';

export const CollectionSection = memo<CollectionSectionProps>(
  ({ collection, shouldLoad, onCollectionPress, onLayout, style }) => {
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();
    // Lazy loading trigger
    if (!shouldLoad) {
      return <View style={style} onLayout={onLayout} />;
    }

    const backdropUrl = getImageUrl(collection.backdrop_path, TMDB_IMAGE_SIZES.backdrop.medium);

    return (
      <View style={style} onLayout={onLayout}>
        <TouchableOpacity
          style={styles.collectionCard}
          onPress={() => onCollectionPress(collection.id)}
          activeOpacity={ACTIVE_OPACITY}
        >
          <MediaImage source={{ uri: backdropUrl }} style={styles.backdrop} contentFit="cover" />
          <LinearGradient
            colors={['transparent', COLORS.overlay, COLORS.background]}
            style={styles.gradient}
          />
          <View style={styles.textContainer}>
            <Text style={styles.collectionName} numberOfLines={2}>
              {collection.name}
            </Text>
            <Text style={[styles.viewMore, { color: accentColor }]}>
              {t('media.tapToViewAllMovies')}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.shouldLoad === nextProps.shouldLoad &&
      prevProps.collection.id === nextProps.collection.id
    );
  }
);

CollectionSection.displayName = 'CollectionSection';

const styles = StyleSheet.create({
  collectionCard: {
    height: 160,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORS.surface,
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  textContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: SPACING.m,
  },
  collectionName: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  viewMore: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
});
