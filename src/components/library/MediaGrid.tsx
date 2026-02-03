import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { mediaCardStyles } from '@/src/styles/mediaCardStyles';
import { mediaMetaStyles } from '@/src/styles/mediaMetaStyles';
import { ListMediaItem } from '@/src/services/ListService';
import { FlashList } from '@shopify/flash-list';
import { LucideIcon, Star } from 'lucide-react-native';
import React, { forwardRef, memo, useCallback, useImperativeHandle, useRef } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
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
}

export interface MediaGridRef {
  scrollToTop: (animated?: boolean) => void;
}

const MediaGridItem = memo<{
  item: ListMediaItem;
  onPress: (item: ListMediaItem) => void;
  onLongPress: (item: ListMediaItem) => void;
}>(({ item, onPress, onLongPress }) => {
  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  const handleLongPress = useCallback(() => onLongPress(item), [onLongPress, item]);

  const displayTitle = item.title || item.name;
  const releaseDate = item.release_date || item.first_air_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

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
      <View style={mediaCardStyles.info}>
        <Text style={mediaCardStyles.title} numberOfLines={1}>
          {displayTitle}
        </Text>
        {(year || item.vote_average > 0) && (
          <View style={mediaMetaStyles.yearRatingContainer}>
            {year && <Text style={mediaMetaStyles.year}>{year}</Text>}
            {year && item.vote_average > 0 && <Text style={mediaMetaStyles.separator}> • </Text>}
            {item.vote_average > 0 && (
              <>
                <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                <Text style={mediaMetaStyles.rating}>{item.vote_average.toFixed(1)}</Text>
              </>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
});

MediaGridItem.displayName = 'MediaGridItem';

export const MediaGrid = memo(
  forwardRef<MediaGridRef, MediaGridProps>(
    ({ items, isLoading, emptyState, onItemPress, onItemLongPress }, ref) => {
      const listRef = useRef<any>(null);

      useImperativeHandle(ref, () => ({
        scrollToTop: (animated = true) => {
          listRef.current?.scrollToOffset({ offset: 0, animated });
        },
      }));

      const renderItem = useCallback(
        ({ item }: { item: ListMediaItem }) => (
          <MediaGridItem item={item} onPress={onItemPress} onLongPress={onItemLongPress} />
        ),
        [onItemPress, onItemLongPress]
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
          ref={listRef}
          data={items}
          renderItem={renderItem}
          numColumns={COLUMN_COUNT}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyExtractor={keyExtractor}
          drawDistance={400}
        />
      );
    }
  )
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
    opacity: ACTIVE_OPACITY,
  },
  poster: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH * 1.5,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
});
