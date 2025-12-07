import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { NextEpisodeInfo, ReminderTiming, TVReminderFrequency } from '@/src/types/reminder';
import { formatTmdbDate, parseTmdbDate } from '@/src/utils/dateUtils';
import { hasEpisodeChanged } from '@/src/utils/reminderHelpers';
import { BlurView } from 'expo-blur';
import { Calendar, Tv, X } from 'lucide-react-native';
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

interface TVReminderModalProps {
  visible: boolean;
  onClose: () => void;
  tvId: number;
  tvTitle: string;
  /** The next unaired episode (if any) */
  nextEpisode: NextEpisodeInfo | null;
  /** The next season premiere date (if known) */
  nextSeasonAirDate: string | null;
  nextSeasonNumber: number | null;
  currentTiming?: ReminderTiming;
  currentFrequency?: TVReminderFrequency;
  /** The episode info stored in the existing reminder (for detecting episode changes) */
  currentNextEpisode?: NextEpisodeInfo | null;
  hasReminder?: boolean;
  onSetReminder: (
    timing: ReminderTiming,
    frequency: TVReminderFrequency,
    nextEpisode: NextEpisodeInfo | null
  ) => Promise<void>;
  onCancelReminder: () => Promise<void>;
  onShowToast?: (message: string) => void;
}

// Timing options for episodes (1 day before or on air day only)
const EPISODE_TIMING_OPTIONS: { value: ReminderTiming; label: string; description: string }[] =
  __DEV__
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

// Timing options for seasons (all three options)
const SEASON_TIMING_OPTIONS: { value: ReminderTiming; label: string; description: string }[] =
  __DEV__
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
          label: 'On Premiere Day',
          description: 'Get notified when the season premieres',
        },
        {
          value: '1_day_before',
          label: '1 Day Before',
          description: 'Get notified one day before premiere',
        },
        {
          value: '1_week_before',
          label: '1 Week Before',
          description: 'Get notified one week before premiere',
        },
      ];

export default function TVReminderModal({
  visible,
  onClose,
  tvTitle,
  nextEpisode,
  nextSeasonAirDate,
  nextSeasonNumber,
  currentTiming,
  currentFrequency,
  currentNextEpisode,
  hasReminder = false,
  onSetReminder,
  onCancelReminder,
  onShowToast,
}: TVReminderModalProps) {
  const [selectedFrequency, setSelectedFrequency] = useState<TVReminderFrequency>(
    currentFrequency || 'every_episode'
  );
  const [selectedTiming, setSelectedTiming] = useState<ReminderTiming>(
    currentTiming || 'on_release_day'
  );
  const [isLoading, setIsLoading] = useState(false);

  // Sync state when modal becomes visible or props change
  useEffect(() => {
    if (visible) {
      setSelectedFrequency(currentFrequency || 'every_episode');
      setSelectedTiming(currentTiming || 'on_release_day');
    }
  }, [visible, currentFrequency, currentTiming]);

  const canSetEpisodeReminder = !!nextEpisode?.airDate;
  const canSetSeasonReminder = !!nextSeasonAirDate;

  const timingOptions = useMemo(() => {
    return selectedFrequency === 'every_episode' ? EPISODE_TIMING_OPTIONS : SEASON_TIMING_OPTIONS;
  }, [selectedFrequency]);

  const handleFrequencyChange = (freq: TVReminderFrequency) => {
    setSelectedFrequency(freq);
    // If switching from season to episode, ensure timing is valid for episodes
    if (freq === 'every_episode' && selectedTiming === '1_week_before') {
      setSelectedTiming('on_release_day');
    }
  };

  const handleSetReminder = async () => {
    try {
      setIsLoading(true);
      await onSetReminder(selectedTiming, selectedFrequency, nextEpisode);
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

  const formatDate = (date: string) => {
    return formatTmdbDate(date, { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const isDateInPast = (date: string) => {
    if (__DEV__) return false;
    const d = parseTmdbDate(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  };

  // Determine if current selection is valid
  const canSetReminder =
    (selectedFrequency === 'every_episode' && canSetEpisodeReminder) ||
    (selectedFrequency === 'season_premiere' && canSetSeasonReminder);

  // Get the relevant date for display
  const displayDate =
    selectedFrequency === 'every_episode' ? nextEpisode?.airDate : nextSeasonAirDate;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
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

            {/* Show Title */}
            <View style={styles.titleRow}>
              <Tv size={18} color={COLORS.primary} />
              <Text style={styles.showTitle} numberOfLines={2}>
                {tvTitle}
              </Text>
            </View>

            {/* Frequency Selection */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Remind me for:</Text>

              {/* Every Episode Option */}
              <TouchableOpacity
                style={[
                  styles.frequencyOption,
                  selectedFrequency === 'every_episode' && styles.frequencyOptionSelected,
                  !canSetEpisodeReminder && styles.frequencyOptionDisabled,
                ]}
                onPress={() => canSetEpisodeReminder && handleFrequencyChange('every_episode')}
                disabled={!canSetEpisodeReminder || isLoading}
                activeOpacity={ACTIVE_OPACITY}
              >
                <View style={styles.radioOuter}>
                  {selectedFrequency === 'every_episode' && <View style={styles.radioInner} />}
                </View>
                <View style={styles.frequencyTextContainer}>
                  <Text
                    style={[styles.frequencyLabel, !canSetEpisodeReminder && styles.disabledText]}
                  >
                    Every Episode
                  </Text>
                  {canSetEpisodeReminder && nextEpisode ? (
                    <Text style={styles.frequencyDescription}>
                      Next: S{nextEpisode.seasonNumber}E{nextEpisode.episodeNumber} -{' '}
                      {nextEpisode.episodeName}
                    </Text>
                  ) : (
                    <Text style={[styles.frequencyDescription, styles.warningText]}>
                      No upcoming episodes found
                    </Text>
                  )}
                </View>
              </TouchableOpacity>

              {/* Season Premiere Option */}
              <TouchableOpacity
                style={[
                  styles.frequencyOption,
                  selectedFrequency === 'season_premiere' && styles.frequencyOptionSelected,
                  !canSetSeasonReminder && styles.frequencyOptionDisabled,
                ]}
                onPress={() => canSetSeasonReminder && handleFrequencyChange('season_premiere')}
                disabled={!canSetSeasonReminder || isLoading}
                activeOpacity={ACTIVE_OPACITY}
              >
                <View style={styles.radioOuter}>
                  {selectedFrequency === 'season_premiere' && <View style={styles.radioInner} />}
                </View>
                <View style={styles.frequencyTextContainer}>
                  <Text
                    style={[styles.frequencyLabel, !canSetSeasonReminder && styles.disabledText]}
                  >
                    Season Premieres
                  </Text>
                  {canSetSeasonReminder && nextSeasonNumber ? (
                    <Text style={styles.frequencyDescription}>
                      Season {nextSeasonNumber} premieres {formatDate(nextSeasonAirDate!)}
                    </Text>
                  ) : (
                    <Text style={[styles.frequencyDescription, styles.warningText]}>
                      No upcoming season premiere date announced
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* Date Display */}
            {displayDate && canSetReminder && (
              <View style={styles.dateContainer}>
                <Calendar size={16} color={COLORS.textSecondary} />
                <Text style={styles.dateText}>
                  {isDateInPast(displayDate) ? 'Aired' : 'Airs'} {formatDate(displayDate)}
                </Text>
              </View>
            )}

            {/* Timing Options */}
            {canSetReminder && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notify me:</Text>
                {timingOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.timingOption,
                      selectedTiming === option.value && styles.timingOptionSelected,
                    ]}
                    onPress={() => setSelectedTiming(option.value)}
                    disabled={isLoading}
                    activeOpacity={ACTIVE_OPACITY}
                  >
                    <View style={styles.radioOuter}>
                      {selectedTiming === option.value && <View style={styles.radioInner} />}
                    </View>
                    <View style={styles.timingTextContainer}>
                      <Text style={styles.timingLabel}>{option.label}</Text>
                      <Text style={styles.timingDescription}>{option.description}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* No options available message */}
            {!canSetEpisodeReminder && !canSetSeasonReminder && (
              <View style={styles.noOptionsContainer}>
                <Text style={styles.noOptionsText}>
                  No upcoming episodes or season premieres with announced dates. Check back later!
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            {canSetReminder && (
              <View style={styles.actions}>
                {hasReminder ? (
                  <>
                    <TouchableOpacity
                      style={[styles.button, styles.updateButton]}
                      onPress={handleSetReminder}
                      disabled={
                        isLoading ||
                        (selectedTiming === currentTiming &&
                          selectedFrequency === currentFrequency &&
                          !hasEpisodeChanged(currentNextEpisode, nextEpisode))
                      }
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
                    style={[styles.button, styles.setButton]}
                    onPress={handleSetReminder}
                    disabled={isLoading}
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
            )}
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
    maxHeight: '85%',
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    marginBottom: SPACING.l,
  },
  showTitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '600',
    flex: 1,
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
  frequencyOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: SPACING.m,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.s,
    gap: SPACING.m,
  },
  frequencyOptionSelected: {
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  frequencyOptionDisabled: {
    opacity: 0.5,
  },
  frequencyTextContainer: {
    flex: 1,
  },
  frequencyLabel: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '500',
  },
  frequencyDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    marginBottom: SPACING.l,
  },
  dateText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
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
    marginTop: SPACING.s,
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
  disabledText: {
    color: COLORS.textSecondary,
  },
  warningText: {
    color: COLORS.warning,
  },
  noOptionsContainer: {
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.l,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.l,
  },
  noOptionsText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
