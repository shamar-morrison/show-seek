import { getImageUrl, TMDB_IMAGE_SIZES, TVShow } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/hooks/useNavigation';
import { router } from 'expo-router';
import { Star } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface TVShowCardProps {
  show: TVShow;
  width?: number;
}

export function TVShowCard({ show, width = 140 }: TVShowCardProps) {
  const currentTab = useCurrentTab();
  const posterUrl = getImageUrl(show.poster_path, TMDB_IMAGE_SIZES.poster.medium);

  const handlePress = () => {
    const path = currentTab ? `/(tabs)/${currentTab}/tv/${show.id}` : `/tv/${show.id}`;
    router.push(path as any);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.container, { width }]}
      activeOpacity={ACTIVE_OPACITY}
    >
      <MediaImage
        source={{ uri: posterUrl }}
        style={[styles.poster, { width, height: width * 1.5 }]}
        contentFit="cover"
      />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {show.name}
        </Text>
        {show.first_air_date && (
          <View style={styles.yearRatingContainer}>
            <Text style={styles.year}>{new Date(show.first_air_date).getFullYear()}</Text>
            {show.vote_average > 0 && (
              <>
                <Text style={styles.separator}> • </Text>
                <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                <Text style={styles.rating}>{show.vote_average.toFixed(1)}</Text>
              </>
            )}
          </View>
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
    gap: 4,
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
