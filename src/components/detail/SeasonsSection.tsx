import type { Season } from '@/src/api/tmdb';
import { SeasonCard } from '@/src/components/SeasonCard';
import { SPACING } from '@/src/constants/theme';
import { FlashList } from '@shopify/flash-list';
import React, { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, ViewStyle } from 'react-native';
import { useDetailStyles } from './detailStyles';

interface SeasonsSectionProps {
  tvShowId: number;
  seasons: Season[];
  onSeasonPress: (seasonNumber: number) => void;
  style?: ViewStyle;
}

export const SeasonsSection = memo<SeasonsSectionProps>(
  ({ tvShowId, seasons, onSeasonPress, style }) => {
    const { t } = useTranslation();
    const styles = useDetailStyles();

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
        <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>
          {t('media.seasons')}
        </Text>
        <FlashList
          data={seasons}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <SeasonCard tvShowId={tvShowId} season={item} onPress={handleSeasonPress} />
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
      prevProps.seasons.every((s, i) => s.id === nextProps.seasons[i]?.id)
    );
  }
);

SeasonsSection.displayName = 'SeasonsSection';
