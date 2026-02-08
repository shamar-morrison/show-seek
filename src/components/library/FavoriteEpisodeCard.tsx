import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { COLORS, FONT_SIZE } from '@/src/constants/theme';
import { listCardStyles } from '@/src/styles/listCardStyles';
import { FavoriteEpisode } from '@/src/types/favoriteEpisode';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface FavoriteEpisodeCardProps {
  episode: FavoriteEpisode;
  onPress: (episode: FavoriteEpisode) => void;
}

export const FavoriteEpisodeCard = memo<FavoriteEpisodeCardProps>(({ episode, onPress }) => {
  const { t } = useTranslation();
  const posterUrl = getImageUrl(episode.posterPath, TMDB_IMAGE_SIZES.poster.small);

  return (
    <Pressable
      style={({ pressed }) => [
        listCardStyles.container,
        pressed && listCardStyles.containerPressed,
      ]}
      onPress={() => onPress(episode)}
    >
      <MediaImage source={{ uri: posterUrl }} style={listCardStyles.poster} contentFit="cover" />
      <View style={listCardStyles.info}>
        <Text style={styles.showName} numberOfLines={1}>
          {episode.showName}
        </Text>
        <Text style={styles.episodeName} numberOfLines={1}>
          {episode.episodeName}
        </Text>
        <Text style={styles.episodeMeta}>
          {t('media.seasonEpisode', {
            season: episode.seasonNumber,
            episode: episode.episodeNumber,
          })}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  showName: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  episodeName: {
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 2,
  },
  episodeMeta: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
});

FavoriteEpisodeCard.displayName = 'FavoriteEpisodeCard';
