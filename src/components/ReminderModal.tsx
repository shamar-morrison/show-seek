import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { ReminderTiming } from '@/src/types/reminder';
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

const TIMING_OPTIONS: { value: ReminderTiming; label: string; description: string }[] = __DEV__
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

  // Determine which timing options have notification times in the past
  const disabledTimings = useMemo(() => {
    if (!releaseDate) return new Set<ReminderTiming>();
    const disabled = new Set<ReminderTiming>();
    TIMING_OPTIONS.forEach((option) => {
      if (isNotificationTimeInPast(releaseDate, option.value)) {
        disabled.add(option.value);
      }
    });
    return disabled;
  }, [releaseDate]);

  // Get available (non-disabled) timing options
  const availableTimings = useMemo(() => {
    return TIMING_OPTIONS.filter((option) => !disabledTimings.has(option.value));
  }, [disabledTimings]);

  // Check if all options are disabled
  const allOptionsDisabled = availableTimings.length === 0;

  // Auto-select first available option if current selection is disabled
  useEffect(() => {
    if (disabledTimings.has(selectedTiming) && availableTimings.length > 0) {
      setSelectedTiming(availableTimings[0].value);
    }
  }, [disabledTimings, selectedTiming, availableTimings]);

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
            {/* Dev Mode Banner */}
            {__DEV__ && (
              <View style={styles.devBanner}>
                <Text style={styles.devBannerText}>
                  🧪 DEV MODE: Notifications scheduled for 10-30 seconds
                </Text>
              </View>
            )}

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
            {!allOptionsDisabled && disabledTimings.size > 0 && (
              <View style={styles.warningBanner}>
                <Text style={styles.warningBannerText}>
                  ⚠️ Some notification times have already passed
                </Text>
              </View>
            )}

            {/* All Options Disabled Warning */}
            {allOptionsDisabled && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>
                  All notification times for this release have passed. You cannot set a reminder for
                  this movie.
                </Text>
              </View>
            )}

            {/* Timing Options */}
            {!allOptionsDisabled && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notify me:</Text>
                {TIMING_OPTIONS.map((option) => {
                  const isDisabled = disabledTimings.has(option.value);
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.timingOption,
                        selectedTiming === option.value && styles.timingOptionSelected,
                        isDisabled && styles.timingOptionDisabled,
                      ]}
                      onPress={() => !isDisabled && setSelectedTiming(option.value)}
                      disabled={isLoading || isDisabled}
                      activeOpacity={ACTIVE_OPACITY}
                    >
                      <View style={[styles.radioOuter, isDisabled && styles.radioOuterDisabled]}>
                        {selectedTiming === option.value && !isDisabled && (
                          <View style={styles.radioInner} />
                        )}
                      </View>
                      <View style={styles.timingTextContainer}>
                        <Text style={[styles.timingLabel, isDisabled && styles.textDisabled]}>
                          {option.label}
                        </Text>
                        <Text style={[styles.timingDescription, isDisabled && styles.textDisabled]}>
                          {isDisabled ? 'Notification time has passed' : option.description}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
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
  warningContainer: {
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.l,
  },
  warningText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.warning,
    textAlign: 'center',
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
  timingOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.m,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.s,
    gap: SPACING.m,
  },
  timingOptionSelected: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.text,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  timingTextContainer: {
    flex: 1,
  },
  timingLabel: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '500',
  },
  timingDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
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
  devBanner: {
    backgroundColor: COLORS.warning,
    padding: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
  },
  devBannerText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.background,
    textAlign: 'center',
    fontWeight: '600',
  },
  warningBanner: {
    backgroundColor: COLORS.warning + '20',
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  warningBannerText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.warning,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: COLORS.error + '20',
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  errorBannerText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.error,
    textAlign: 'center',
  },
  timingOptionDisabled: {
    opacity: 0.5,
  },
  radioOuterDisabled: {
    borderColor: COLORS.textSecondary,
  },
  textDisabled: {
    color: COLORS.textSecondary,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
