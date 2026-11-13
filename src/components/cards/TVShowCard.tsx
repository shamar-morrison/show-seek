import { TVShow } from '@/src/api/tmdb';
import { MediaCard } from '@/src/components/cards/MediaCard';
import React, { memo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

interface TVShowCardProps {
  show: TVShow;
  width?: number;
  containerStyle?: StyleProp<ViewStyle>;
  /** Show badge if show is in any list (default: true) */
  showListBadge?: boolean;
  /** Optional pre-resolved poster path to avoid stale list cells */
  posterPathOverride?: string | null;
  onLongPress?: (show: TVShow) => void;
  /** Set when the card stands for one season of the show: it then opens that season. */
  seasonNumber?: number;
  /** For a season card: "Season X", shown under the title. */
  seasonLabel?: string;
}

export const TVShowCard = memo<TVShowCardProps>(
  ({
    show,
    width = 140,
    containerStyle,
    showListBadge = true,
    posterPathOverride,
    onLongPress,
    seasonNumber,
    seasonLabel,
  }) => {
    return (
      <MediaCard
        item={show}
        mediaType="tv"
        width={width}
        containerStyle={containerStyle}
        showListBadge={showListBadge}
        posterPathOverride={posterPathOverride}
        onLongPress={onLongPress}
        seasonNumber={seasonNumber}
        seasonLabel={seasonLabel}
      />
    );
  }
);

TVShowCard.displayName = 'TVShowCard';
