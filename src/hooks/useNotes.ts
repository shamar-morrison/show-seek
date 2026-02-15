import { READ_OPTIMIZATION_FLAGS, READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { Note, NoteInput } from '@/src/types/note';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuth } from '../context/auth';
import { canUseNonCriticalRead } from '../services/ReadBudgetGuard';
import { noteService } from '../services/NoteService';

const getStatusReadsEnabled = () =>
  !READ_OPTIMIZATION_FLAGS.liteModeEnabled || canUseNonCriticalRead(1);
const getNotesQueryKey = (userId: string | undefined) => ['notes', userId] as const;

const getMediaNoteQueryKey = (
  userId: string | undefined,
  mediaType: 'movie' | 'tv' | 'episode',
  mediaId: number,
  seasonNumber?: number,
  episodeNumber?: number
) =>
  ['note', userId, mediaType, mediaId, seasonNumber ?? null, episodeNumber ?? null] as const;

const getNoteId = (
  mediaType: 'movie' | 'tv' | 'episode',
  mediaId: number,
  seasonNumber?: number,
  episodeNumber?: number
) => {
  if (mediaType === 'episode') {
    if (seasonNumber === undefined || episodeNumber === undefined) {
      throw new Error('Missing season/episode for episode note');
    }
    return `episode-${mediaId}-${seasonNumber}-${episodeNumber}`;
  }

  return `${mediaType}-${mediaId}`;
};

const upsertNoteInList = (notes: Note[], nextNote: Note): Note[] => {
  const withoutExisting = notes.filter((note) => note.id !== nextNote.id);
  return [nextNote, ...withoutExisting].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );
};

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
    queryKey: getNotesQueryKey(userId),
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
    queryKey: getMediaNoteQueryKey(userId, mediaType, mediaId, seasonNumber, episodeNumber),
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
    onMutate: async (noteData) => {
      if (!userId) {
        throw new Error('Please sign in to continue');
      }

      const detailKey = getMediaNoteQueryKey(
        userId,
        noteData.mediaType,
        noteData.mediaId,
        noteData.seasonNumber,
        noteData.episodeNumber
      );
      const listKey = getNotesQueryKey(userId);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: detailKey }),
        queryClient.cancelQueries({ queryKey: listKey }),
      ]);

      const previousDetailNote = queryClient.getQueryData<Note | null>(detailKey);
      const previousNotes = queryClient.getQueryData<Note[]>(listKey);
      const now = new Date();
      const optimisticNote: Note = {
        id: getNoteId(
          noteData.mediaType,
          noteData.mediaId,
          noteData.seasonNumber,
          noteData.episodeNumber
        ),
        userId,
        mediaType: noteData.mediaType,
        mediaId: noteData.mediaId,
        content: noteData.content,
        posterPath: noteData.posterPath ?? null,
        mediaTitle: noteData.mediaTitle,
        createdAt: previousDetailNote?.createdAt ?? now,
        updatedAt: now,
        ...(noteData.seasonNumber !== undefined && { seasonNumber: noteData.seasonNumber }),
        ...(noteData.episodeNumber !== undefined && { episodeNumber: noteData.episodeNumber }),
        ...(noteData.showId !== undefined && { showId: noteData.showId }),
      };

      queryClient.setQueryData<Note | null>(detailKey, optimisticNote);

      if (previousNotes) {
        queryClient.setQueryData<Note[]>(listKey, (current) =>
          upsertNoteInList(current ?? [], optimisticNote)
        );
      }

      return { previousDetailNote, previousNotes };
    },
    onError: (_error, noteData, context) => {
      if (!userId) return;

      const detailKey = getMediaNoteQueryKey(
        userId,
        noteData.mediaType,
        noteData.mediaId,
        noteData.seasonNumber,
        noteData.episodeNumber
      );
      const listKey = getNotesQueryKey(userId);

      queryClient.setQueryData<Note | null>(detailKey, context?.previousDetailNote ?? null);

      if (context?.previousNotes) {
        queryClient.setQueryData<Note[]>(listKey, context.previousNotes);
      }
    },
    onSuccess: async (_data, noteData) => {
      if (!userId) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getNotesQueryKey(userId) }),
        queryClient.invalidateQueries({
          queryKey: getMediaNoteQueryKey(
            userId,
            noteData.mediaType,
            noteData.mediaId,
            noteData.seasonNumber,
            noteData.episodeNumber
          ),
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
    onMutate: async (variables) => {
      if (!userId) {
        throw new Error('Please sign in to continue');
      }

      const detailKey = getMediaNoteQueryKey(
        userId,
        variables.mediaType,
        variables.mediaId,
        variables.seasonNumber,
        variables.episodeNumber
      );
      const listKey = getNotesQueryKey(userId);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: detailKey }),
        queryClient.cancelQueries({ queryKey: listKey }),
      ]);

      const previousDetailNote = queryClient.getQueryData<Note | null>(detailKey);
      const previousNotes = queryClient.getQueryData<Note[]>(listKey);

      queryClient.setQueryData<Note | null>(detailKey, null);

      if (previousNotes) {
        const noteId = getNoteId(
          variables.mediaType,
          variables.mediaId,
          variables.seasonNumber,
          variables.episodeNumber
        );
        queryClient.setQueryData<Note[]>(listKey, (current) =>
          (current ?? []).filter((note) => note.id !== noteId)
        );
      }

      return { previousDetailNote, previousNotes };
    },
    onError: (_error, variables, context) => {
      if (!userId) return;

      const detailKey = getMediaNoteQueryKey(
        userId,
        variables.mediaType,
        variables.mediaId,
        variables.seasonNumber,
        variables.episodeNumber
      );
      const listKey = getNotesQueryKey(userId);

      queryClient.setQueryData<Note | null>(detailKey, context?.previousDetailNote ?? null);

      if (context?.previousNotes) {
        queryClient.setQueryData<Note[]>(listKey, context.previousNotes);
      }
    },
    onSuccess: async (_data, variables) => {
      if (!userId) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getNotesQueryKey(userId) }),
        queryClient.invalidateQueries({
          queryKey: getMediaNoteQueryKey(
            userId,
            variables.mediaType,
            variables.mediaId,
            variables.seasonNumber,
            variables.episodeNumber
          ),
        }),
      ]);
    },
  });
};
