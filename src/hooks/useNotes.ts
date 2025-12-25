import { NoteInput } from '@/src/types/note';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { auth } from '../firebase/config';
import { noteService } from '../services/NoteService';

/**
 * Hook to manage notes for media items
 */
export const useNotes = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;
  const [error, setError] = useState<Error | null>(null);

  /**
   * Get a single note for a specific media item
   */
  const getNote = useCallback(
    async (mediaType: 'movie' | 'tv', mediaId: number) => {
      if (!userId) return null;
      try {
        return await noteService.getNote(userId, mediaType, mediaId);
      } catch (err) {
        console.error('[useNotes] getNote error:', err);
        return null;
      }
    },
    [userId]
  );

  /**
   * Get all notes query
   */
  const allNotesQuery = useQuery({
    queryKey: ['notes', userId],
    queryFn: async () => {
      if (!userId) return [];
      return noteService.getNotes(userId);
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  /**
   * Save note mutation
   */
  const saveNoteMutation = useMutation({
    mutationFn: async (noteData: NoteInput) => {
      if (!userId) throw new Error('Please sign in to continue');
      return noteService.saveNote(userId, noteData);
    },
    onSuccess: () => {
      // Invalidate notes list
      queryClient.invalidateQueries({ queryKey: ['notes', userId] });
      setError(null);
    },
    onError: (err: Error) => {
      setError(err);
    },
  });

  /**
   * Delete note mutation
   */
  const deleteNoteMutation = useMutation({
    mutationFn: async ({ mediaType, mediaId }: { mediaType: 'movie' | 'tv'; mediaId: number }) => {
      if (!userId) throw new Error('Please sign in to continue');
      return noteService.deleteNote(userId, mediaType, mediaId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', userId] });
      setError(null);
    },
    onError: (err: Error) => {
      setError(err);
    },
  });

  return {
    // Query methods
    getNote,
    getAllNotes: allNotesQuery.data || [],
    isLoadingNotes: allNotesQuery.isLoading,
    refetchNotes: allNotesQuery.refetch,

    // Mutations
    saveNote: saveNoteMutation.mutateAsync,
    deleteNote: deleteNoteMutation.mutateAsync,
    isSaving: saveNoteMutation.isPending,
    isDeleting: deleteNoteMutation.isPending,

    // State
    loading: saveNoteMutation.isPending || deleteNoteMutation.isPending,
    error,
  };
};

/**
 * Hook to get a specific note for a media item
 */
export const useMediaNote = (mediaType: 'movie' | 'tv', mediaId: number) => {
  const userId = auth.currentUser?.uid;

  const query = useQuery({
    queryKey: ['note', userId, mediaType, mediaId],
    queryFn: async () => {
      if (!userId) return null;
      return noteService.getNote(userId, mediaType, mediaId);
    },
    enabled: !!userId && !!mediaId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return {
    note: query.data || null,
    hasNote: !!query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
};
