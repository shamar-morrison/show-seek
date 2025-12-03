import { SPACING } from '@/constants/theme';
import type { Season } from '@/src/api/tmdb';
import { SeasonCard } from '@/src/components/SeasonCard';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback } from 'react';
import { Text, View, ViewStyle } from 'react-native';
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
        <FlashList
          data={seasons}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <SeasonCard tvShowId={tvShowId} season={item} onPress={handleSeasonPress} />
          )}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={detailStyles.similarList}
        />
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: check array length and first season ID
    return (
      prevProps.tvShowId === nextProps.tvShowId &&
      prevProps.seasons.length === nextProps.seasons.length &&
      prevProps.seasons.every((s, i) => s.id === nextProps.seasons[i]?.id)
    );
  }
);

SeasonsSection.displayName = 'SeasonsSection';
