import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { BORDER_RADIUS, COLORS, FONT_SIZE, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useCurrentTab } from '@/src/context/TabContext';
import i18n from '@/src/i18n';
import { listCardStyles } from '@/src/styles/listCardStyles';
import { Reminder, ReminderTiming } from '@/src/types/reminder';
import { formatTmdbDate } from '@/src/utils/dateUtils';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Calendar, Pencil, Trash2 } from 'lucide-react-native';
import React, { memo, useCallback } from 'react';
import type { TFunction } from 'i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';

interface ReminderCardProps {
  reminder: Reminder;
  onEditTiming: (reminder: Reminder) => void;
  onCancel: (reminderId: string) => void;
  isLoading?: boolean;
  t: TFunction;
}

const getTimingLabelKey = (reminder: Reminder): string => {
  const timing = reminder.reminderTiming;

  if (reminder.mediaType === 'movie') {
    switch (timing) {
      case 'on_release_day':
        return 'reminder.timingOptions.movie.onReleaseDay.label';
      case '1_day_before':
        return 'reminder.timingOptions.movie.oneDayBefore.label';
      case '1_week_before':
        return 'reminder.timingOptions.movie.oneWeekBefore.label';
    }
  }

  const frequency = reminder.tvFrequency ?? 'season_premiere';

  if (frequency === 'every_episode') {
    switch (timing) {
      case 'on_release_day':
        return 'reminder.timingOptions.episode.onAirDay.label';
      case '1_day_before':
        return 'reminder.timingOptions.episode.oneDayBefore.label';
      case '1_week_before':
        // Shouldn't happen for episode-level reminders, but handle gracefully.
        return 'reminder.timingOptions.movie.oneWeekBefore.label';
    }
  }

  // season_premiere
  switch (timing) {
    case 'on_release_day':
      return 'reminder.timingOptions.season.onPremiereDay.label';
    case '1_day_before':
      return 'reminder.timingOptions.season.oneDayBefore.label';
    case '1_week_before':
      return 'reminder.timingOptions.season.oneWeekBefore.label';
  }
};

const getTimingColor = (timing: ReminderTiming, accentColor: string): string => {
  switch (timing) {
    case 'on_release_day':
      return COLORS.warning; // Orange
    case '1_day_before':
      return accentColor; // Accent
    case '1_week_before':
      return '#4FC3F7'; // Light blue
  }
};

const formatReleaseDate = (date: string): string => {
  return formatTmdbDate(date, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatNotificationTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(i18n.language, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const ReminderCard = memo<ReminderCardProps>(
  ({ reminder, onEditTiming, onCancel, isLoading = false, t }) => {
    const router = useRouter();
    const currentTab = useCurrentTab();
    const { accentColor } = useAccentColor();

    const handlePress = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (!currentTab) {
        console.warn('Cannot navigate: currentTab is null');
        return;
      }

      const mediaPath = reminder.mediaType === 'movie' ? 'movie' : 'tv';
      const path = `/(tabs)/${currentTab}/${mediaPath}/${reminder.mediaId}`;
      router.push(path as any);
    }, [currentTab, reminder.mediaId, reminder.mediaType, router]);

    const handleEdit = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onEditTiming(reminder);
    }, [onEditTiming, reminder]);

    const handleCancel = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onCancel(reminder.id);
    }, [onCancel, reminder.id]);

    return (
      <Pressable
        style={({ pressed }) => [
          listCardStyles.container,
          pressed && listCardStyles.containerPressed,
        ]}
        onPress={handlePress}
        disabled={isLoading}
      >
        <MediaImage
          source={{ uri: getImageUrl(reminder.posterPath, TMDB_IMAGE_SIZES.poster.small) }}
          style={listCardStyles.poster}
          contentFit="cover"
        />
        <View style={listCardStyles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {reminder.title}
          </Text>
          <View style={styles.row}>
            <Calendar size={14} color={COLORS.textSecondary} />
            <Text style={styles.releaseDate}>
              {t('media.releasesOn', { date: formatReleaseDate(reminder.releaseDate) })}
            </Text>
          </View>
          <View style={styles.timingRow}>
            <View
              style={[
                styles.timingBadge,
                { backgroundColor: getTimingColor(reminder.reminderTiming, accentColor) + '20' },
              ]}
            >
              <Text
                style={[
                  styles.timingText,
                  { color: getTimingColor(reminder.reminderTiming, accentColor) },
                ]}
              >
                {t(getTimingLabelKey(reminder))}
              </Text>
            </View>
          </View>
          {Date.now() > reminder.notificationScheduledFor ? (
            // Show different status based on whether this is an every_episode reminder with no next episode
            reminder.noNextEpisodeFound && reminder.tvFrequency === 'every_episode' ? (
              <Text style={[styles.notificationTime, { color: COLORS.warning, fontWeight: '600' }]}>
                {t('reminder.noUpcomingEpisodes')}
              </Text>
            ) : (
              <Text style={[styles.notificationTime, { color: COLORS.success, fontWeight: '600' }]}>
                {t('reminder.released')}
              </Text>
            )
          ) : (
            <Text style={styles.notificationTime}>
              {t('reminder.notify')} {formatNotificationTime(reminder.notificationScheduledFor)}
            </Text>
          )}
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={handleEdit}
            disabled={isLoading}
            style={styles.actionButton}
            hitSlop={HIT_SLOP.m}
          >
            <Pencil size={20} color={COLORS.text} />
          </Pressable>
          <Pressable
            onPress={handleCancel}
            disabled={isLoading}
            style={styles.actionButton}
            hitSlop={HIT_SLOP.m}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.error} />
            ) : (
              <Trash2 size={20} color={COLORS.error} />
            )}
          </Pressable>
        </View>
      </Pressable>
    );
  }
);

ReminderCard.displayName = 'ReminderCard';

const styles = StyleSheet.create({
  title: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  releaseDate: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  timingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timingBadge: {
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs / 2,
    borderRadius: BORDER_RADIUS.s,
  },
  timingText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
  notificationTime: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: 'column',
    gap: SPACING.m,
  },
  actionButton: {
    padding: SPACING.xs,
  },
});
