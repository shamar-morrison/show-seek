import type { Episode } from '@/src/api/tmdb';
import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import * as Haptics from 'expo-haptics';
import { Calendar, Check, Star } from 'lucide-react-native';
import React, { memo, useCallback } from 'react';
import type { TFunction } from 'i18next';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useSeasonScreenStyles } from './seasonScreenStyles';

export interface EpisodeItemProps {
  episode: Episode;
  seasonNumber: number;
  tvId: number;
  showName: string;
  showPosterPath: string | null;
  isWatched: boolean;
  isPending: boolean;
  hasAired: boolean;
  userRating: number;
  formatDate: (date: string | null) => string;
  onPress: () => void;
  onMarkWatched: () => void;
  onMarkUnwatched: () => void;
  t: TFunction;
  progress?: { watchedCount: number; totalAiredCount: number };
  showStatus?: string;
  autoAddToWatching: boolean;
  listMembership: Record<string, boolean>;
  firstAirDate?: string;
  voteAverage?: number;
}

export const EpisodeItem = memo<EpisodeItemProps>(
  ({
    episode,
    isWatched,
    isPending,
    hasAired,
    userRating,
    formatDate,
    onPress,
    onMarkWatched,
    onMarkUnwatched,
    t,
  }) => {
    const styles = useSeasonScreenStyles();
    const { accentColor } = useAccentColor();
    const stillUrl = getImageUrl(episode.still_path, TMDB_IMAGE_SIZES.backdrop.small);
    const isDisabled = isPending || (!isWatched && !hasAired);

    const handleWatchToggle = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (isWatched) {
        onMarkUnwatched();
      } else {
        onMarkWatched();
      }
    }, [isWatched, onMarkWatched, onMarkUnwatched]);

    return (
      <View style={styles.episodeCard}>
        {/* Wrap episode content in TouchableOpacity for navigation */}
        <TouchableOpacity activeOpacity={ACTIVE_OPACITY} onPress={onPress}>
          <View style={styles.episodeStillContainer}>
            {isWatched && (
              <View style={styles.watchedOverlay}>
                <Check size={24} color={COLORS.success} />
              </View>
            )}
            <MediaImage
              source={{ uri: stillUrl }}
              style={[styles.episodeStill, isWatched && styles.episodeStillWatched]}
              contentFit="cover"
            />
          </View>

          <View style={styles.episodeInfo}>
            <View style={styles.episodeHeader}>
              <Text style={styles.episodeNumber}>
                {t('media.episodeNumber', { number: episode.episode_number })}
              </Text>
              <View style={styles.ratingsContainer}>
                {/* User Rating */}
                {userRating > 0 && (
                  <View style={styles.episodeRating}>
                    <Star size={12} color={accentColor} fill={accentColor} />
                    <Text style={[styles.ratingText, { color: accentColor }]}>
                      {userRating.toFixed(1)}
                    </Text>
                  </View>
                )}
                {/* TMDB Rating */}
                {episode.vote_average > 0 && (
                  <View style={styles.episodeRating}>
                    <Star size={12} color={COLORS.warning} fill={COLORS.warning} />
                    <Text style={styles.ratingText}>{episode.vote_average.toFixed(1)}</Text>
                  </View>
                )}
              </View>
            </View>

            <Text style={styles.episodeTitle} numberOfLines={1}>
              {episode.name}
            </Text>

            <View style={styles.episodeMeta}>
              {episode.air_date && (
                <View style={styles.metaItem}>
                  <Calendar size={12} color={COLORS.textSecondary} />
                  <Text style={styles.metaText}>{formatDate(episode.air_date)}</Text>
                </View>
              )}
              {episode.runtime && (
                <Text style={styles.metaText}>• {t('common.minutesShort', { count: episode.runtime })}</Text>
              )}
            </View>

            {episode.overview && (
              <Text style={styles.episodeOverview} numberOfLines={3}>
                {episode.overview}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Watch button OUTSIDE TouchableOpacity to prevent navigation */}
        <TouchableOpacity
          style={[
            styles.watchButton,
            isWatched && styles.watchedButton,
            isDisabled && styles.disabledButton,
          ]}
          onPress={handleWatchToggle}
          disabled={isDisabled}
          activeOpacity={ACTIVE_OPACITY}
        >
          {isPending ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.watchButtonText}>
              {isWatched
                ? t('media.markAsUnwatched')
                : !hasAired
                  ? t('media.notYetAired')
                  : t('media.markAsWatched')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }
);

EpisodeItem.displayName = 'EpisodeItem';
