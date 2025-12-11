import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { tmdbApi } from '../api/tmdb';
import { auth } from '../firebase/config';
import { reminderService } from '../services/ReminderService';
import {
  CreateReminderInput,
  Reminder,
  ReminderMediaType,
  ReminderTiming,
} from '../types/reminder';

/**
 * Hook to get all active reminders for current user
 */
export const useReminders = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;
  const [error, setError] = useState<Error | null>(null);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(() => {
    if (!userId) return true;
    return !queryClient.getQueryData(['reminders', userId]);
  });

  useEffect(() => {
    if (!userId) {
      setIsSubscriptionLoading(false);
      return;
    }

    setError(null);
    if (!queryClient.getQueryData(['reminders', userId])) {
      setIsSubscriptionLoading(true);
    }

    const unsubscribe = reminderService.subscribeToUserReminders(
      (reminders) => {
        queryClient.setQueryData(['reminders', userId], reminders);
        setError(null);
        setIsSubscriptionLoading(false);
      },
      (err) => {
        setError(err);
        setIsSubscriptionLoading(false);
        console.error('[useReminders] Subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [userId, queryClient]);

  const query = useQuery({
    queryKey: ['reminders', userId],
    queryFn: () => {
      return queryClient.getQueryData<Reminder[]>(['reminders', userId]) || [];
    },
    enabled: !!userId,
    staleTime: Infinity,
    meta: { error },
  });

  /*
   * Auto-update stale reminders
   */
  useAutoUpdateReminders(query.data || []);

  return {
    ...query,
    isLoading: isSubscriptionLoading,
  };
};

/**
 * Internal hook to automatically update active reminders that have passed their notification time
 * This acts as a client-side "cron job" to roll forward reminders to the next episode
 */
const useAutoUpdateReminders = (reminders: Reminder[]) => {
  const queryClient = useQueryClient();
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(reminders.map((r) => r.id));
    for (const id of processedRef.current) {
      if (!currentIds.has(id)) {
        processedRef.current.delete(id);
      }
    }

    const checkAndAutoUpdate = async () => {
      const now = Date.now();
      const updatePromises: Promise<void>[] = [];

      for (const reminder of reminders) {
        if (processedRef.current.has(reminder.id)) continue;

        if (reminder.status === 'active' && reminder.notificationScheduledFor < now) {
          processedRef.current.add(reminder.id);

          if (reminder.mediaType === 'tv') {
            updatePromises.push(
              (async () => {
                try {
                  console.log(`[AutoUpdate] Checking stale reminder for: ${reminder.title}`);
                  const showDetails = await queryClient.ensureQueryData({
                    queryKey: ['tv', reminder.mediaId],
                    queryFn: () => tmdbApi.getTVShowDetails(reminder.mediaId),
                  });
                  const nextEpisode = showDetails.next_episode_to_air;

                  if (nextEpisode && nextEpisode.air_date) {
                    const isEveryEpisode = reminder.tvFrequency === 'every_episode';
                    const isNewSeason =
                      nextEpisode.season_number > (reminder.nextEpisode?.seasonNumber || 0);

                    const isFutureDate =
                      Date.parse(nextEpisode.air_date!) > Date.parse(reminder.releaseDate);

                    if (
                      (isEveryEpisode ||
                        (reminder.tvFrequency === 'season_premiere' && isNewSeason)) &&
                      isFutureDate
                    ) {
                      console.log(
                        `[AutoUpdate] Found new episode for ${reminder.title}: S${nextEpisode.season_number}E${nextEpisode.episode_number}`
                      );

                      const newNextEpisode = {
                        seasonNumber: nextEpisode.season_number,
                        episodeNumber: nextEpisode.episode_number,
                        episodeName: nextEpisode.name,
                        airDate: nextEpisode.air_date!,
                      };

                      // Call update logic (using partial update to respect Firestore rules)
                      await reminderService.updateReminderDetails(reminder.id, {
                        releaseDate: nextEpisode.air_date!,
                        nextEpisode: newNextEpisode,
                      });
                    }
                  } else {
                    console.log(
                      `[AutoUpdate] No future episode found for ${reminder.title}. Leaving as "Released".`
                    );
                  }
                } catch (error) {
                  console.error(
                    `[AutoUpdate] Failed to update reminder for ${reminder.title}:`,
                    error
                  );
                }
              })()
            );
          }
        }
      }

      if (updatePromises.length > 0) {
        await Promise.allSettled(updatePromises);
      }
    };

    checkAndAutoUpdate();
  }, [reminders]);
};

/**
 * Hook to check if specific media has a reminder
 */
export const useMediaReminder = (mediaId: number, mediaType: ReminderMediaType) => {
  const { data: reminders, isLoading } = useReminders();

  if (!reminders) {
    return { reminder: null, hasReminder: false, isLoading };
  }

  const reminderId = `${mediaType}-${mediaId}`;
  const reminder = reminders.find((r) => r.id === reminderId);

  return {
    reminder: reminder || null,
    hasReminder: !!reminder,
    isLoading,
  };
};

/**
 * Mutation hook to create a reminder
 */
export const useCreateReminder = () => {
  return useMutation({
    mutationFn: (input: CreateReminderInput) => reminderService.createReminder(input),
  });
};

/**
 * Mutation hook to cancel a reminder
 */
export const useCancelReminder = () => {
  return useMutation({
    mutationFn: (reminderId: string) => reminderService.cancelReminder(reminderId),
  });
};

/**
 * Mutation hook to update reminder timing
 */
export const useUpdateReminder = () => {
  return useMutation({
    mutationFn: ({ reminderId, timing }: { reminderId: string; timing: ReminderTiming }) =>
      reminderService.updateReminder(reminderId, timing),
  });
};
