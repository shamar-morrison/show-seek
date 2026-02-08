import { Note, NoteInput } from '@/src/types/note';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '../context/auth';
import { useRealtimeSubscription } from './useRealtimeSubscription';
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

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;

    if (previousUserId && !userId) {
      queryClient.removeQueries({ queryKey: ['notes', previousUserId] });
    }

    previousUserIdRef.current = userId;
  }, [userId, queryClient]);

  const subscribe = useCallback(
    (onData: (data: Note[]) => void, onError: (error: Error) => void) => {
      if (!userId) return () => {};
      return noteService.subscribeToUserNotes(userId, onData, onError);
    },
    [userId]
  );

  const query = useRealtimeSubscription<Note[]>({
    queryKey: ['notes', userId],
    enabled: !!userId,
    initialData: [],
    subscribe,
    logLabel: 'useNotes',
  });

  return {
    ...query,
  };
};

/**
 * Hook to get a specific note for a media item.
 * Filters from the global notes cache.
 */
export const useMediaNote = (
  mediaType: 'movie' | 'tv' | 'episode',
  mediaId: number,
  seasonNumber?: number,
  episodeNumber?: number
) => {
  const { data: notes, isLoading } = useNotes();

  const note = notes?.find((n) => {
    if (n.mediaType !== mediaType || n.mediaId !== mediaId) return false;
    if (mediaType === 'episode') {
      return n.seasonNumber === seasonNumber && n.episodeNumber === episodeNumber;
    }
    return true;
  });

  return {
    note: note || null,
    hasNote: !!note,
    isLoading,
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
    mutationFn: ({
      mediaType,
      mediaId,
      seasonNumber,
      episodeNumber,
    }: {
      mediaType: 'movie' | 'tv' | 'episode';
      mediaId: number;
      seasonNumber?: number;
      episodeNumber?: number;
    }) => {
      if (!userId) throw new Error('Please sign in to continue');
      return noteService.deleteNote(userId, mediaType, mediaId, seasonNumber, episodeNumber);
    },
  });
};
