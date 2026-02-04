import type { TVShowDetails } from '@/src/api/tmdb';
import { useDetailStyles } from '@/src/components/detail/detailStyles';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { formatTmdbDate } from '@/src/utils/dateUtils';
import { getLanguageName } from '@/src/utils/languages';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Calendar, Globe, Layers, Star, Tv } from 'lucide-react-native';
import React, { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

export interface TVMetaSectionProps {
  /** The TV show details */
  show: TVShowDetails;
  /** Handler for pressing the seasons link */
  onSeasonsPress: () => void;
  /** Handler for toast messages */
  onShowToast: (message: string) => void;
}

/**
 * Meta section for TV detail screen containing:
 * - Title with long-press to copy
 * - First air date
 * - Season count (tappable link)
 * - Episode count
 * - Rating
 * - Language (for non-English shows)
 * - Status badge (Ended/Canceled)
 * - Genre tags
 */
export const TVMetaSection = memo<TVMetaSectionProps>(({ show, onSeasonsPress, onShowToast }) => {
  const { t } = useTranslation();
  const styles = useDetailStyles();
  const { accentColor } = useAccentColor();

  const handleTitleLongPress = useCallback(async () => {
    await Clipboard.setStringAsync(show.name);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onShowToast(t('common.copiedToClipboard'));
  }, [show.name, onShowToast, t]);

  return (
    <>
      <TouchableOpacity activeOpacity={1} onLongPress={handleTitleLongPress}>
        <Text style={styles.title}>{show.name}</Text>
      </TouchableOpacity>

      <View style={styles.metaContainer}>
        <View style={styles.metaItem}>
          <Calendar size={14} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>
            {show.first_air_date
              ? formatTmdbDate(show.first_air_date, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : t('media.unknown')}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.metaItem}
          onPress={onSeasonsPress}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Layers size={14} color={accentColor} />
          <Text style={[styles.metaText, { color: accentColor }]}>
            {t('media.numberOfSeasons', { count: show.number_of_seasons })}
          </Text>
        </TouchableOpacity>
        <View style={styles.metaItem}>
          <Tv size={14} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>{t('media.numberOfEpisodes', { count: show.number_of_episodes })}</Text>
        </View>
        <View style={styles.metaItem}>
          <Star size={14} color={COLORS.warning} fill={COLORS.warning} />
          <Text style={[styles.metaText, { color: COLORS.warning }]}>
            {show.vote_average.toFixed(1)}
          </Text>
        </View>
        {show.original_language !== 'en' && (
          <View style={styles.metaItem}>
            <Globe size={14} color={COLORS.textSecondary} />
            <Text style={styles.metaText}>{getLanguageName(show.original_language)}</Text>
          </View>
        )}
        {(show.status === 'Ended' || show.status === 'Canceled') && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>{show.status}</Text>
          </View>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -SPACING.l }}
        contentContainerStyle={{ paddingHorizontal: SPACING.l }}
      >
        <View style={styles.genresContainer}>
          {show.genres.map((genre) => (
            <View key={genre.id} style={styles.genreTag}>
              <Text style={styles.genreText}>{genre.name}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </>
  );
});

TVMetaSection.displayName = 'TVMetaSection';
