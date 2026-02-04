import {
  BaseReminderModal,
  DevModeBanner,
  EPISODE_TIMING_OPTIONS,
  ReminderActionButtons,
  ReminderErrorBanner,
  ReminderInfoBanner,
  ReminderTimingOptions,
  ReminderWarningBanner,
  SEASON_TIMING_OPTIONS,
  reminderModalStyles as sharedStyles,
} from '@/src/components/reminder';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { NextEpisodeInfo, ReminderTiming, TVReminderFrequency } from '@/src/types/reminder';
import { formatTmdbDate, parseTmdbDate } from '@/src/utils/dateUtils';
import {
  hasEpisodeChanged,
  isNotificationTimeInPast,
  isReleaseToday,
} from '@/src/utils/reminderHelpers';
import { Calendar, Tv } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface TVReminderModalProps {
  visible: boolean;
  onClose: () => void;
  tvTitle: string;
  /** The next unaired episode to use for reminders (may be subsequent episode if today's is airing) */
  nextEpisode: NextEpisodeInfo | null;
  /** The original next_episode_to_air (for display when using subsequent) */
  originalNextEpisode?: NextEpisodeInfo | null;
  /** Whether we're using a subsequent episode because today's is airing */
  isUsingSubsequentEpisode?: boolean;
  /** Whether we're currently loading the subsequent episode */
  isLoadingSubsequentEpisode?: boolean;
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

export default function TVReminderModal({
  visible,
  onClose,
  tvTitle,
  nextEpisode,
  originalNextEpisode,
  isUsingSubsequentEpisode = false,
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
  const { t } = useTranslation();
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

  // Get the relevant release date for the current selection
  const releaseDate = useMemo(() => {
    return selectedFrequency === 'every_episode' ? nextEpisode?.airDate : nextSeasonAirDate;
  }, [selectedFrequency, nextEpisode?.airDate, nextSeasonAirDate]);

  // Determine which timing options have notification times in the past
  const disabledTimings = useMemo(() => {
    if (!releaseDate) return new Set<ReminderTiming>();
    const disabled = new Set<ReminderTiming>();
    timingOptions.forEach((option) => {
      if (isNotificationTimeInPast(releaseDate, option.value)) {
        disabled.add(option.value);
      }
    });
    return disabled;
  }, [releaseDate, timingOptions]);

  const availableTimings = useMemo(() => {
    return timingOptions.filter((option) => !disabledTimings.has(option.value));
  }, [disabledTimings, timingOptions]);

  const allTimingsDisabled = availableTimings.length === 0;

  // Auto-select first available option if current selection is disabled
  useEffect(() => {
    if (disabledTimings.has(selectedTiming) && availableTimings.length > 0) {
      setSelectedTiming(availableTimings[0].value);
    }
  }, [disabledTimings, selectedTiming, availableTimings]);

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
      onShowToast?.(t('reminder.setSuccess'));
      onClose();
    } catch (error) {
      onShowToast?.(error instanceof Error ? error.message : t('reminder.failedToSet'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelReminder = async () => {
    try {
      setIsLoading(true);
      await onCancelReminder();
      onShowToast?.(t('reminder.reminderRemoved'));
      onClose();
    } catch (error) {
      onShowToast?.(error instanceof Error ? error.message : t('reminder.failedToCancel'));
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

  // Check if the currently selected frequency has a valid date
  const hasFrequencyDate =
    (selectedFrequency === 'every_episode' && canSetEpisodeReminder) ||
    (selectedFrequency === 'season_premiere' && canSetSeasonReminder);

  // Check if the release date is today (for context-aware messaging)
  const isReleasingToday = useMemo(() => {
    if (!releaseDate) return false;
    return isReleaseToday(releaseDate);
  }, [releaseDate]);

  // Determine if current selection is valid
  const canSetReminder = hasFrequencyDate && !allTimingsDisabled;

  // Check if the existing reminder's timing is now disabled/past
  const willSkipCurrentNotification = useMemo(() => {
    return hasReminder && currentTiming && disabledTimings.has(currentTiming);
  }, [hasReminder, currentTiming, disabledTimings]);

  // Get context-aware warning message for skip notification
  const getSkipWarningMessage = () => {
    if (selectedFrequency === 'every_episode') {
      return t('reminder.skipWarning.episode');
    }
    return t('reminder.skipWarning.season');
  };

  // Get the relevant date for display
  const displayDate =
    selectedFrequency === 'every_episode' ? nextEpisode?.airDate : nextSeasonAirDate;

  // Check if update is disabled (no changes made)
  const isUpdateDisabled =
    selectedTiming === currentTiming &&
    selectedFrequency === currentFrequency &&
    !hasEpisodeChanged(currentNextEpisode, nextEpisode);

  return (
    <BaseReminderModal visible={visible} onClose={onClose}>
      <DevModeBanner />

      {/* Show Title */}
      <View style={styles.titleRow}>
        <Tv size={18} color={COLORS.primary} />
        <Text style={styles.showTitle} numberOfLines={2}>
          {tvTitle}
        </Text>
      </View>

      {/* Frequency Selection */}
      <View style={sharedStyles.section}>
        <Text style={sharedStyles.sectionTitle}>{t('reminder.remindMeFor')}</Text>

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
              style={[styles.frequencyLabel, !canSetEpisodeReminder && sharedStyles.disabledText]}
            >
              {t('reminder.tvFrequency.everyEpisode')}
            </Text>
            {canSetEpisodeReminder && nextEpisode ? (
              <Text style={styles.frequencyDescription}>
                {t('reminder.nextEpisode', {
                  season: nextEpisode.seasonNumber,
                  episode: nextEpisode.episodeNumber,
                  title: nextEpisode.episodeName,
                })}
              </Text>
            ) : (
              <Text style={[styles.frequencyDescription, sharedStyles.warningText]}>
                {t('reminder.noUpcomingEpisodes')}
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
              style={[styles.frequencyLabel, !canSetSeasonReminder && sharedStyles.disabledText]}
            >
              {t('reminder.tvFrequency.seasonPremieres')}
            </Text>
            {canSetSeasonReminder && nextSeasonNumber ? (
              <Text style={styles.frequencyDescription}>
                {t('reminder.seasonPremieres', {
                  season: nextSeasonNumber,
                  date: formatDate(nextSeasonAirDate!),
                })}
              </Text>
            ) : (
              <Text style={[styles.frequencyDescription, sharedStyles.warningText]}>
                {t('reminder.noUpcomingSeasonPremiere')}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Date Display */}
      {displayDate && hasFrequencyDate && (
        <View style={sharedStyles.dateContainer}>
          <Calendar size={16} color={COLORS.textSecondary} />
          <Text style={sharedStyles.dateText}>
            {isDateInPast(displayDate) ? t('reminder.aired') : t('reminder.airs')}{' '}
            {formatDate(displayDate)}
          </Text>
        </View>
      )}

      {/* Info Banner for Using Subsequent Episode */}
      {isUsingSubsequentEpisode &&
        originalNextEpisode &&
        nextEpisode &&
        selectedFrequency === 'every_episode' && (
          <ReminderInfoBanner
            message={t('reminder.subsequentEpisodeInfo', {
              originalSeason: originalNextEpisode.seasonNumber,
              originalEpisode: originalNextEpisode.episodeNumber,
              season: nextEpisode.seasonNumber,
              episode: nextEpisode.episodeNumber,
            })}
          />
        )}

      {/* Warning Banner for Past Options */}
      {hasFrequencyDate && !allTimingsDisabled && disabledTimings.size > 0 && (
        <ReminderWarningBanner />
      )}

      {/* Timing Skip Warning */}
      {willSkipCurrentNotification && <ReminderInfoBanner message={getSkipWarningMessage()} />}

      {/* All Timings Disabled Warning */}
      {hasFrequencyDate && allTimingsDisabled && !isUsingSubsequentEpisode && (
        <ReminderErrorBanner
          message={
            isReleasingToday
              ? selectedFrequency === 'every_episode'
                ? t('reminder.todayEpisodePastTimes')
                : t('reminder.todaySeasonPremierePastTimes')
              : selectedFrequency === 'every_episode'
                ? t('reminder.allTimesPassedEpisode')
                : t('reminder.allTimesPassedPremiere')
          }
        />
      )}

      {/* Timing Options */}
      {hasFrequencyDate && (
        <View style={sharedStyles.section}>
          <Text style={sharedStyles.sectionTitle}>{t('reminder.notifyMe')}</Text>
          <ReminderTimingOptions
            options={timingOptions}
            selectedValue={selectedTiming}
            disabledValues={disabledTimings}
            onSelect={setSelectedTiming}
            disabled={isLoading}
          />
        </View>
      )}

      {/* No options available message */}
      {!canSetEpisodeReminder && !canSetSeasonReminder && (
        <View style={styles.noOptionsContainer}>
          <Text style={styles.noOptionsText}>
            {t('reminder.noUpcomingEpisodesOrSeasons')}
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      {(hasReminder || canSetReminder) && (
        <ReminderActionButtons
          hasReminder={hasReminder}
          isLoading={isLoading}
          canSet={canSetReminder}
          isUpdateDisabled={isUpdateDisabled}
          onSet={handleSetReminder}
          onCancel={handleCancelReminder}
        />
      )}
    </BaseReminderModal>
  );
}

const styles = StyleSheet.create({
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
