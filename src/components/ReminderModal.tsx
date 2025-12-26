import {
  BaseReminderModal,
  DevModeBanner,
  MOVIE_TIMING_OPTIONS,
  ReminderActionButtons,
  ReminderErrorBanner,
  ReminderInfoBanner,
  ReminderTimingOptions,
  ReminderWarningBanner,
  reminderModalStyles as sharedStyles,
} from '@/src/components/reminder';
import { COLORS } from '@/src/constants/theme';
import { ReminderTiming } from '@/src/types/reminder';
import { formatTmdbDate } from '@/src/utils/dateUtils';
import { isNotificationTimeInPast, isReleaseToday } from '@/src/utils/reminderHelpers';
import { Calendar } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

interface ReminderModalProps {
  visible: boolean;
  onClose: () => void;
  movieTitle: string;
  releaseDate: string | null;
  currentTiming?: ReminderTiming;
  hasReminder?: boolean;
  onSetReminder: (timing: ReminderTiming) => Promise<void>;
  onCancelReminder: () => Promise<void>;
  onShowToast?: (message: string) => void;
}

export default function ReminderModal({
  visible,
  onClose,
  movieTitle,
  releaseDate,
  currentTiming,
  hasReminder = false,
  onSetReminder,
  onCancelReminder,
  onShowToast,
}: ReminderModalProps) {
  const [selectedTiming, setSelectedTiming] = useState<ReminderTiming>(
    currentTiming || 'on_release_day'
  );
  const [isLoading, setIsLoading] = useState(false);

  const disabledTimings = useMemo(() => {
    if (!releaseDate) return new Set<ReminderTiming>();
    const disabled = new Set<ReminderTiming>();
    MOVIE_TIMING_OPTIONS.forEach((option) => {
      if (isNotificationTimeInPast(releaseDate, option.value)) {
        disabled.add(option.value);
      }
    });
    return disabled;
  }, [releaseDate]);

  const availableTimings = useMemo(() => {
    return MOVIE_TIMING_OPTIONS.filter((option) => !disabledTimings.has(option.value));
  }, [disabledTimings]);

  const allOptionsDisabled = availableTimings.length === 0;

  // Auto-select first available option if current selection is disabled
  useEffect(() => {
    if (disabledTimings.has(selectedTiming) && availableTimings.length > 0) {
      setSelectedTiming(availableTimings[0].value);
    }
  }, [disabledTimings, selectedTiming, availableTimings]);

  const isReleasingToday = useMemo(() => {
    if (!releaseDate) return false;
    return isReleaseToday(releaseDate);
  }, [releaseDate]);

  const willSkipCurrentNotification = useMemo(() => {
    return hasReminder && currentTiming && disabledTimings.has(currentTiming);
  }, [hasReminder, currentTiming, disabledTimings]);

  const handleSetReminder = async () => {
    try {
      setIsLoading(true);
      await onSetReminder(selectedTiming);
      onShowToast?.('Reminder set successfully!');
      onClose();
    } catch (error) {
      onShowToast?.(error instanceof Error ? error.message : 'Failed to set reminder');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelReminder = async () => {
    try {
      setIsLoading(true);
      await onCancelReminder();
      onShowToast?.('Reminder cancelled');
      onClose();
    } catch (error) {
      onShowToast?.(error instanceof Error ? error.message : 'Failed to cancel reminder');
    } finally {
      setIsLoading(false);
    }
  };

  const formatReleaseDate = (date: string) => {
    return formatTmdbDate(date, { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <BaseReminderModal visible={visible} onClose={onClose}>
      <DevModeBanner />

      {/* Movie Title */}
      <Text style={sharedStyles.mediaTitle} numberOfLines={2}>
        {movieTitle}
      </Text>

      {/* Release Date Display */}
      {releaseDate && (
        <View style={sharedStyles.dateContainer}>
          <Calendar size={16} color={COLORS.textSecondary} />
          <Text style={sharedStyles.dateText}>Releases {formatReleaseDate(releaseDate)}</Text>
        </View>
      )}

      {/* Warning Banner for Past Options */}
      {!allOptionsDisabled && disabledTimings.size > 0 && <ReminderWarningBanner />}

      {/* Timing Change Info */}
      {willSkipCurrentNotification && (
        <ReminderInfoBanner message="Changing the timing will reschedule your notification." />
      )}

      {/* All Options Disabled Warning */}
      {allOptionsDisabled && (
        <ReminderErrorBanner
          message={
            isReleasingToday
              ? 'This movie releases today! Notification times have already passed.'
              : 'All notification times for this release have passed. You cannot set a reminder for this movie.'
          }
        />
      )}

      {/* Timing Options */}
      {!allOptionsDisabled && (
        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionTitle}>Notify me:</Text>
          <ReminderTimingOptions
            options={MOVIE_TIMING_OPTIONS}
            selectedValue={selectedTiming}
            disabledValues={disabledTimings}
            onSelect={setSelectedTiming}
            disabled={isLoading}
          />
        </View>
      )}

      {/* Action Buttons */}
      <ReminderActionButtons
        hasReminder={hasReminder}
        isLoading={isLoading}
        canSet={!allOptionsDisabled}
        isUpdateDisabled={selectedTiming === currentTiming}
        onSet={handleSetReminder}
        onCancel={handleCancelReminder}
      />
    </BaseReminderModal>
  );
}
