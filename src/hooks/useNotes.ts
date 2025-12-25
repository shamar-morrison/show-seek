import { Note, NoteInput } from '@/src/types/note';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { noteService } from '../services/NoteService';

/**
 * Hook to manage all notes for the current user.
 * Uses same subscription pattern as useRatings and useLists.
 */
export const useNotes = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;
  const [error, setError] = useState<Error | null>(null);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(() => {
    if (!userId) return true;
    return !queryClient.getQueryData(['notes', userId]);
  });

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
  };
};

/**
 * Hook to get a specific note for a media item.
 * Exactly matches useMediaRating pattern - just filters from cached data.
 */
export const useMediaNote = (mediaType: 'movie' | 'tv', mediaId: number) => {
  const { data: notes, isLoading } = useNotes();

  if (!notes) {
    return { note: null, hasNote: false, isLoading: true };
  }

  const note = notes.find((n) => n.mediaType === mediaType && n.mediaId === mediaId);

  return {
    note: note || null,
    hasNote: !!note,
    isLoading: isLoading || false,
  };
};

/**
 * Mutation hook to save a note (separate export like useRateMedia)
 */
export const useSaveNote = () => {
  return useMutation({
    mutationFn: (noteData: NoteInput) => {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('Please sign in to continue');
      return noteService.saveNote(userId, noteData);
    },
  });
};

/**
 * Mutation hook to delete a note (separate export like useDeleteRating)
 */
export const useDeleteNote = () => {
  return useMutation({
    mutationFn: ({ mediaType, mediaId }: { mediaType: 'movie' | 'tv'; mediaId: number }) => {
      const userId = auth.currentUser?.uid;
      if (!userId) throw new Error('Please sign in to continue');
      return noteService.deleteNote(userId, mediaType, mediaId);
    },
  });
};
