import { Movie } from '@/src/api/tmdb';
import { MediaCard } from '@/src/components/cards/MediaCard';
import React, { memo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

interface MovieCardProps {
  movie: Movie;
  width?: number;
  containerStyle?: StyleProp<ViewStyle>;
  /** Show badge if movie is in any list (default: true) */
  showListBadge?: boolean;
  /** Optional pre-resolved poster path to avoid stale list cells */
  posterPathOverride?: string | null;
  onLongPress?: (movie: Movie) => void;
}

export const MovieCard = memo<MovieCardProps>(
  ({ movie, width = 140, containerStyle, showListBadge = true, posterPathOverride, onLongPress }) => {
    return (
      <MediaCard
        item={movie}
        mediaType="movie"
        width={width}
        containerStyle={containerStyle}
        showListBadge={showListBadge}
        posterPathOverride={posterPathOverride}
        onLongPress={onLongPress}
      />
    );
  }
);

MovieCard.displayName = 'MovieCard';
