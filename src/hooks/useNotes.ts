import { READ_OPTIMIZATION_FLAGS, READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { Note, NoteInput } from '@/src/types/note';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuth } from '../context/auth';
import { canUseNonCriticalRead } from '../services/ReadBudgetGuard';
import { noteService } from '../services/NoteService';

const getStatusReadsEnabled = () =>
  !READ_OPTIMIZATION_FLAGS.liteModeEnabled || canUseNonCriticalRead(1);

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

  const query = useQuery({
    queryKey: ['notes', userId],
    queryFn: () => noteService.getUserNotes(userId!),
    enabled: !!userId,
    staleTime: READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs,
    gcTime: READ_QUERY_CACHE_WINDOWS.statusGcTimeMs,
  });

  return {
    ...query,
    data: query.data ?? [],
  };
};

/**
 * Hook to get a specific note for a media item.
 */
export const useMediaNote = (
  mediaType: 'movie' | 'tv' | 'episode',
  mediaId: number,
  seasonNumber?: number,
  episodeNumber?: number
) => {
  const { user } = useAuth();
  const userId = user?.uid;

  const query = useQuery({
    queryKey: ['note', userId, mediaType, mediaId, seasonNumber ?? null, episodeNumber ?? null],
    queryFn: () => noteService.getNote(userId!, mediaType, mediaId, seasonNumber, episodeNumber),
    enabled: !!userId && !!mediaId && getStatusReadsEnabled(),
    staleTime: READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs,
    gcTime: READ_QUERY_CACHE_WINDOWS.statusGcTimeMs,
  });

  return {
    note: query.data || null,
    hasNote: !!query.data,
    isLoading: query.isLoading,
  };
};

/**
 * Mutation hook to save a note (separate export like useRateMedia)
 */
export const useSaveNote = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;

  return useMutation({
    mutationFn: (noteData: NoteInput) => {
      if (!userId) throw new Error('Please sign in to continue');
      return noteService.saveNote(userId, noteData);
    },
    onSuccess: async (_data, noteData) => {
      if (!userId) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notes', userId] }),
        queryClient.invalidateQueries({
          queryKey: [
            'note',
            userId,
            noteData.mediaType,
            noteData.mediaId,
            noteData.seasonNumber ?? null,
            noteData.episodeNumber ?? null,
          ],
        }),
      ]);
    },
  });
};

/**
 * Mutation hook to delete a note (separate export like useDeleteRating)
 */
export const useDeleteNote = () => {
  const queryClient = useQueryClient();
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
    onSuccess: async (_data, variables) => {
      if (!userId) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notes', userId] }),
        queryClient.invalidateQueries({
          queryKey: [
            'note',
            userId,
            variables.mediaType,
            variables.mediaId,
            variables.seasonNumber ?? null,
            variables.episodeNumber ?? null,
          ],
        }),
      ]);
    },
  });
};
