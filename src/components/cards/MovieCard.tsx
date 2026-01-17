import { getImageUrl, Movie, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ListMembershipBadge } from '@/src/components/ui/ListMembershipBadge';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useListMembership } from '@/src/hooks/useListMembership';
import { useCurrentTab } from '@/src/hooks/useNavigation';
import { Route, router } from 'expo-router';
import { Star } from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface MovieCardProps {
  movie: Movie;
  width?: number;
  /** Show badge if movie is in any list (default: true) */
  showListBadge?: boolean;
}

export const MovieCard = memo<MovieCardProps>(
  ({ movie, width = 140, showListBadge = true }) => {
    const currentTab = useCurrentTab();
    const { getListsForMedia } = useListMembership();

    const posterUrl = useMemo(
      () => getImageUrl(movie.poster_path, TMDB_IMAGE_SIZES.poster.medium),
      [movie.poster_path]
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
        style={[styles.container, { width }]}
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
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {movie.title}
          </Text>
          {movie.release_date && (
            <View style={styles.yearRatingContainer}>
              <Text style={styles.year}>{new Date(movie.release_date).getFullYear()}</Text>
              {movie.vote_average > 0 && (
                <>
                  <Text style={styles.separator}> • </Text>
                  <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                  <Text style={styles.rating}>{movie.vote_average.toFixed(1)}</Text>
                </>
              )}
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.movie.id === nextProps.movie.id &&
      prevProps.width === nextProps.width &&
      prevProps.showListBadge === nextProps.showListBadge
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
  info: {
    marginTop: SPACING.s,
  },
  title: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  yearRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: SPACING.xs,
  },
  year: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  separator: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  rating: {
    color: COLORS.warning,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
});
