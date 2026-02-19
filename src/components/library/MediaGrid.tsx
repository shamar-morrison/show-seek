import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { AnimatedCheck } from '@/src/components/ui/AnimatedCheck';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { mediaCardStyles } from '@/src/styles/mediaCardStyles';
import { mediaMetaStyles } from '@/src/styles/mediaMetaStyles';
import { ListMediaItem } from '@/src/services/ListService';
import { getThreeColumnGridMetrics, GRID_COLUMN_COUNT } from '@/src/utils/gridLayout';
import { FlashList } from '@shopify/flash-list';
import { LucideIcon, Star } from 'lucide-react-native';
import React, { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MediaImage } from '../ui/MediaImage';
import { EmptyState } from './EmptyState';

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
  selectionMode?: boolean;
  isItemSelected?: (item: ListMediaItem) => boolean;
  contentBottomPadding?: number;
}

export interface MediaGridRef {
  scrollToTop: (animated?: boolean) => void;
}

const MediaGridItem = memo<{
  item: ListMediaItem;
  onPress: (item: ListMediaItem) => void;
  onLongPress: (item: ListMediaItem) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  itemWidth: number;
  itemHorizontalMargin: number;
}>(
  ({
    item,
    onPress,
    onLongPress,
    selectionMode = false,
    isSelected = false,
    itemWidth,
    itemHorizontalMargin,
  }) => {
  const { accentColor } = useAccentColor();
  const handlePress = useCallback(() => onPress(item), [onPress, item]);
  const handleLongPress = useCallback(() => onLongPress(item), [onLongPress, item]);

  const displayTitle = item.title || item.name;
  const releaseDate = item.release_date || item.first_air_date;
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.mediaCard,
        { width: itemWidth, marginHorizontal: itemHorizontalMargin },
        pressed && styles.mediaCardPressed,
      ]}
      onPress={handlePress}
      onLongPress={handleLongPress}
    >
      <View style={styles.posterContainer}>
        <MediaImage
          source={{ uri: getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.medium) }}
          style={[styles.poster, { width: itemWidth, height: itemWidth * 1.5 }]}
          contentFit="cover"
        />
        {selectionMode && (
          <View
            pointerEvents="none"
            style={[
              styles.selectionOverlay,
              isSelected && { borderColor: accentColor, backgroundColor: COLORS.overlaySubtle },
            ]}
          />
        )}
      </View>
      {selectionMode && (
        <View
          style={[
            styles.selectionBadge,
            isSelected && { backgroundColor: accentColor, borderColor: accentColor },
          ]}
        >
          <AnimatedCheck visible={isSelected} />
        </View>
      )}
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
}
);

MediaGridItem.displayName = 'MediaGridItem';

export const MediaGrid = memo(
  forwardRef<MediaGridRef, MediaGridProps>(
    (
      {
        items,
        isLoading,
        emptyState,
        onItemPress,
        onItemLongPress,
        selectionMode = false,
        isItemSelected,
        contentBottomPadding = 0,
      },
      ref
    ) => {
      const listRef = useRef<any>(null);
      const { accentColor } = useAccentColor();
      const { width: windowWidth } = useWindowDimensions();
      const { itemWidth, itemHorizontalMargin, listPaddingHorizontal } =
        getThreeColumnGridMetrics(windowWidth);

      useImperativeHandle(ref, () => ({
        scrollToTop: (animated = true) => {
          listRef.current?.scrollToOffset({ offset: 0, animated });
        },
      }));

      const renderItem = useCallback(
        ({ item }: { item: ListMediaItem }) => (
          <MediaGridItem
            item={item}
            onPress={onItemPress}
            onLongPress={onItemLongPress}
            selectionMode={selectionMode}
            isSelected={isItemSelected?.(item) ?? false}
            itemWidth={itemWidth}
            itemHorizontalMargin={itemHorizontalMargin}
          />
        ),
        [isItemSelected, itemHorizontalMargin, itemWidth, onItemLongPress, onItemPress, selectionMode]
      );

      const keyExtractor = useCallback(
        (item: ListMediaItem) => `${item.id}-${item.media_type}`,
        []
      );

      const contentContainerStyle = useMemo(
        () => ({
          paddingHorizontal: listPaddingHorizontal,
          ...(contentBottomPadding > 0 ? { paddingBottom: contentBottomPadding } : {}),
        }),
        [contentBottomPadding, listPaddingHorizontal]
      );

      if (isLoading) {
        return (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={accentColor} />
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
          numColumns={GRID_COLUMN_COUNT}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator={false}
          keyExtractor={keyExtractor}
          drawDistance={400}
          extraData={isItemSelected}
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
  mediaCard: {
    marginBottom: SPACING.m,
  },
  mediaCardPressed: {
    opacity: ACTIVE_OPACITY,
  },
  posterContainer: {
    position: 'relative',
  },
  poster: {
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 2,
    borderColor: COLORS.transparent,
  },
  selectionBadge: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.s,
    width: 24,
    height: 24,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
