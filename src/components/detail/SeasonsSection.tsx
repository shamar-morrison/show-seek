import type { Season } from '@/src/api/tmdb';
import { SeasonCard } from '@/src/components/SeasonCard';
import { SPACING } from '@/src/constants/theme';
import { useRatings } from '@/src/hooks/useRatings';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, ViewStyle } from 'react-native';
import { useDetailStyles } from './detailStyles';
import type { UpNextEpisode } from './types';
import { UpNextEpisodeSection } from './UpNextEpisodeSection';

interface SeasonsSectionProps {
  tvShowId: number;
  seasons: Season[];
  onSeasonPress: (seasonNumber: number) => void;
  /** Next episode to air — rendered as an "Up Next" card under the header when provided */
  nextEpisode?: UpNextEpisode | null;
  onEpisodePress?: (seasonNumber: number, episodeNumber: number) => void;
  style?: ViewStyle;
}

export type { UpNextEpisode };

export const SeasonsSection = memo<SeasonsSectionProps>(
  ({ tvShowId, seasons, onSeasonPress, nextEpisode, onEpisodePress, style }) => {
    const { t } = useTranslation();
    const styles = useDetailStyles();
    const { data: ratings } = useRatings();

    const handleSeasonPress = useCallback(
      (seasonNumber: number) => {
        onSeasonPress(seasonNumber);
      },
      [onSeasonPress]
    );

    const seasonRatingsByNumber = useMemo(() => {
      const map = new Map<number, number>();

      (ratings || []).forEach((rating) => {
        if (
          rating.mediaType === 'season' &&
          rating.tvShowId === tvShowId &&
          typeof rating.seasonNumber === 'number'
        ) {
          map.set(rating.seasonNumber, rating.rating);
        }
      });

      return map;
    }, [ratings, tvShowId]);

    if (seasons.length === 0) {
      return null;
    }

    return (
      <View style={style}>
        <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>
          {t('media.seasons')}
        </Text>
        {nextEpisode && onEpisodePress ? (
          <UpNextEpisodeSection episode={nextEpisode} onEpisodePress={onEpisodePress} />
        ) : null}
        <FlashList
          data={seasons}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <SeasonCard
              tvShowId={tvShowId}
              season={item}
              userRating={seasonRatingsByNumber.get(item.season_number)}
              onPress={handleSeasonPress}
            />
          )}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.similarList}
        />
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: check array length and first season ID
    return (
      prevProps.tvShowId === nextProps.tvShowId &&
      prevProps.seasons.length === nextProps.seasons.length &&
      prevProps.seasons.every((s, i) => s.id === nextProps.seasons[i]?.id) &&
      prevProps.nextEpisode?.id === nextProps.nextEpisode?.id &&
      prevProps.onEpisodePress === nextProps.onEpisodePress
    );
  }
);

SeasonsSection.displayName = 'SeasonsSection';
