import type { TVShowDetails } from '@/src/api/tmdb';
import { detailStyles } from '@/src/components/detail/detailStyles';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { formatTmdbDate } from '@/src/utils/dateUtils';
import { getLanguageName } from '@/src/utils/languages';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Calendar, Globe, Layers, Star, Tv } from 'lucide-react-native';
import React, { memo, useCallback } from 'react';
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
  const handleTitleLongPress = useCallback(async () => {
    await Clipboard.setStringAsync(show.name);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onShowToast('Title copied to clipboard');
  }, [show.name, onShowToast]);

  return (
    <>
      <TouchableOpacity activeOpacity={1} onLongPress={handleTitleLongPress}>
        <Text style={detailStyles.title}>{show.name}</Text>
      </TouchableOpacity>

      <View style={detailStyles.metaContainer}>
        <View style={detailStyles.metaItem}>
          <Calendar size={14} color={COLORS.textSecondary} />
          <Text style={detailStyles.metaText}>
            {show.first_air_date
              ? formatTmdbDate(show.first_air_date, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Unknown'}
          </Text>
        </View>
        <TouchableOpacity
          style={detailStyles.metaItem}
          onPress={onSeasonsPress}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Layers size={14} color={COLORS.primary} />
          <Text style={[detailStyles.metaText, { color: COLORS.primary }]}>
            {show.number_of_seasons} Seasons
          </Text>
        </TouchableOpacity>
        <View style={detailStyles.metaItem}>
          <Tv size={14} color={COLORS.textSecondary} />
          <Text style={detailStyles.metaText}>{show.number_of_episodes} Episodes</Text>
        </View>
        <View style={detailStyles.metaItem}>
          <Star size={14} color={COLORS.warning} fill={COLORS.warning} />
          <Text style={[detailStyles.metaText, { color: COLORS.warning }]}>
            {show.vote_average.toFixed(1)}
          </Text>
        </View>
        {show.original_language !== 'en' && (
          <View style={detailStyles.metaItem}>
            <Globe size={14} color={COLORS.textSecondary} />
            <Text style={detailStyles.metaText}>{getLanguageName(show.original_language)}</Text>
          </View>
        )}
        {(show.status === 'Ended' || show.status === 'Canceled') && (
          <View style={detailStyles.statusBadge}>
            <Text style={detailStyles.statusBadgeText}>{show.status}</Text>
          </View>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -SPACING.l }}
        contentContainerStyle={{ paddingHorizontal: SPACING.l }}
      >
        <View style={detailStyles.genresContainer}>
          {show.genres.map((genre) => (
            <View key={genre.id} style={detailStyles.genreTag}>
              <Text style={detailStyles.genreText}>{genre.name}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </>
  );
});

TVMetaSection.displayName = 'TVMetaSection';
