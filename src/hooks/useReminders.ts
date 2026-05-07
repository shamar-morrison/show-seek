import { tmdbApi } from '@/src/api/tmdb';
import { READ_OPTIMIZATION_FLAGS, READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { usePremium } from '@/src/context/PremiumContext';
import {
  assertFreemiumAllowed,
  FreemiumLimitError,
  isFreemiumLimitError,
  isPremiumStatusPendingError,
  MAX_FREE_REMINDERS,
  PremiumStatusPendingError,
} from '@/src/utils/freemiumLimits';
import { parseTmdbDate } from '@/src/utils/dateUtils';
import { showFreemiumLimitAlert } from '@/src/utils/premiumAlert';
import { resolveTVEpisodeReminderRollover } from '@/src/utils/reminderRollover';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { auth } from '@/src/firebase/config';
import { canUseNonCriticalRead } from '@/src/services/ReadBudgetGuard';
import { reminderService } from '@/src/services/ReminderService';
import {
  CreateReminderInput,
  Reminder,
  ReminderMediaType,
  ReminderTiming,
} from '@/src/types/reminder';

const getStatusReadsEnabled = () =>
  !READ_OPTIMIZATION_FLAGS.liteModeEnabled || canUseNonCriticalRead(1);

type ReminderTarget = Pick<CreateReminderInput, 'mediaType' | 'mediaId'>;
type ReminderMutationInput = CreateReminderInput & { existingReminderId?: string | null };

const getReminderId = ({ mediaType, mediaId }: ReminderTarget) => `${mediaType}-${mediaId}`;
const getRemindersQueryKey = (userId: string) => ['reminders', userId] as const;
const getMediaReminderQueryKey = (
  userId: string,
  mediaType: ReminderMediaType,
  mediaId: number
) => ['reminder', userId, mediaType, mediaId] as const;

const createReminderScheduleKey = (reminder: Reminder) => {
  const nextEpisodeKey = reminder.nextEpisode
    ? `${reminder.nextEpisode.seasonNumber}-${reminder.nextEpisode.episodeNumber}-${reminder.nextEpisode.airDate}`
    : 'none';

  return `${reminder.id}:${reminder.releaseDate}:${reminder.notificationScheduledFor}:${nextEpisodeKey}`;
};

const mergeReminderPatch = (
  reminder: Reminder,
  updates?: Partial<Reminder> | void
): Reminder => ({
  ...reminder,
  ...(updates ?? {}),
});

const updateReminderCaches = ({
  queryClient,
  userId,
  updatedReminder,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  userId: string;
  updatedReminder: Reminder;
}) => {
  queryClient.setQueryData<Reminder[]>(getRemindersQueryKey(userId), (current) => {
    if (!current) {
      return current;
    }

    return current.map((reminder) =>
      reminder.id === updatedReminder.id ? updatedReminder : reminder
    );
  });

  queryClient.setQueryData<Reminder | null>(
    getMediaReminderQueryKey(userId, updatedReminder.mediaType, updatedReminder.mediaId),
    updatedReminder
  );
};

const parseReminderId = (reminderId: string): { mediaType: ReminderMediaType; mediaId: number } | null => {
  const [rawType, rawMediaId] = reminderId.split('-');
  if ((rawType !== 'movie' && rawType !== 'tv') || !rawMediaId) {
    return null;
  }

  const mediaId = Number(rawMediaId);
  if (!Number.isFinite(mediaId)) {
    return null;
  }

  return {
    mediaType: rawType,
    mediaId,
  };
};

const loadRemindersForLimitCheck = async (
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string
): Promise<Reminder[]> => {
  const queryKey = getRemindersQueryKey(userId);
  return queryClient.fetchQuery({
    queryKey,
    queryFn: () => reminderService.getActiveReminders(userId),
    staleTime: READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs,
    gcTime: READ_QUERY_CACHE_WINDOWS.statusGcTimeMs,
  });
};

const assertCanCreateReminder = async ({
  queryClient,
  userId,
  isPremium,
  isPremiumLoading,
  reminderTarget,
  existingReminderId,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  userId: string | undefined;
  isPremium: boolean;
  isPremiumLoading: boolean;
  reminderTarget: ReminderTarget;
  existingReminderId?: string | null;
}): Promise<void> => {
  if (!userId) {
    throw new Error('Please sign in to continue');
  }

  if (isPremium) {
    return;
  }

  const reminderId = getReminderId(reminderTarget);
  const queryKey = getRemindersQueryKey(userId);
  const cachedReminders = queryClient.getQueryData<Reminder[]>(queryKey) ?? [];

  if (cachedReminders.some((reminder) => reminder.id === reminderId)) {
    return;
  }

  if (isPremiumLoading && existingReminderId === reminderId) {
    return;
  }

  const reminders = await loadRemindersForLimitCheck(queryClient, userId);

  if (reminders.some((reminder) => reminder.id === reminderId)) {
    return;
  }

  if (existingReminderId === reminderId) {
    return;
  }

  assertFreemiumAllowed({
    feature: 'reminders',
    currentCount: reminders.length,
    isPremium,
    isPremiumLoading,
    maxFreeCount: MAX_FREE_REMINDERS,
  });
};

/**
 * Hook to get all active reminders for current user
 */
export const useReminders = () => {
  const currentUser = auth.currentUser;
  const userId = currentUser && !currentUser.isAnonymous ? currentUser.uid : undefined;

  const query = useQuery({
    queryKey: ['reminders', userId],
    queryFn: () => reminderService.getActiveReminders(userId!),
    enabled: !!userId,
    placeholderData: [] as Reminder[],
    staleTime: READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs,
    gcTime: READ_QUERY_CACHE_WINDOWS.statusGcTimeMs,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  /*
   * Auto-update stale reminders
   */
  useAutoUpdateReminders(query.data || [], userId);

  return {
    ...query,
    data: query.data ?? [],
    isLoading: query.isLoading,
  };
};

/**
 * Internal hook to automatically update active reminders that have passed their notification time
 * This acts as a client-side "cron job" to roll forward reminders to the next episode
 */
const useAutoUpdateReminders = (reminders: Reminder[], userId?: string) => {
  const queryClient = useQueryClient();
  const processedSchedulesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) {
      processedSchedulesRef.current.clear();
      return;
    }

    let isMounted = true;

    // Prune old schedule snapshots so the same reminder document can roll over again
    // after it advances to a new release date.
    const currentScheduleKeys = new Set(reminders.map(createReminderScheduleKey));
    for (const scheduleKey of processedSchedulesRef.current) {
      if (!currentScheduleKeys.has(scheduleKey)) {
        processedSchedulesRef.current.delete(scheduleKey);
      }
    }

    const checkAndAutoUpdate = async () => {
      const now = Date.now();
      const updatePromises: Promise<void>[] = [];

      for (const reminder of reminders) {
        const scheduleKey = createReminderScheduleKey(reminder);
        if (processedSchedulesRef.current.has(scheduleKey)) continue;

        if (
          reminder.status !== 'active' ||
          reminder.notificationScheduledFor >= now ||
          reminder.mediaType !== 'tv'
        ) {
          continue;
        }

        updatePromises.push(
          (async () => {
            if (!isMounted) return;

            try {
              console.log(`[AutoUpdate] Checking stale reminder for: ${reminder.title}`);
              const showDetails = await queryClient.ensureQueryData({
                queryKey: ['tv', reminder.mediaId],
                queryFn: () => tmdbApi.getTVShowDetails(reminder.mediaId),
              });

              if (!isMounted) return;

              if (reminder.tvFrequency === 'every_episode') {
                const nextEpisode = await resolveTVEpisodeReminderRollover(reminder, showDetails);

                if (!isMounted) return;

                if (!nextEpisode) {
                  console.log(
                    `[AutoUpdate] No later episode available yet for ${reminder.title}. Leaving reminder retryable.`
                  );
                  return;
                }

                console.log(
                  `[AutoUpdate] Advancing ${reminder.title} to S${nextEpisode.seasonNumber}E${nextEpisode.episodeNumber}`
                );

                const appliedUpdates = await reminderService.updateReminderDetails(reminder.id, {
                  releaseDate: nextEpisode.airDate,
                  nextEpisode,
                  noNextEpisodeFound: false,
                });

                if (!isMounted) return;

                const updatedReminder = mergeReminderPatch(reminder, {
                  ...appliedUpdates,
                  releaseDate: nextEpisode.airDate,
                  nextEpisode,
                  noNextEpisodeFound: false,
                });

                updateReminderCaches({
                  queryClient,
                  userId,
                  updatedReminder,
                });
                processedSchedulesRef.current.add(scheduleKey);
                return;
              }

              const nextEpisode = showDetails.next_episode_to_air;
              const nextEpisodeAirDate = nextEpisode?.air_date;
              const nextEpisodePatch = nextEpisodeAirDate
                ? {
                    seasonNumber: nextEpisode.season_number,
                    episodeNumber: nextEpisode.episode_number,
                    episodeName: nextEpisode.name || 'TBA',
                    airDate: nextEpisodeAirDate,
                  }
                : undefined;
              const isNewSeason =
                (nextEpisode?.season_number ?? 0) > (reminder.nextEpisode?.seasonNumber ?? 0);
              const isFutureDate =
                !!nextEpisodeAirDate &&
                parseTmdbDate(nextEpisodeAirDate).getTime() >
                  parseTmdbDate(reminder.releaseDate).getTime();

              if (
                reminder.tvFrequency === 'season_premiere' &&
                nextEpisodeAirDate &&
                nextEpisode?.episode_number === 1 &&
                isNewSeason &&
                isFutureDate
              ) {
                const appliedUpdates = await reminderService.updateReminderDetails(reminder.id, {
                  releaseDate: nextEpisodeAirDate,
                  nextEpisode: nextEpisodePatch,
                  noNextEpisodeFound: false,
                });

                if (!isMounted) return;

                const updatedReminder = mergeReminderPatch(reminder, {
                  ...appliedUpdates,
                  releaseDate: nextEpisodeAirDate,
                  nextEpisode: nextEpisodePatch,
                  noNextEpisodeFound: false,
                });

                updateReminderCaches({
                  queryClient,
                  userId,
                  updatedReminder,
                });
                processedSchedulesRef.current.add(scheduleKey);
              }
            } catch (error) {
              if (isMounted) {
                console.error(
                  `[AutoUpdate] Failed to update reminder for ${reminder.title}:`,
                  error
                );
              }
            }
          })()
        );
      }

      if (updatePromises.length > 0 && isMounted) {
        await Promise.allSettled(updatePromises);
      }
    };

    checkAndAutoUpdate();

    return () => {
      isMounted = false;
    };
  }, [reminders, queryClient, userId]);
};

/**
 * Hook to check if specific media has a reminder
 */
export const useMediaReminder = (mediaId: number, mediaType: ReminderMediaType) => {
  const { data: reminders, isLoading } = useReminders();
  if (!getStatusReadsEnabled()) {
    return {
      reminder: null,
      hasReminder: false,
      isLoading: false,
    };
  }

  const reminderId = `${mediaType}-${mediaId}`;
  const reminder = reminders.find((candidate) => candidate.id === reminderId);

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
  const queryClient = useQueryClient();
  const currentUser = auth.currentUser;
  const userId = currentUser && !currentUser.isAnonymous ? currentUser.uid : undefined;
  const { isPremium, isLoading: isPremiumLoading } = usePremium();

  return useMutation({
    mutationFn: async (input: ReminderMutationInput) => {
      await assertCanCreateReminder({
        queryClient,
        userId,
        isPremium,
        isPremiumLoading,
        reminderTarget: input,
        existingReminderId: input.existingReminderId,
      });
      return reminderService.createReminder(input);
    },
    onSuccess: async (_data, variables) => {
      if (!userId) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getRemindersQueryKey(userId) }),
        queryClient.invalidateQueries({
          queryKey: getMediaReminderQueryKey(userId, variables.mediaType, variables.mediaId),
        }),
      ]);
    },
  });
};

export const useCanCreateReminder = () => {
  const queryClient = useQueryClient();
  const currentUser = auth.currentUser;
  const userId = currentUser && !currentUser.isAnonymous ? currentUser.uid : undefined;
  const { isPremium, isLoading: isPremiumLoading } = usePremium();

  return useCallback(
    async (reminderTarget: ReminderTarget): Promise<boolean> => {
      try {
        await assertCanCreateReminder({
          queryClient,
          userId,
          isPremium,
          isPremiumLoading,
          reminderTarget,
        });
        return true;
      } catch (error) {
        if (isPremiumStatusPendingError(error)) {
          return false;
        }

        if (isFreemiumLimitError(error)) {
          showFreemiumLimitAlert('reminders', MAX_FREE_REMINDERS);
          return false;
        }

        throw error;
      }
    },
    [isPremium, isPremiumLoading, queryClient, userId]
  );
};

/**
 * Mutation hook to cancel a reminder
 */
export const useCancelReminder = () => {
  const queryClient = useQueryClient();
  const currentUser = auth.currentUser;
  const userId = currentUser && !currentUser.isAnonymous ? currentUser.uid : undefined;

  return useMutation({
    mutationFn: (reminderId: string) => reminderService.cancelReminder(reminderId),
    onSuccess: async (_data, reminderId) => {
      if (!userId) return;

      await queryClient.invalidateQueries({ queryKey: getRemindersQueryKey(userId) });
      const parsed = parseReminderId(reminderId);
      if (parsed) {
        await queryClient.invalidateQueries({
          queryKey: getMediaReminderQueryKey(userId, parsed.mediaType, parsed.mediaId),
        });
      }
    },
  });
};

/**
 * Mutation hook to update reminder timing
 */
export const useUpdateReminder = () => {
  const queryClient = useQueryClient();
  const currentUser = auth.currentUser;
  const userId = currentUser && !currentUser.isAnonymous ? currentUser.uid : undefined;

  return useMutation({
    mutationFn: ({ reminderId, timing }: { reminderId: string; timing: ReminderTiming }) =>
      reminderService.updateReminder(reminderId, timing),
    onSuccess: async (_data, variables) => {
      if (!userId) return;

      await queryClient.invalidateQueries({ queryKey: getRemindersQueryKey(userId) });
      const parsed = parseReminderId(variables.reminderId);
      if (parsed) {
        await queryClient.invalidateQueries({
          queryKey: getMediaReminderQueryKey(userId, parsed.mediaType, parsed.mediaId),
        });
      }
    },
  });
};
