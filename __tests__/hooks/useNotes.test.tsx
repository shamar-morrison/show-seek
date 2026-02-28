import type { Note } from '@/src/types/note';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockGetUserNotes = jest.fn();
const mockGetNote = jest.fn();
const mockSaveNote = jest.fn();
const mockDeleteNote = jest.fn();
const mockCanUseNonCriticalRead = jest.fn();

const mockAuthState: { user: { uid: string } | null } = {
  user: { uid: 'test-user-id' },
};

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/services/NoteService', () => ({
  noteService: {
    getUserNotes: (...args: unknown[]) => mockGetUserNotes(...args),
    getNote: (...args: unknown[]) => mockGetNote(...args),
    saveNote: (...args: unknown[]) => mockSaveNote(...args),
    deleteNote: (...args: unknown[]) => mockDeleteNote(...args),
  },
}));

jest.mock('@/src/services/ReadBudgetGuard', () => ({
  canUseNonCriticalRead: (...args: unknown[]) => mockCanUseNonCriticalRead(...args),
}));

import { useDeleteNote, useMediaNote, useSaveNote } from '@/src/hooks/useNotes';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const getNotesKey = (userId = 'test-user-id') => ['notes', userId] as const;
const getMovieNoteKey = (movieId: number, userId = 'test-user-id') =>
  ['note', userId, 'movie', movieId, null, null] as const;
const getEpisodeNoteKey = (
  mediaId: number,
  seasonNumber: number,
  episodeNumber: number,
  userId = 'test-user-id'
) => ['note', userId, 'episode', mediaId, seasonNumber, episodeNumber] as const;

const createNote = (params: {
  id: string;
  mediaType: 'movie' | 'tv' | 'episode';
  mediaId: number;
  content: string;
  mediaTitle: string;
  seasonNumber?: number;
  episodeNumber?: number;
}): Note => ({
  id: params.id,
  userId: 'test-user-id',
  mediaType: params.mediaType,
  mediaId: params.mediaId,
  content: params.content,
  posterPath: null,
  mediaTitle: params.mediaTitle,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  ...(params.seasonNumber !== undefined && { seasonNumber: params.seasonNumber }),
  ...(params.episodeNumber !== undefined && { episodeNumber: params.episodeNumber }),
});

beforeAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => act(fn));
});

afterAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => fn());
});

describe('useNotes optimistic cache behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanUseNonCriticalRead.mockReturnValue(true);
    mockAuthState.user = { uid: 'test-user-id' };
    mockGetUserNotes.mockResolvedValue([]);
    mockGetNote.mockResolvedValue(null);
    mockSaveNote.mockResolvedValue(undefined);
    mockDeleteNote.mockResolvedValue(undefined);
  });

  it('save note sets hasNote true immediately for movie', async () => {
    const client = createQueryClient();
    const saveDeferred = createDeferred<void>();
    mockSaveNote.mockReturnValueOnce(saveDeferred.promise);
    mockGetNote.mockResolvedValueOnce(null);

    const { result } = renderHook(
      () => ({
        mediaNote: useMediaNote('movie', 123),
        saveNote: useSaveNote(),
      }),
      { wrapper: createWrapper(client) }
    );

    await waitFor(() => {
      expect(result.current.mediaNote.isLoading).toBe(false);
      expect(result.current.mediaNote.hasNote).toBe(false);
    });

    act(() => {
      result.current.saveNote.mutate({
        mediaType: 'movie',
        mediaId: 123,
        content: 'First note',
        posterPath: null,
        mediaTitle: 'Movie 123',
      });
    });

    await waitFor(() => {
      expect(result.current.mediaNote.hasNote).toBe(true);
      expect(result.current.mediaNote.note?.content).toBe('First note');
    });

    await act(async () => {
      saveDeferred.resolve(undefined);
      await saveDeferred.promise;
    });
  });

  it('edit note updates cached content immediately', async () => {
    const client = createQueryClient();
    const existingNote = createNote({
      id: 'movie-123',
      mediaType: 'movie',
      mediaId: 123,
      content: 'Old content',
      mediaTitle: 'Movie 123',
    });
    const saveDeferred = createDeferred<void>();
    mockSaveNote.mockReturnValueOnce(saveDeferred.promise);
    mockGetNote.mockResolvedValue(existingNote);

    client.setQueryData(getMovieNoteKey(123), existingNote);
    client.setQueryData(getNotesKey(), [existingNote]);

    const { result } = renderHook(
      () => ({
        mediaNote: useMediaNote('movie', 123),
        saveNote: useSaveNote(),
      }),
      { wrapper: createWrapper(client) }
    );

    await waitFor(() => {
      expect(result.current.mediaNote.hasNote).toBe(true);
      expect(result.current.mediaNote.note?.content).toBe('Old content');
    });

    act(() => {
      result.current.saveNote.mutate({
        mediaType: 'movie',
        mediaId: 123,
        content: 'Updated content',
        posterPath: null,
        mediaTitle: 'Movie 123',
      });
    });

    await waitFor(() => {
      const cachedNote = client.getQueryData<Note | null>(getMovieNoteKey(123));
      expect(cachedNote?.content).toBe('Updated content');
      expect(cachedNote?.createdAt.getTime()).toBe(existingNote.createdAt.getTime());
    });

    await act(async () => {
      saveDeferred.resolve(undefined);
      await saveDeferred.promise;
    });
  });

  it('delete note sets hasNote false immediately', async () => {
    const client = createQueryClient();
    const existingNote = createNote({
      id: 'movie-123',
      mediaType: 'movie',
      mediaId: 123,
      content: 'Existing note',
      mediaTitle: 'Movie 123',
    });
    const deleteDeferred = createDeferred<void>();
    mockDeleteNote.mockReturnValueOnce(deleteDeferred.promise);
    mockGetNote.mockResolvedValue(existingNote);

    client.setQueryData(getMovieNoteKey(123), existingNote);
    client.setQueryData(getNotesKey(), [existingNote]);

    const { result } = renderHook(
      () => ({
        mediaNote: useMediaNote('movie', 123),
        deleteNote: useDeleteNote(),
      }),
      { wrapper: createWrapper(client) }
    );

    await waitFor(() => {
      expect(result.current.mediaNote.hasNote).toBe(true);
    });

    act(() => {
      result.current.deleteNote.mutate({
        mediaType: 'movie',
        mediaId: 123,
      });
    });

    await waitFor(() => {
      expect(result.current.mediaNote.hasNote).toBe(false);
      expect(client.getQueryData(getMovieNoteKey(123))).toBeNull();
    });

    await act(async () => {
      deleteDeferred.resolve(undefined);
      await deleteDeferred.promise;
    });
  });

  it('save note rollback restores previous state on error', async () => {
    const client = createQueryClient();
    const existingNote = createNote({
      id: 'movie-123',
      mediaType: 'movie',
      mediaId: 123,
      content: 'Stable content',
      mediaTitle: 'Movie 123',
    });
    mockGetNote.mockResolvedValue(existingNote);
    mockSaveNote.mockRejectedValueOnce(new Error('save failed'));

    client.setQueryData(getMovieNoteKey(123), existingNote);
    client.setQueryData(getNotesKey(), [existingNote]);

    const { result } = renderHook(
      () => ({
        mediaNote: useMediaNote('movie', 123),
        saveNote: useSaveNote(),
      }),
      { wrapper: createWrapper(client) }
    );

    await waitFor(() => {
      expect(result.current.mediaNote.note?.content).toBe('Stable content');
    });

    await act(async () => {
      await expect(
        result.current.saveNote.mutateAsync({
          mediaType: 'movie',
          mediaId: 123,
          content: 'Broken update',
          posterPath: null,
          mediaTitle: 'Movie 123',
        })
      ).rejects.toThrow('save failed');
    });

    await waitFor(() => {
      expect(result.current.mediaNote.hasNote).toBe(true);
      expect(result.current.mediaNote.note?.content).toBe('Stable content');
    });
  });

  it('delete note rollback restores previous state on error', async () => {
    const client = createQueryClient();
    const existingNote = createNote({
      id: 'movie-123',
      mediaType: 'movie',
      mediaId: 123,
      content: 'Keep me',
      mediaTitle: 'Movie 123',
    });
    mockGetNote.mockResolvedValue(existingNote);
    mockDeleteNote.mockRejectedValueOnce(new Error('delete failed'));

    client.setQueryData(getMovieNoteKey(123), existingNote);
    client.setQueryData(getNotesKey(), [existingNote]);

    const { result } = renderHook(
      () => ({
        mediaNote: useMediaNote('movie', 123),
        deleteNote: useDeleteNote(),
      }),
      { wrapper: createWrapper(client) }
    );

    await waitFor(() => {
      expect(result.current.mediaNote.hasNote).toBe(true);
    });

    await act(async () => {
      await expect(
        result.current.deleteNote.mutateAsync({
          mediaType: 'movie',
          mediaId: 123,
        })
      ).rejects.toThrow('delete failed');
    });

    await waitFor(() => {
      expect(result.current.mediaNote.hasNote).toBe(true);
      expect(result.current.mediaNote.note?.content).toBe('Keep me');
    });
  });

  it('episode note uses episode key/id and updates only that entry', async () => {
    const client = createQueryClient();
    const episode1Note = createNote({
      id: 'episode-100-1-1',
      mediaType: 'episode',
      mediaId: 100,
      seasonNumber: 1,
      episodeNumber: 1,
      content: 'Episode 1 note',
      mediaTitle: 'Episode 1',
    });
    const episode2Note = createNote({
      id: 'episode-100-1-2',
      mediaType: 'episode',
      mediaId: 100,
      seasonNumber: 1,
      episodeNumber: 2,
      content: 'Episode 2 note',
      mediaTitle: 'Episode 2',
    });
    const saveDeferred = createDeferred<void>();
    mockSaveNote.mockReturnValueOnce(saveDeferred.promise);
    mockGetNote.mockResolvedValue(episode1Note);

    client.setQueryData(getEpisodeNoteKey(100, 1, 1), episode1Note);
    client.setQueryData(getEpisodeNoteKey(100, 1, 2), episode2Note);
    client.setQueryData(getNotesKey(), [episode1Note, episode2Note]);

    const { result } = renderHook(
      () => ({
        mediaNote: useMediaNote('episode', 100, 1, 1),
        saveNote: useSaveNote(),
      }),
      { wrapper: createWrapper(client) }
    );

    await waitFor(() => {
      expect(result.current.mediaNote.note?.id).toBe('episode-100-1-1');
    });

    act(() => {
      result.current.saveNote.mutate({
        mediaType: 'episode',
        mediaId: 100,
        seasonNumber: 1,
        episodeNumber: 1,
        content: 'Updated episode 1 note',
        posterPath: null,
        mediaTitle: 'Episode 1',
        showId: 100,
      });
    });

    await waitFor(() => {
      const updatedEpisode1 = client.getQueryData<Note | null>(getEpisodeNoteKey(100, 1, 1));
      const untouchedEpisode2 = client.getQueryData<Note | null>(getEpisodeNoteKey(100, 1, 2));
      expect(updatedEpisode1?.id).toBe('episode-100-1-1');
      expect(updatedEpisode1?.content).toBe('Updated episode 1 note');
      expect(untouchedEpisode2?.content).toBe('Episode 2 note');
    });

    await act(async () => {
      saveDeferred.resolve(undefined);
      await saveDeferred.promise;
    });
  });

  it('uses notes-list cache fallback when detail note query is disabled', async () => {
    const client = createQueryClient();
    const listCachedNote = createNote({
      id: 'movie-777',
      mediaType: 'movie',
      mediaId: 777,
      content: 'List cached note',
      mediaTitle: 'Movie 777',
    });

    mockCanUseNonCriticalRead.mockReturnValue(false);
    client.setQueryData(getNotesKey(), [listCachedNote]);

    const { result } = renderHook(() => useMediaNote('movie', 777), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.hasNote).toBe(true);
      expect(result.current.note?.content).toBe('List cached note');
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockGetNote).not.toHaveBeenCalled();
  });

  it('ensureNoteLoadedForEdit fetches missing note on demand and updates cache', async () => {
    const client = createQueryClient();
    const fetchedNote = createNote({
      id: 'movie-456',
      mediaType: 'movie',
      mediaId: 456,
      content: 'Fetched on demand',
      mediaTitle: 'Movie 456',
    });

    mockCanUseNonCriticalRead.mockReturnValue(false);
    mockGetNote.mockResolvedValueOnce(fetchedNote);

    const { result } = renderHook(() => useMediaNote('movie', 456), {
      wrapper: createWrapper(client),
    });

    let ensuredNote: Note | null | undefined;
    await act(async () => {
      ensuredNote = await result.current.ensureNoteLoadedForEdit();
    });

    expect(ensuredNote).toEqual(fetchedNote);
    expect(client.getQueryData(getMovieNoteKey(456))).toEqual(fetchedNote);
    expect(mockGetNote).toHaveBeenCalledTimes(1);
  });

  it('ensureNoteLoadedForEdit propagates errors and keeps note state safe', async () => {
    const client = createQueryClient();

    mockCanUseNonCriticalRead.mockReturnValue(false);
    mockGetNote.mockRejectedValueOnce(new Error('note fetch failed'));

    const { result } = renderHook(() => useMediaNote('movie', 999), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await expect(result.current.ensureNoteLoadedForEdit()).rejects.toThrow('note fetch failed');
    });

    expect(result.current.hasNote).toBe(false);
    expect(result.current.note).toBeNull();
  });
});
