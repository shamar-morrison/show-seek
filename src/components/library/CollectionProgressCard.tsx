import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { CollectionProgressItem } from '@/src/types/collectionTracking';
import { useRouter } from 'expo-router';
import { Layers } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface CollectionProgressCardProps {
  collection: CollectionProgressItem;
}

export function CollectionProgressCard({ collection }: CollectionProgressCardProps) {
  const router = useRouter();
  const currentTab = useCurrentTab();

  const handlePress = () => {
    const tab = currentTab || 'library';
    router.push(`/(tabs)/${tab}/collection/${collection.collectionId}` as any);
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={ACTIVE_OPACITY}>
      {collection.backdropPath ? (
        <MediaImage
          source={{ uri: getImageUrl(collection.backdropPath, TMDB_IMAGE_SIZES.backdrop.small) }}
          style={styles.backdrop}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.backdrop, styles.placeholderBackdrop]}>
          <Layers size={32} color={COLORS.textSecondary} />
        </View>
      )}

      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>
            {collection.name}
          </Text>
          <Text style={styles.countText}>
            {collection.watchedCount}/{collection.totalMovies}
          </Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${collection.percentage}%` }]} />
          </View>
          <Text style={styles.percentageText}>{collection.percentage}%</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    marginBottom: SPACING.m,
    overflow: 'hidden',
  },
  backdrop: {
    width: '100%',
    height: 100,
  },
  placeholderBackdrop: {
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    padding: SPACING.m,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: SPACING.s,
  },
  title: {
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.s,
  },
  countText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.secondary,
    borderRadius: 3,
    marginRight: SPACING.s,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  percentageText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    width: 32,
    textAlign: 'right',
  },
});
