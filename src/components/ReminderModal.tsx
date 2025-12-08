import {
  DevModeBanner,
  MOVIE_TIMING_OPTIONS,
  ReminderErrorBanner,
  ReminderInfoBanner,
  ReminderTimingOptions,
  ReminderWarningBanner,
} from '@/src/components/reminder';
import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { ReminderTiming } from '@/src/types/reminder';
import { formatTmdbDate } from '@/src/utils/dateUtils';
import { isNotificationTimeInPast, isReleaseToday } from '@/src/utils/reminderHelpers';
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

interface ReminderModalProps {
  visible: boolean;
  onClose: () => void;
  movieId: number;
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

  // Check if the release date is today (for context-aware messaging)
  const isReleasingToday = useMemo(() => {
    if (!releaseDate) return false;
    return isReleaseToday(releaseDate);
  }, [releaseDate]);

  // Check if the selected timing is different from the current (for existing reminders)
  const willSkipCurrentNotification = useMemo(() => {
    // Only show info when updating an existing reminder with a different timing
    return hasReminder && selectedTiming !== currentTiming;
  }, [hasReminder, selectedTiming, currentTiming]);

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
            <Text style={styles.title}>Set Reminder</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <DevModeBanner />

            {/* Movie Title */}
            <Text style={styles.movieTitle} numberOfLines={2}>
              {movieTitle}
            </Text>

            {/* Release Date Display */}
            {releaseDate && (
              <View style={styles.releaseDateContainer}>
                <Calendar size={16} color={COLORS.textSecondary} />
                <Text style={styles.releaseDate}>Releases {formatReleaseDate(releaseDate)}</Text>
              </View>
            )}

            {/* Warning Banner for Past Options */}
            {!allOptionsDisabled && disabledTimings.size > 0 && <ReminderWarningBanner />}

            {/* Timing Skip Warning - shows when updating reminder to a past timing */}
            {willSkipCurrentNotification && (
              <ReminderInfoBanner message="This timing has already passed for the current release." />
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
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notify me:</Text>
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
            <View style={styles.actions}>
              {hasReminder ? (
                <>
                  <TouchableOpacity
                    style={[styles.button, styles.updateButton]}
                    onPress={handleSetReminder}
                    disabled={isLoading || selectedTiming === currentTiming}
                    activeOpacity={ACTIVE_OPACITY}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <Text style={styles.buttonText}>Update Reminder</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton]}
                    onPress={handleCancelReminder}
                    disabled={isLoading}
                    activeOpacity={ACTIVE_OPACITY}
                  >
                    <Text style={[styles.buttonText, styles.cancelButtonText]}>
                      Cancel Reminder
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.setButton,
                    allOptionsDisabled && styles.buttonDisabled,
                  ]}
                  onPress={handleSetReminder}
                  disabled={isLoading || allOptionsDisabled}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <Text style={styles.buttonText}>Set Reminder</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
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
  actions: {
    gap: SPACING.m,
  },
  button: {
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  setButton: {
    backgroundColor: COLORS.primary,
  },
  updateButton: {
    backgroundColor: COLORS.primary,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  buttonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.white,
  },
  cancelButtonText: {
    color: COLORS.error,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
