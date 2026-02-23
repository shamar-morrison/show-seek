import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { EnrichedMovieRating } from '@/src/hooks/useEnrichedRatings';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { listCardStyles } from '@/src/styles/listCardStyles';
import { metaTextStyles } from '@/src/styles/metaTextStyles';
import { Star } from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';
import { RatingBadge } from './RatingBadge';

interface MovieRatingListCardProps {
  item: EnrichedMovieRating;
  onPress: (movieId: number) => void;
}

export const MovieRatingListCard = memo<MovieRatingListCardProps>(({ item, onPress }) => {
  const { resolvePosterPath } = usePosterOverrides();
  const handlePress = useCallback(() => {
    if (item.movie) {
      onPress(item.movie.id);
    }
  }, [onPress, item.movie]);
  const movieId = item.movie?.id;
  const moviePosterPath = item.movie?.poster_path ?? null;

  const posterPath = useMemo(() => {
    if (!movieId) {
      return null;
    }

    return resolvePosterPath('movie', movieId, moviePosterPath);
  }, [movieId, moviePosterPath, resolvePosterPath]);

  if (!item.movie) return null;
  const movie = item.movie;

  const year = movie.release_date ? new Date(movie.release_date).getFullYear() : null;

  return (
    <Pressable
      style={({ pressed }) => [
        listCardStyles.container,
        styles.container,
        pressed && listCardStyles.containerPressed,
      ]}
      onPress={handlePress}
    >
      <MediaImage
        source={{ uri: getImageUrl(posterPath, TMDB_IMAGE_SIZES.poster.small) }}
        style={listCardStyles.poster}
        contentFit="cover"
      />
      <View style={listCardStyles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {movie.title}
        </Text>
        <View style={styles.metaContainer}>
          {year && <Text style={metaTextStyles.secondary}>{year}</Text>}
          {movie.vote_average > 0 && year && (
            <Text style={metaTextStyles.secondary}> • </Text>
          )}
          {movie.vote_average > 0 && (
            <View style={styles.tmdbRating}>
              <Star size={12} fill={COLORS.warning} color={COLORS.warning} />
              <Text style={styles.ratingText}>{movie.vote_average.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </View>
      <RatingBadge rating={item.rating.rating} size="medium" />
    </Pressable>
  );
});

MovieRatingListCard.displayName = 'MovieRatingListCard';

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.m,
  },
  title: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tmdbRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  ratingText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.warning,
    fontWeight: '600',
  },
});
