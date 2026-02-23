import { getOptimizedImageUrl, Movie } from '@/src/api/tmdb';
import { ListMembershipBadge } from '@/src/components/ui/ListMembershipBadge';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { useListMembership } from '@/src/hooks/useListMembership';
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

interface MovieCardProps {
  movie: Movie;
  width?: number;
  containerStyle?: StyleProp<ViewStyle>;
  /** Show badge if movie is in any list (default: true) */
  showListBadge?: boolean;
  /** Optional pre-resolved poster path to avoid stale list cells */
  posterPathOverride?: string | null;
}

export const MovieCard = memo<MovieCardProps>(
  ({ movie, width = 140, containerStyle, showListBadge = true, posterPathOverride }) => {
    const currentTab = useCurrentTab();
    const { getListsForMedia } = useListMembership();
    const { preferences } = usePreferences();
    const { resolvePosterPath } = usePosterOverrides();
    const resolvedPosterPath = useMemo(
      () => posterPathOverride ?? resolvePosterPath('movie', movie.id, movie.poster_path),
      [movie.id, movie.poster_path, posterPathOverride, resolvePosterPath]
    );

    const posterUrl = useMemo(
      () => getOptimizedImageUrl(resolvedPosterPath, 'poster', 'medium', preferences?.dataSaver),
      [preferences?.dataSaver, resolvedPosterPath]
    );
    const displayTitle = useMemo(
      () => getDisplayMediaTitle(movie, !!preferences?.showOriginalTitles),
      [movie, preferences?.showOriginalTitles]
    );

    const listIds = showListBadge ? getListsForMedia(movie.id, 'movie') : [];
    const showBadge = listIds.length > 0;

    const handlePress = useCallback(() => {
      const path = currentTab ? `/(tabs)/${currentTab}/movie/${movie.id}` : `/movie/${movie.id}`;
      router.push(path as Route);
    }, [currentTab, movie.id]);

    return (
      <TouchableOpacity
        onPress={handlePress}
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
          {movie.release_date && (
            <View style={mediaMetaStyles.yearRatingContainer}>
              <Text style={mediaMetaStyles.year}>{new Date(movie.release_date).getFullYear()}</Text>
              {movie.vote_average > 0 && (
                <>
                  <Text style={mediaMetaStyles.separator}> • </Text>
                  <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                  <Text style={mediaMetaStyles.rating}>{movie.vote_average.toFixed(1)}</Text>
                </>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }
);

MovieCard.displayName = 'MovieCard';

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
