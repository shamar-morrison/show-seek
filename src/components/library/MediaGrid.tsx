import { BORDER_RADIUS, COLORS, SPACING } from '@/constants/theme';
import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ListMediaItem } from '@/src/services/ListService';
import { FlashList } from '@shopify/flash-list';
import { LucideIcon } from 'lucide-react-native';
import React, { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MediaImage } from '../ui/MediaImage';
import { EmptyState } from './EmptyState';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_WIDTH = (width - SPACING.l * 2 - SPACING.m * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

interface MediaGridProps {
  items: ListMediaItem[];
  isLoading: boolean;
  emptyState: {
    icon: LucideIcon;
    title: string;
    description: string;
    actionLabel?: string;
    onAction?: () => void;
  };
  onItemPress: (item: ListMediaItem) => void;
  onItemLongPress: (item: ListMediaItem) => void;
  showRatings?: boolean;
}

const MediaGridItem = memo<{
  item: ListMediaItem;
  onPress: (item: ListMediaItem) => void;
  onLongPress: (item: ListMediaItem) => void;
  showRatings: boolean;
}>(({ item, onPress, onLongPress, showRatings }) => {
  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  const handleLongPress = useCallback(() => onLongPress(item), [onLongPress, item]);

  return (
    <Pressable
      style={({ pressed }) => [styles.mediaCard, pressed && styles.mediaCardPressed]}
      onPress={handlePress}
      onLongPress={handleLongPress}
    >
      <MediaImage
        source={{ uri: getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.medium) }}
        style={styles.poster}
        contentFit="cover"
      />
      {showRatings && item.vote_average > 0 && (
        <View style={styles.ratingBadge}>
          <Text style={styles.ratingText}>{item.vote_average.toFixed(1)}</Text>
        </View>
      )}
    </Pressable>
  );
});

MediaGridItem.displayName = 'MediaGridItem';

export const MediaGrid = memo<MediaGridProps>(
  ({ items, isLoading, emptyState, onItemPress, onItemLongPress, showRatings = true }) => {
    const renderItem = useCallback(
      ({ item }: { item: ListMediaItem }) => (
        <MediaGridItem
          item={item}
          onPress={onItemPress}
          onLongPress={onItemLongPress}
          showRatings={showRatings}
        />
      ),
      [onItemPress, onItemLongPress, showRatings]
    );

    const keyExtractor = useCallback(
      (item: ListMediaItem) => `${item.id}-${item.media_type}`,
      []
    );

    if (isLoading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }

    if (items.length === 0) {
      return (
        <EmptyState
          icon={emptyState.icon}
          title={emptyState.title}
          description={emptyState.description}
          actionLabel={emptyState.actionLabel}
          onAction={emptyState.onAction}
        />
      );
    }

    return (
      <FlashList
        data={items}
        renderItem={renderItem}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyExtractor={keyExtractor}
        drawDistance={400}
        estimatedItemSize={ITEM_WIDTH * 1.5}
      />
    );
  }
);

MediaGrid.displayName = 'MediaGrid';

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: SPACING.l,
    marginLeft: SPACING.s,
  },
  mediaCard: {
    width: ITEM_WIDTH,
    marginBottom: SPACING.m,
    marginRight: SPACING.m,
  },
  mediaCardPressed: {
    transform: [{ scale: 0.95 }],
  },
  poster: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH * 1.5,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
  ratingBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  ratingText: {
    color: COLORS.warning,
    fontSize: 10,
    fontWeight: 'bold',
  },
});
