import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import {
  Reminder,
  ReminderMediaType,
  CreateReminderInput,
  ReminderTiming,
} from '../types/reminder';
import { reminderService } from '../services/ReminderService';

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

  return {
    ...query,
    isLoading: isSubscriptionLoading,
  };
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
