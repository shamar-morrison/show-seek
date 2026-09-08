import { getImageUrl, TMDB_IMAGE_SIZES, type Episode } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import {
  HORIZONTAL_LIST_CONTENT_STYLE,
  HORIZONTAL_SCROLL_PROPS,
} from '@/src/components/ui/horizontalScrollProps';
import { ACTIVE_OPACITY, SPACING } from '@/src/constants/theme';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import React, { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useDetailStyles } from './detailStyles';
import type { RelatedEpisodesSectionProps } from './types';

export const RelatedEpisodesSection = memo<RelatedEpisodesSectionProps>(
  ({ episodes, currentEpisodeNumber, seasonNumber, watchedEpisodes, onEpisodePress, style }) => {
    const { t } = useTranslation();
    const styles = useDetailStyles();

    // Sort episodes by episode number
    const sortedEpisodes = useMemo(() => {
      return [...episodes].sort((a, b) => a.episode_number - b.episode_number);
    }, [episodes]);

    // Hide if only one episode in season
    if (sortedEpisodes.length <= 1) {
      return null;
    }

    return (
      <View style={style}>
        <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>
          {t('media.moreEpisodes')}
        </Text>
        <ScrollView
          {...HORIZONTAL_SCROLL_PROPS}
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -SPACING.l }}
          contentContainerStyle={HORIZONTAL_LIST_CONTENT_STYLE}
        >
          {sortedEpisodes.map((episode) => {
            const isCurrent = episode.episode_number === currentEpisodeNumber;
            const episodeKey = `${seasonNumber}_${episode.episode_number}`;
            const isWatched = watchedEpisodes[episodeKey];

            const episodeNumberLabel = t('media.episodeNumber', { number: episode.episode_number });

            return (
              <EpisodeCard
                key={episode.id}
                episode={episode}
                isCurrent={isCurrent}
                isWatched={isWatched}
                onPress={onEpisodePress}
                episodeNumberLabel={episodeNumberLabel}
              />
            );
          })}
        </ScrollView>
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.episodes.length === nextProps.episodes.length &&
      prevProps.currentEpisodeNumber === nextProps.currentEpisodeNumber &&
      (prevProps.episodes.length === 0 ||
        prevProps.episodes[0]?.id === nextProps.episodes[0]?.id) &&
      JSON.stringify(prevProps.watchedEpisodes) === JSON.stringify(nextProps.watchedEpisodes) &&
      prevProps.onEpisodePress === nextProps.onEpisodePress &&
      prevProps.style === nextProps.style
    );
  }
);

RelatedEpisodesSection.displayName = 'RelatedEpisodesSection';

const EpisodeCard = memo<{
  episode: Episode;
  isCurrent: boolean;
  isWatched: boolean;
  onPress: (episodeNumber: number) => void;
  episodeNumberLabel: string;
}>(({ episode, isCurrent, isWatched, onPress, episodeNumberLabel }) => {
  const styles = useDetailStyles();
  const stillUrl = getImageUrl(episode.still_path, TMDB_IMAGE_SIZES.backdrop.small);

  const handlePress = useCallback(() => {
    onPress(episode.episode_number);
  }, [episode.episode_number, onPress]);

  return (
    <TouchableOpacity
      style={[styles.relatedEpisodeCard, isCurrent && styles.currentEpisodeBorder]}
      onPress={handlePress}
      activeOpacity={ACTIVE_OPACITY}
      disabled={isCurrent} // Don't navigate to current episode
    >
      <View style={{ position: 'relative' }}>
        <MediaImage
          source={{ uri: stillUrl }}
          style={styles.relatedEpisodeStill}
          contentFit="cover"
        />
        {isWatched && (
          <View style={styles.relatedEpisodeWatchedOverlay}>
            <AppIcon icon={Tick02Icon} size={16} color="#fff" />
          </View>
        )}
      </View>
      <View style={styles.relatedEpisodeInfo}>
        <Text style={styles.relatedEpisodeNumber}>{episodeNumberLabel}</Text>
        <Text style={styles.relatedEpisodeTitle} numberOfLines={2}>
          {episode.name}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

EpisodeCard.displayName = 'EpisodeCard';
