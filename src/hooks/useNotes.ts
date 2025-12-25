import { Note, NoteInput } from '@/src/types/note';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/auth';
import { noteService } from '../services/NoteService';

/**
 * Hook to manage all notes for the current user.
 * Uses reactive useAuth hook to properly respond to auth state changes.
 */
export const useNotes = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;
  const previousUserIdRef = useRef<string | undefined>(userId);
  const [error, setError] = useState<Error | null>(null);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(() => {
    if (!userId) return false;
    return !queryClient.getQueryData(['notes', userId]);
  });

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;

    if (previousUserId && !userId) {
      queryClient.removeQueries({ queryKey: ['notes', previousUserId] });
    }

    previousUserIdRef.current = userId;
  }, [userId, queryClient]);

  useEffect(() => {
    if (!userId) {
      setIsSubscriptionLoading(false);
      return;
    }

    setError(null);
    if (!queryClient.getQueryData(['notes', userId])) {
      setIsSubscriptionLoading(true);
    }

    const unsubscribe = noteService.subscribeToUserNotes(
      userId,
      (notes) => {
        queryClient.setQueryData(['notes', userId], notes);
        setError(null);
        setIsSubscriptionLoading(false);
      },
      (err) => {
        setError(err);
        setIsSubscriptionLoading(false);
        console.error('[useNotes] Subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [userId, queryClient]);

  const refetch = useCallback(() => {
    if (userId) {
      queryClient.invalidateQueries({ queryKey: ['notes', userId] });
    }
  }, [userId, queryClient]);

  const query = useQuery({
    queryKey: ['notes', userId],
    queryFn: () => queryClient.getQueryData<Note[]>(['notes', userId]) || [],
    enabled: !!userId,
    staleTime: Infinity,
    meta: { error },
  });

  return {
    ...query,
    isLoading: isSubscriptionLoading,
    refetch,
  };
};

/**
 * Hook to get a specific note for a media item.
 * Filters from the global notes cache.
 */
export const useMediaNote = (mediaType: 'movie' | 'tv', mediaId: number) => {
  const { data: notes, isLoading, refetch } = useNotes();

  const note = notes?.find((n) => n.mediaType === mediaType && n.mediaId === mediaId);

  return {
    note: note || null,
    hasNote: !!note,
    isLoading,
    refetch,
  };
};

/**
 * Mutation hook to save a note (separate export like useRateMedia)
 */
export const useSaveNote = () => {
  const { user } = useAuth();
  const userId = user?.uid;

  return useMutation({
    mutationFn: (noteData: NoteInput) => {
      if (!userId) throw new Error('Please sign in to continue');
      return noteService.saveNote(userId, noteData);
    },
  });
};

/**
 * Mutation hook to delete a note (separate export like useDeleteRating)
 */
export const useDeleteNote = () => {
  const { user } = useAuth();
  const userId = user?.uid;

  return useMutation({
    mutationFn: ({ mediaType, mediaId }: { mediaType: 'movie' | 'tv'; mediaId: number }) => {
      if (!userId) throw new Error('Please sign in to continue');
      return noteService.deleteNote(userId, mediaType, mediaId);
    },
  });
};
