import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import {
  ACTIVE_OPACITY,
  COLORS,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import { listCardStyles } from '@/src/styles/listCardStyles';
import { FavoriteEpisode } from '@/src/types/favoriteEpisode';
import { Note } from '@/src/types/note';
import { Pencil, Trash2 } from 'lucide-react-native';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface FavoriteEpisodeCardProps {
  episode: FavoriteEpisode;
  note: Note | null;
  onPress: (episode: FavoriteEpisode) => void;
  onEditNote: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
}

export const FavoriteEpisodeCard = memo<FavoriteEpisodeCardProps>(
  ({ episode, note, onPress, onEditNote, onDeleteNote }) => {
    const { t } = useTranslation();
    const posterUrl = getImageUrl(episode.posterPath, TMDB_IMAGE_SIZES.poster.small);

    return (
      <View style={listCardStyles.container}>
        <Pressable
          style={({ pressed }) => [
            styles.pressableContent,
            pressed && listCardStyles.containerPressed,
          ]}
          onPress={() => onPress(episode)}
        >
          <MediaImage
            source={{ uri: posterUrl }}
            style={listCardStyles.poster}
            contentFit="cover"
          />
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

            {note && (
              <View style={styles.notePreview}>
                <Text style={styles.noteText} numberOfLines={2}>
                  {note.content}
                </Text>
              </View>
            )}
          </View>
        </Pressable>

        {note && (
          <View style={styles.actions}>
            <Pressable
              onPress={() => onEditNote(note)}
              style={styles.actionButton}
              hitSlop={HIT_SLOP.m}
            >
              <Pencil size={18} color={COLORS.text} />
            </Pressable>
            <Pressable
              onPress={() => onDeleteNote(note)}
              style={styles.actionButton}
              hitSlop={HIT_SLOP.m}
            >
              <Trash2 size={18} color={COLORS.error} />
            </Pressable>
          </View>
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  pressableContent: {
    flex: 1,
    flexDirection: 'row',
  },
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
    marginBottom: SPACING.s,
  },
  notePreview: {
    backgroundColor: COLORS.surfaceDark,
    padding: SPACING.s,
    borderRadius: 4,
    marginTop: SPACING.xs,
  },
  noteText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.text,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  actions: {
    justifyContent: 'center',
    paddingLeft: SPACING.s,
    gap: SPACING.m,
  },
  actionButton: {
    padding: SPACING.xs,
  },
});

FavoriteEpisodeCard.displayName = 'FavoriteEpisodeCard';
