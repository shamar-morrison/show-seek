import {
  DevModeBanner,
  ReminderInfoBanner,
  ReminderTimingOptions,
  ReminderWarningBanner,
  TimingOption,
} from '@/src/components/reminder';
import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { Reminder, ReminderTiming } from '@/src/types/reminder';
import { formatTmdbDate } from '@/src/utils/dateUtils';
import { isNotificationTimeInPast } from '@/src/utils/reminderHelpers';
import { Calendar, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface EditTimingModalProps {
  visible: boolean;
  onClose: () => void;
  reminder: Reminder;
  onUpdateTiming: (reminderId: string, timing: ReminderTiming) => Promise<void>;
}

// Timing options for episodes (no "1 week before" - doesn't make sense for weekly releases)
const EPISODE_TIMING_OPTIONS: TimingOption[] = __DEV__
  ? [
      {
        value: 'on_release_day',
        label: 'Test in 10 seconds',
        description: 'DEV MODE: Notification in 10 seconds',
      },
      {
        value: '1_day_before',
        label: 'Test in 20 seconds',
        description: 'DEV MODE: Notification in 20 seconds',
      },
    ]
  : [
      {
        value: 'on_release_day',
        label: 'On Air Day',
        description: 'Get notified when the episode airs',
      },
      {
        value: '1_day_before',
        label: '1 Day Before',
        description: 'Get notified one day before the episode airs',
      },
    ];

// Timing options for movies and season premieres (all three options)
const FULL_TIMING_OPTIONS: TimingOption[] = __DEV__
  ? [
      {
        value: 'on_release_day',
        label: 'Test in 10 seconds',
        description: 'DEV MODE: Notification in 10 seconds',
      },
      {
        value: '1_day_before',
        label: 'Test in 20 seconds',
        description: 'DEV MODE: Notification in 20 seconds',
      },
      {
        value: '1_week_before',
        label: 'Test in 30 seconds',
        description: 'DEV MODE: Notification in 30 seconds',
      },
    ]
  : [
      {
        value: 'on_release_day',
        label: 'On Release Day',
        description: 'Get notified on the day of release',
      },
      {
        value: '1_day_before',
        label: '1 Day Before',
        description: 'Get notified one day before release',
      },
      {
        value: '1_week_before',
        label: '1 Week Before',
        description: 'Get notified one week before release',
      },
    ];

export default function EditTimingModal({
  visible,
  onClose,
  reminder,
  onUpdateTiming,
}: EditTimingModalProps) {
  const [selectedTiming, setSelectedTiming] = useState<ReminderTiming>(reminder.reminderTiming);
  const [isLoading, setIsLoading] = useState(false);

  // Determine which timing options to show based on reminder type
  const timingOptions = useMemo(() => {
    // For TV shows with "every_episode" frequency, don't show "1 week before"
    if (reminder.mediaType === 'tv' && reminder.tvFrequency === 'every_episode') {
      return EPISODE_TIMING_OPTIONS;
    }
    return FULL_TIMING_OPTIONS;
  }, [reminder.mediaType, reminder.tvFrequency]);

  // Determine which timing options have notification times in the past
  const disabledTimings = useMemo(() => {
    const disabled = new Set<ReminderTiming>();
    timingOptions.forEach((option) => {
      if (isNotificationTimeInPast(reminder.releaseDate, option.value)) {
        disabled.add(option.value);
      }
    });
    return disabled;
  }, [reminder.releaseDate, timingOptions]);

  // Get available (non-disabled) timing options
  const availableTimings = useMemo(() => {
    return timingOptions.filter((option) => !disabledTimings.has(option.value));
  }, [disabledTimings, timingOptions]);

  // Check if all options are disabled
  const allOptionsDisabled = availableTimings.length === 0;

  // Auto-select first available option if current selection is disabled
  useEffect(() => {
    if (disabledTimings.has(selectedTiming) && availableTimings.length > 0) {
      setSelectedTiming(availableTimings[0].value);
    }
  }, [disabledTimings, selectedTiming, availableTimings]);

  // Sync state when modal becomes visible or reminder changes
  useEffect(() => {
    if (visible) {
      setSelectedTiming(reminder.reminderTiming);
    }
  }, [visible, reminder.reminderTiming]);

  // Check if the selected timing would skip the current notification
  const willSkipCurrentNotification = useMemo(() => {
    // Only show warning if:
    // 1. The user is changing to a different timing
    // 2. The new timing is in the past (disabled)
    // When an option is disabled, selecting it means accepting that the current notification is skipped
    return selectedTiming !== reminder.reminderTiming && disabledTimings.has(selectedTiming);
  }, [selectedTiming, reminder.reminderTiming, disabledTimings]);

  const handleUpdateTiming = async () => {
    try {
      setIsLoading(true);
      await onUpdateTiming(reminder.id, selectedTiming);
      onClose();
    } catch (error) {
      console.error('Failed to update timing:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatReleaseDate = (date: string) => {
    return formatTmdbDate(date, { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const isUpdateDisabled = isLoading || selectedTiming === reminder.reminderTiming;

  // Get context-aware label for the release
  const getReleaseLabel = () => {
    if (reminder.mediaType === 'tv') {
      if (reminder.tvFrequency === 'every_episode') {
        return 'Next episode airs';
      }
      return 'Season premieres';
    }
    return 'Releases';
  };

  // Get context-aware warning message
  const getSkipWarningMessage = () => {
    if (reminder.mediaType === 'tv' && reminder.tvFrequency === 'every_episode') {
      return 'This timing has already passed for the current episode. Your change will apply starting from the next episode.';
    }
    if (reminder.mediaType === 'tv' && reminder.tvFrequency === 'season_premiere') {
      return 'This timing has already passed for the current season premiere. Your change will apply to future seasons.';
    }
    return 'This timing has already passed for the current release.';
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ModalBackground />
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={ACTIVE_OPACITY}
          onPress={onClose}
        />
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Edit Reminder Timing</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <DevModeBanner />

            {/* Movie/Show Title */}
            <Text style={styles.movieTitle} numberOfLines={2}>
              {reminder.title}
            </Text>

            {/* Release Date Display */}
            <View style={styles.releaseDateContainer}>
              <Calendar size={16} color={COLORS.textSecondary} />
              <Text style={styles.releaseDate}>
                {getReleaseLabel()} {formatReleaseDate(reminder.releaseDate)}
              </Text>
            </View>

            {/* Warning Banner for Past Options */}
            {!allOptionsDisabled && disabledTimings.size > 0 && <ReminderWarningBanner />}

            {/* Timing Skip Warning */}
            {willSkipCurrentNotification && (
              <ReminderInfoBanner message={getSkipWarningMessage()} />
            )}

            {/* Timing Options */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Notify me:</Text>
              <ReminderTimingOptions
                options={timingOptions}
                selectedValue={selectedTiming}
                disabledValues={disabledTimings}
                onSelect={setSelectedTiming}
                disabled={isLoading}
              />
            </View>

            {/* Update Button */}
            <TouchableOpacity
              style={[styles.button, isUpdateDisabled && styles.buttonDisabled]}
              onPress={handleUpdateTiming}
              disabled={isUpdateDisabled}
              activeOpacity={ACTIVE_OPACITY}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.buttonText}>Update Reminder</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.l,
  },
  content: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  title: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  movieTitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    marginBottom: SPACING.m,
    fontWeight: '600',
  },
  releaseDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    marginBottom: SPACING.l,
  },
  releaseDate: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  section: {
    marginBottom: SPACING.l,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.m,
  },
  button: {
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    backgroundColor: COLORS.primary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.white,
  },
});
