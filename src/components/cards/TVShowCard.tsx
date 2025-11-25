import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Image, View } from 'react-native';
import { router } from 'expo-router';
import { TVShow, getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZE } from '@/src/constants/theme';
import { Star } from 'lucide-react-native';

interface TVShowCardProps {
  show: TVShow;
  width?: number;
}

export function TVShowCard({ show, width = 140 }: TVShowCardProps) {
  const posterUrl = getImageUrl(show.poster_path, TMDB_IMAGE_SIZES.poster.medium);

  const handlePress = () => {
    router.push(`/tv/${show.id}` as any);
  };

  return (
    <TouchableOpacity onPress={handlePress} style={[styles.container, { width }]}>
      <Image
        source={{ uri: posterUrl || 'https://via.placeholder.com/140x210' }}
        style={[styles.poster, { width, height: width * 1.5 }]}
        resizeMode="cover"
      />
      {show.vote_average > 0 && (
        <View style={styles.ratingContainer}>
          <Star size={12} fill={COLORS.warning} color={COLORS.warning} />
          <Text style={styles.rating}>{show.vote_average.toFixed(1)}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {show.name}
        </Text>
        {show.first_air_date && (
          <Text style={styles.year}>
            {new Date(show.first_air_date).getFullYear()}
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
