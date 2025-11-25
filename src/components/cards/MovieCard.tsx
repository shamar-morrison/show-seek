import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Image, View } from 'react-native';
import { Route, router } from 'expo-router';
import { Movie, getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE } from '@/src/constants/theme';
import { Star } from 'lucide-react-native';

interface MovieCardProps {
  movie: Movie;
  width?: number;
}

export function MovieCard({ movie, width = 140 }: MovieCardProps) {
  const posterUrl = getImageUrl(movie.poster_path, TMDB_IMAGE_SIZES.poster.medium);

  const handlePress = () => {
    router.push(`/movie/${movie.id}` as Route);
  };

  return (
    <TouchableOpacity onPress={handlePress} style={[styles.container, { width }]}>
      <Image
        source={{ uri: posterUrl || 'https://via.placeholder.com/140x210' }}
        style={[styles.poster, { width, height: width * 1.5 }]}
        resizeMode="cover"
      />
      {movie.vote_average > 0 && (
        <View style={styles.ratingContainer}>
          <Star size={12} fill={COLORS.warning} color={COLORS.warning} />
          <Text style={styles.rating}>{movie.vote_average.toFixed(1)}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {movie.title}
        </Text>
        {movie.release_date && (
          <Text style={styles.year}>
            {new Date(movie.release_date).getFullYear()}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    marginRight: SPACING.m,
  },
  poster: {
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
  ratingContainer: {
    position: 'absolute',
    top: SPACING.s,
    right: SPACING.s,
    backgroundColor: 'rgba(0,0,0,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.s,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.s,
    gap: 4,
  },
  rating: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
  info: {
    marginTop: SPACING.s,
  },
  title: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  year: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
  },
});
