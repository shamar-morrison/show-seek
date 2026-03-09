import { getOptimizedImageUrl, Movie, TVShow } from '@/src/api/tmdb';
import { ListMembershipBadge } from '@/src/components/ui/ListMembershipBadge';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { useListMembership } from '@/src/hooks/useListMembership';
import { useLongPressPressGuard } from '@/src/hooks/useLongPressPressGuard';
import { useCurrentTab } from '@/src/hooks/useNavigation';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { usePreferences } from '@/src/hooks/usePreferences';
import { mediaCardStyles } from '@/src/styles/mediaCardStyles';
import { mediaMetaStyles } from '@/src/styles/mediaMetaStyles';
import { getDisplayMediaTitle } from '@/src/utils/mediaTitle';
import { Route, router } from 'expo-router';
import { Star } from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

type MediaCardItem = Movie | TVShow;

interface MediaCardProps<T extends MediaCardItem> {
  item: T;
  mediaType: 'movie' | 'tv';
  width?: number;
  containerStyle?: StyleProp<ViewStyle>;
  showListBadge?: boolean;
  posterPathOverride?: string | null;
  onLongPress?: (item: T) => void;
}

const isMovie = (item: MediaCardItem): item is Movie => {
  return 'title' in item;
};

function MediaCardComponent<T extends MediaCardItem>({
  item,
  mediaType,
  width = 140,
  containerStyle,
  showListBadge = true,
  posterPathOverride,
  onLongPress,
}: MediaCardProps<T>) {
  const currentTab = useCurrentTab();
  const { getListsForMedia } = useListMembership();
  const { preferences } = usePreferences();
  const { resolvePosterPath } = usePosterOverrides();
  const resolvedPosterPath = useMemo(
    () => posterPathOverride ?? resolvePosterPath(mediaType, item.id, item.poster_path),
    [item.id, item.poster_path, mediaType, posterPathOverride, resolvePosterPath]
  );

  const posterUrl = useMemo(
    () => getOptimizedImageUrl(resolvedPosterPath, 'poster', 'medium', preferences?.dataSaver),
    [preferences?.dataSaver, resolvedPosterPath]
  );
  const displayTitle = useMemo(
    () => getDisplayMediaTitle(item, !!preferences?.showOriginalTitles),
    [item, preferences?.showOriginalTitles]
  );

  const listIds = showListBadge ? getListsForMedia(item.id, mediaType) : [];
  const showBadge = listIds.length > 0;

  const handleNavigate = useCallback(() => {
    const path = currentTab ? `/(tabs)/${currentTab}/${mediaType}/${item.id}` : `/${mediaType}/${item.id}`;
    router.push(path as Route);
  }, [currentTab, item.id, mediaType]);

  const handleCardLongPress = useCallback(() => {
    onLongPress?.(item);
  }, [item, onLongPress]);

  const { handlePress, handleLongPress, handlePressOut } = useLongPressPressGuard({
    onPress: handleNavigate,
    onLongPress: onLongPress ? handleCardLongPress : undefined,
  });

  const releaseDate = isMovie(item) ? item.release_date : item.first_air_date;

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressOut={handlePressOut}
      onLongPress={onLongPress ? handleLongPress : undefined}
      style={[styles.container, { width }, containerStyle]}
      activeOpacity={ACTIVE_OPACITY}
    >
      <View style={styles.posterContainer}>
        <MediaImage
          source={{ uri: posterUrl }}
          style={[styles.poster, { width, height: width * 1.5 }]}
          contentFit="cover"
        />
        {showBadge && <ListMembershipBadge listIds={listIds} />}
      </View>
      <View style={mediaCardStyles.info}>
        <Text style={mediaCardStyles.title} numberOfLines={2}>
          {displayTitle}
        </Text>
        {releaseDate && (
          <View style={mediaMetaStyles.yearRatingContainer}>
            <Text style={mediaMetaStyles.year}>{new Date(releaseDate).getFullYear()}</Text>
            {item.vote_average > 0 && (
              <>
                <Text style={mediaMetaStyles.separator}> • </Text>
                <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                <Text style={mediaMetaStyles.rating}>{item.vote_average.toFixed(1)}</Text>
              </>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export const MediaCard = memo(MediaCardComponent) as typeof MediaCardComponent;

const styles = StyleSheet.create({
  container: {
    marginRight: SPACING.m,
  },
  posterContainer: {
    position: 'relative',
  },
  poster: {
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
});
