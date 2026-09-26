import { tmdbApi } from '@/src/api/tmdb';
import { READ_OPTIMIZATION_FLAGS, READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { usePremium } from '@/src/context/PremiumContext';
import {
  assertFreemiumAllowed,
  isFreemiumLimitError,
  isPremiumStatusPendingError,
  MAX_FREE_REMINDERS,
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

/**
 * Build a client-side placeholder so the bell fills instantly.
 * Uses a future `notificationScheduledFor` so the auto-rollover hook
 * (which only acts on `notificationScheduledFor < now`) skips it until
 * the server refetch reconciles real scheduling data.
 * Failure toast is shown by the calling modal (ReminderModal/TVReminderModal)
 * when `mutateAsync` rejects after `onError` has rolled the cache back.
 */
const buildOptimisticReminder = (
  userId: string,
  input: CreateReminderInput
): Reminder => {
  const now = Date.now();
  let notificationScheduledFor = now + 60_000;
  try {
    const releaseTime = parseTmdbDate(input.releaseDate).getTime();
    if (Number.isFinite(releaseTime) && releaseTime > notificationScheduledFor) {
      notificationScheduledFor = releaseTime;
    }
  } catch {
    // Fall back to the future placeholder above.
  }

  return {
    id: getReminderId(input),
    userId,
    mediaType: input.mediaType,
    mediaId: input.mediaId,
    title: input.title,
    posterPath: input.posterPath,
    releaseDate: input.releaseDate,
    reminderTiming: input.reminderTiming,
    notificationScheduledFor,
    localNotificationId: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    ...(input.mediaType === 'tv' && {
      tvFrequency: input.tvFrequency,
      ...(input.nextEpisode ? { nextEpisode: input.nextEpisode } : {}),
    }),
  } as Reminder;
};

type OptimisticMutationContext = {
  listKey: ReturnType<typeof getRemindersQueryKey>;
  singleKey?: ReturnType<typeof getMediaReminderQueryKey>;
  previousList?: Reminder[];
  previousSingle?: Reminder | null;
} | undefined;

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

  return useMutation<void, Error, ReminderMutationInput, OptimisticMutationContext>({
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
    onMutate: async (variables) => {
      if (!userId) return undefined;
      const listKey = getRemindersQueryKey(userId);
      const singleKey = getMediaReminderQueryKey(
        userId,
        variables.mediaType,
        variables.mediaId
      );
      await queryClient.cancelQueries({ queryKey: listKey });
      const previousList = queryClient.getQueryData<Reminder[]>(listKey);
      const previousSingle = queryClient.getQueryData<Reminder | null>(singleKey);
      // Guard: never optimistically insert before the authoritative freemium/
      // premium-status check in `mutationFn` has a chance to reject. An early
      // insert would pollute the cache that `assertCanCreateReminder` reads,
      // making a new over-limit reminder look like a recreate (allowed).
      // Recreate/overwrite of a known entry is always safe to show instantly.
      const reminderId = getReminderId(variables);
      const isRecreate =
        (previousList ?? []).some((reminder) => reminder.id === reminderId) ||
        variables.existingReminderId === reminderId;
      if (!isRecreate && !isPremium) {
        // Cache explicitly invalidated (stale by decree, e.g. right after
        // another mutation): don't guess from dirty data — the authoritative
        // fetch in `mutationFn` decides, and the bell fills on settled refetch.
        if (queryClient.getQueryState(listKey)?.isInvalidated) return undefined;
        // Unknown cache state or premium status still loading: let the
        // authoritative check decide first; bell fills on settled refetch.
        if (previousList === undefined || isPremiumLoading) return undefined;
        // Known state already at the free limit: don't flash the bell on;
        // `mutationFn` will reject and the modal shows the limit alert.
        if (previousList.length >= MAX_FREE_REMINDERS) return undefined;
      }
      const optimistic = buildOptimisticReminder(userId, variables);
      queryClient.setQueryData<Reminder[]>(listKey, (current) => {
        const base = current ?? previousList ?? [];
        if (base.some((reminder) => reminder.id === optimistic.id)) {
          return base.map((reminder) =>
            reminder.id === optimistic.id ? optimistic : reminder
          );
        }
        return [...base, optimistic];
      });
      queryClient.setQueryData<Reminder | null>(singleKey, optimistic);
      return { listKey, singleKey, previousList, previousSingle: previousSingle ?? null };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      if (context.previousList !== undefined) {
        queryClient.setQueryData(context.listKey, context.previousList);
      }
      if (context.singleKey) {
        queryClient.setQueryData(context.singleKey, context.previousSingle ?? null);
      }
    },
    onSettled: async (_data, _error, variables) => {
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

  return useMutation<void, Error, string, OptimisticMutationContext>({
    mutationFn: (reminderId: string) => reminderService.cancelReminder(reminderId),
    onMutate: async (reminderId) => {
      if (!userId) return undefined;
      const listKey = getRemindersQueryKey(userId);
      await queryClient.cancelQueries({ queryKey: listKey });
      const previousList = queryClient.getQueryData<Reminder[]>(listKey);
      const parsed = parseReminderId(reminderId);
      const singleKey = parsed
        ? getMediaReminderQueryKey(userId, parsed.mediaType, parsed.mediaId)
        : undefined;
      const previousSingle = singleKey
        ? queryClient.getQueryData<Reminder | null>(singleKey)
        : undefined;
      queryClient.setQueryData<Reminder[]>(listKey, (current) => {
        const base = current ?? previousList ?? [];
        return base.filter((reminder) => reminder.id !== reminderId);
      });
      if (singleKey) {
        queryClient.setQueryData<Reminder | null>(singleKey, null);
      }
      return { listKey, singleKey, previousList, previousSingle: previousSingle ?? null };
    },
    onError: (_error, _reminderId, context) => {
      if (!context) return;
      if (context.previousList !== undefined) {
        queryClient.setQueryData(context.listKey, context.previousList);
      }
      if (context.singleKey) {
        queryClient.setQueryData(context.singleKey, context.previousSingle ?? null);
      }
    },
    onSettled: async (_data, _error, reminderId) => {
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

  return useMutation<
    void,
    Error,
    { reminderId: string; timing: ReminderTiming },
    OptimisticMutationContext
  >({
    mutationFn: ({ reminderId, timing }: { reminderId: string; timing: ReminderTiming }) =>
      reminderService.updateReminder(reminderId, timing),
    onMutate: async (variables) => {
      if (!userId) return undefined;
      const listKey = getRemindersQueryKey(userId);
      await queryClient.cancelQueries({ queryKey: listKey });
      const previousList = queryClient.getQueryData<Reminder[]>(listKey);
      const parsed = parseReminderId(variables.reminderId);
      const singleKey = parsed
        ? getMediaReminderQueryKey(userId, parsed.mediaType, parsed.mediaId)
        : undefined;
      const previousSingle = singleKey
        ? queryClient.getQueryData<Reminder | null>(singleKey)
        : undefined;
      const now = Date.now();
      queryClient.setQueryData<Reminder[]>(listKey, (current) => {
        const base = current ?? previousList ?? [];
        return base.map((reminder) =>
          reminder.id === variables.reminderId
            ? { ...reminder, reminderTiming: variables.timing, updatedAt: now }
            : reminder
        );
      });
      if (singleKey && previousSingle) {
        queryClient.setQueryData<Reminder | null>(singleKey, {
          ...previousSingle,
          reminderTiming: variables.timing,
          updatedAt: now,
        });
      }
      return { listKey, singleKey, previousList, previousSingle: previousSingle ?? null };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      if (context.previousList !== undefined) {
        queryClient.setQueryData(context.listKey, context.previousList);
      }
      if (context.singleKey) {
        queryClient.setQueryData(context.singleKey, context.previousSingle ?? null);
      }
    },
    onSettled: async (_data, _error, variables) => {
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
