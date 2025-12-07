import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { Reminder, ReminderTiming } from '@/src/types/reminder';
import { formatTmdbDate } from '@/src/utils/dateUtils';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Calendar, Pencil, Trash2 } from 'lucide-react-native';
import React, { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MediaImage } from '../ui/MediaImage';

interface ReminderCardProps {
  reminder: Reminder;
  onEditTiming: (reminder: Reminder) => void;
  onCancel: (reminderId: string) => void;
  isLoading?: boolean;
}

const getTimingLabel = (timing: ReminderTiming): string => {
  switch (timing) {
    case 'on_release_day':
      return 'On Release Day';
    case '1_day_before':
      return '1 Day Before';
    case '1_week_before':
      return '1 Week Before';
  }
};

const getTimingColor = (timing: ReminderTiming): string => {
  switch (timing) {
    case 'on_release_day':
      return COLORS.warning; // Orange
    case '1_day_before':
      return COLORS.primary; // Red
    case '1_week_before':
      return '#4FC3F7'; // Light blue
  }
};

const formatReleaseDate = (date: string): string => {
  return formatTmdbDate(date, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatNotificationTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const ReminderCard = memo<ReminderCardProps>(
  ({ reminder, onEditTiming, onCancel, isLoading = false }) => {
    const router = useRouter();
    const currentTab = useCurrentTab();

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
        style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
        onPress={handlePress}
        disabled={isLoading}
      >
        <MediaImage
          source={{ uri: getImageUrl(reminder.posterPath, TMDB_IMAGE_SIZES.poster.small) }}
          style={styles.poster}
          contentFit="cover"
        />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {reminder.title}
          </Text>
          <View style={styles.row}>
            <Calendar size={14} color={COLORS.textSecondary} />
            <Text style={styles.releaseDate}>
              Releases {formatReleaseDate(reminder.releaseDate)}
            </Text>
          </View>
          <View style={styles.timingRow}>
            <View
              style={[
                styles.timingBadge,
                { backgroundColor: getTimingColor(reminder.reminderTiming) + '20' },
              ]}
            >
              <Text style={[styles.timingText, { color: getTimingColor(reminder.reminderTiming) }]}>
                {getTimingLabel(reminder.reminderTiming)}
              </Text>
            </View>
          </View>
          <Text style={styles.notificationTime}>
            Notify: {formatNotificationTime(reminder.notificationScheduledFor)}
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={handleEdit}
            disabled={isLoading}
            style={styles.actionButton}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Pencil size={20} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleCancel}
            disabled={isLoading}
            style={styles.actionButton}
            activeOpacity={ACTIVE_OPACITY}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.error} />
            ) : (
              <Trash2 size={20} color={COLORS.error} />
            )}
          </TouchableOpacity>
        </View>
      </Pressable>
    );
  }
);

ReminderCard.displayName = 'ReminderCard';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    padding: SPACING.s,
    gap: SPACING.m,
  },
  containerPressed: {
    opacity: ACTIVE_OPACITY,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: BORDER_RADIUS.s,
    backgroundColor: COLORS.surfaceLight,
  },
  info: {
    flex: 1,
    gap: SPACING.xs,
  },
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
