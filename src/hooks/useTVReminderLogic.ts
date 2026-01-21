import type { TVShowDetails } from '@/src/api/tmdb';
import type {
  NextEpisodeInfo,
  Reminder,
  ReminderTiming,
  TVReminderFrequency,
} from '@/src/types/reminder';
import { hasEpisodeChanged, isReleaseToday } from '@/src/utils/reminderHelpers';
import { getNextUpcomingSeason } from '@/src/utils/seasonHelpers';
import { getSubsequentEpisode } from '@/src/utils/subsequentEpisodeHelpers';
import { useQuery, type UseMutationResult } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

export interface UseTVReminderLogicOptions {
  tvId: number;
  tvShowData: TVShowDetails | undefined;
  reminder: Reminder | undefined;
  hasReminder: boolean;
  createReminderMutation: UseMutationResult<any, Error, any, unknown>;
  cancelReminderMutation: UseMutationResult<any, Error, string, unknown>;
  updateReminderMutation: UseMutationResult<any, Error, any, unknown>;
  requestPermission: () => Promise<boolean>;
  onToast: (message: string) => void;
}

export interface UseTVReminderLogicReturn {
  /** The next episode info computed from the show data */
  nextEpisodeInfo: NextEpisodeInfo | null;
  /** The effective next episode (may be subsequent if today's airing) */
  effectiveNextEpisode: NextEpisodeInfo | null;
  /** Original next episode info (before subsequent override) */
  originalNextEpisode: NextEpisodeInfo | null;
  /** Next season air date if available */
  nextSeasonAirDate: string | null;
  /** Next season number if available */
  nextSeasonNumber: number | null;
  /** Whether we're using the subsequent episode instead of current */
  isUsingSubsequent: boolean;
  /** Whether subsequent episode is loading */
  isLoadingSubsequent: boolean;
  /** Handler to set a reminder */
  handleSetReminder: (
    timing: ReminderTiming,
    frequency: TVReminderFrequency,
    nextEpisode: NextEpisodeInfo | null
  ) => Promise<void>;
  /** Handler to cancel a reminder */
  handleCancelReminder: () => Promise<void>;
}

/**
 * Hook that encapsulates all TV show reminder logic including:
 * - Computing next episode info
 * - Handling subsequent episodes for same-day releases
 * - Computing next season info
 * - Setting and canceling reminders
 */
export function useTVReminderLogic({
  tvId,
  tvShowData,
  reminder,
  hasReminder,
  createReminderMutation,
  cancelReminderMutation,
  updateReminderMutation,
  requestPermission,
  onToast,
}: UseTVReminderLogicOptions): UseTVReminderLogicReturn {
  // Compute next episode info for reminders
  const nextEpisodeInfo = useMemo((): NextEpisodeInfo | null => {
    const show = tvShowData;

    // If we have next_episode_to_air, use it
    if (show?.next_episode_to_air?.air_date) {
      return {
        seasonNumber: show.next_episode_to_air.season_number,
        episodeNumber: show.next_episode_to_air.episode_number,
        episodeName: show.next_episode_to_air.name || 'TBA',
        airDate: show.next_episode_to_air.air_date,
      };
    }

    // Fallback: Use first_air_date for series premiere (S1E1)
    // Only when: show is in pre-air status OR first_air_date is in the future
    if (show?.first_air_date) {
      const preAirStatuses = ['Planned', 'Pilot', 'In Production'];
      const isPreAirStatus = preAirStatuses.includes(show.status || '');

      // Check if first_air_date is today or in the future
      const firstAirDate = new Date(show.first_air_date + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isFirstAirDateFuture = firstAirDate >= today;

      if (isPreAirStatus || isFirstAirDateFuture) {
        return {
          seasonNumber: 1,
          episodeNumber: 1,
          episodeName: 'Series Premiere',
          airDate: show.first_air_date,
        };
      }
    }

    return null;
  }, [tvShowData]);

  // Compute next season premiere date
  const { nextSeasonAirDate, nextSeasonNumber } = useMemo(() => {
    return getNextUpcomingSeason(tvShowData?.seasons);
  }, [tvShowData]);

  // Fetch subsequent episode when current next episode airs today
  const subsequentEpisodeQuery = useQuery({
    queryKey: [
      'tv',
      tvId,
      'subsequent-episode',
      nextEpisodeInfo?.seasonNumber,
      nextEpisodeInfo?.episodeNumber,
    ],
    queryFn: () => getSubsequentEpisode(tvId, nextEpisodeInfo!),
    enabled: !!(nextEpisodeInfo?.airDate && isReleaseToday(nextEpisodeInfo.airDate)),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  const subsequentEpisode = subsequentEpisodeQuery.data ?? null;
  const isLoadingSubsequent = subsequentEpisodeQuery.isLoading;

  // Whether we should use the subsequent episode instead of the current next episode
  const isUsingSubsequent = useMemo(() => {
    return !!(nextEpisodeInfo && isReleaseToday(nextEpisodeInfo.airDate) && subsequentEpisode);
  }, [nextEpisodeInfo, subsequentEpisode]);

  // The effective episode to use for reminders:
  // If today's episode is airing, use subsequent episode (if available)
  const effectiveNextEpisode = useMemo(() => {
    if (isUsingSubsequent) {
      return subsequentEpisode;
    }
    return nextEpisodeInfo;
  }, [nextEpisodeInfo, subsequentEpisode, isUsingSubsequent]);

  const handleSetReminder = useCallback(
    async (
      timing: ReminderTiming,
      frequency: TVReminderFrequency,
      nextEpisode: NextEpisodeInfo | null
    ) => {
      const show = tvShowData;
      if (!show) return;

      const hasPermission = await requestPermission();
      if (!hasPermission) {
        onToast('Please enable notifications in settings');
        return;
      }

      const releaseDate = frequency === 'every_episode' ? nextEpisode?.airDate : nextSeasonAirDate;

      if (!releaseDate) {
        onToast('No upcoming date available');
        return;
      }

      if (hasReminder && reminder) {
        // Check if frequency or nextEpisode have changed
        const frequencyChanged = frequency !== reminder.tvFrequency;
        const episodeChanged = hasEpisodeChanged(reminder.nextEpisode, nextEpisode);

        if (frequencyChanged || episodeChanged) {
          // Frequency or episode data changed - cancel existing and create new reminder
          await cancelReminderMutation.mutateAsync(reminder.id);

          if (frequency === 'every_episode') {
            if (!nextEpisode) {
              onToast('No upcoming episode available');
              return;
            }
            await createReminderMutation.mutateAsync({
              mediaId: show.id,
              mediaType: 'tv',
              title: show.name,
              posterPath: show.poster_path,
              releaseDate,
              reminderTiming: timing,
              tvFrequency: frequency,
              nextEpisode,
            });
          } else {
            await createReminderMutation.mutateAsync({
              mediaId: show.id,
              mediaType: 'tv',
              title: show.name,
              posterPath: show.poster_path,
              releaseDate,
              reminderTiming: timing,
              tvFrequency: frequency,
              ...(nextEpisode && { nextEpisode }),
            });
          }
        } else {
          // Only timing changed - use simple update
          await updateReminderMutation.mutateAsync({
            reminderId: reminder.id,
            timing,
          });
        }
      } else if (frequency === 'every_episode') {
        // For episode reminders, nextEpisode is required
        if (!nextEpisode) {
          onToast('No upcoming episode available');
          return;
        }
        await createReminderMutation.mutateAsync({
          mediaId: show.id,
          mediaType: 'tv',
          title: show.name,
          posterPath: show.poster_path,
          releaseDate,
          reminderTiming: timing,
          tvFrequency: frequency,
          nextEpisode,
        });
      } else {
        // For season premiere reminders, nextEpisode is optional
        await createReminderMutation.mutateAsync({
          mediaId: show.id,
          mediaType: 'tv',
          title: show.name,
          posterPath: show.poster_path,
          releaseDate,
          reminderTiming: timing,
          tvFrequency: frequency,
          ...(nextEpisode && { nextEpisode }),
        });
      }
    },
    [
      tvShowData,
      requestPermission,
      hasReminder,
      reminder,
      cancelReminderMutation,
      updateReminderMutation,
      createReminderMutation,
      nextSeasonAirDate,
      onToast,
    ]
  );

  const handleCancelReminder = useCallback(async () => {
    if (reminder) {
      await cancelReminderMutation.mutateAsync(reminder.id);
    }
  }, [reminder, cancelReminderMutation]);

  return {
    nextEpisodeInfo,
    effectiveNextEpisode,
    originalNextEpisode: nextEpisodeInfo,
    nextSeasonAirDate,
    nextSeasonNumber,
    isUsingSubsequent,
    isLoadingSubsequent,
    handleSetReminder,
    handleCancelReminder,
  };
}
