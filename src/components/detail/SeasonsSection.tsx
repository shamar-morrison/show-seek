import { SPACING } from '@/constants/theme';
import type { Season } from '@/src/api/tmdb';
import { SeasonCard } from '@/src/components/SeasonCard';
import React, { memo, useCallback } from 'react';
import { ScrollView, Text, View, ViewStyle } from 'react-native';
import { detailStyles } from './detailStyles';

interface SeasonsSectionProps {
  tvShowId: number;
  seasons: Season[];
  onSeasonPress: (seasonNumber: number) => void;
  style?: ViewStyle;
}

export const SeasonsSection = memo<SeasonsSectionProps>(
  ({ tvShowId, seasons, onSeasonPress, style }) => {
    const handleSeasonPress = useCallback(
      (seasonNumber: number) => {
        onSeasonPress(seasonNumber);
      },
      [onSeasonPress]
    );

    if (seasons.length === 0) {
      return null;
    }

    return (
      <View style={style}>
        <Text style={[detailStyles.sectionTitle, { paddingBottom: SPACING.s }]}>Seasons</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={detailStyles.similarList}
        >
          {seasons.map((season) => (
            <SeasonCard
              key={season.id}
              tvShowId={tvShowId}
              season={season}
              onPress={handleSeasonPress}
            />
          ))}
        </ScrollView>
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: check array length and first season ID
    return (
      prevProps.tvShowId === nextProps.tvShowId &&
      prevProps.seasons.length === nextProps.seasons.length &&
      (prevProps.seasons.length === 0 ||
        prevProps.seasons[0]?.id === nextProps.seasons[0]?.id)
    );
  }
);

SeasonsSection.displayName = 'SeasonsSection';
