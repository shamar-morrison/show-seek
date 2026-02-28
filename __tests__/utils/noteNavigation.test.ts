import { Note } from '@/src/types/note';
import { getMediaNoteQueryKey } from '@/src/utils/noteQueries';
import { navigateFromLibraryNote } from '@/src/utils/noteNavigation';
import { QueryClient } from '@tanstack/react-query';

const createNote = (overrides: Partial<Note>): Note => ({
  id: 'movie-1',
  userId: 'user-1',
  mediaType: 'movie',
  mediaId: 1,
  content: 'Test note',
  posterPath: null,
  mediaTitle: 'Test Title',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('navigateFromLibraryNote', () => {
  it('seeds movie note cache before pushing route', () => {
    const queryClient = new QueryClient();
    const push = jest.fn();
    const note = createNote({
      id: 'movie-10',
      mediaType: 'movie',
      mediaId: 10,
      mediaTitle: 'Movie 10',
    });

    const setQuerySpy = jest.spyOn(queryClient, 'setQueryData');

    const path = navigateFromLibraryNote({
      note,
      currentTab: 'library',
      queryClient,
      push,
    });

    expect(path).toBe('/(tabs)/library/movie/10');
    expect(push).toHaveBeenCalledWith('/(tabs)/library/movie/10');
    expect(queryClient.getQueryData(getMediaNoteQueryKey('user-1', 'movie', 10, undefined, undefined))).toEqual(
      note
    );
    expect(setQuerySpy.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0]);
  });

  it('navigates tv notes and caches the note payload', () => {
    const queryClient = new QueryClient();
    const push = jest.fn();
    const note = createNote({
      id: 'tv-42',
      mediaType: 'tv',
      mediaId: 42,
      mediaTitle: 'TV 42',
    });

    const path = navigateFromLibraryNote({
      note,
      currentTab: 'discover',
      queryClient,
      push,
    });

    expect(path).toBe('/(tabs)/discover/tv/42');
    expect(push).toHaveBeenCalledWith('/(tabs)/discover/tv/42');
    expect(queryClient.getQueryData(getMediaNoteQueryKey('user-1', 'tv', 42, undefined, undefined))).toEqual(
      note
    );
  });

  it('navigates episode notes with show/season/episode metadata and caches the note payload', () => {
    const queryClient = new QueryClient();
    const push = jest.fn();
    const note = createNote({
      id: 'episode-100-2-3',
      mediaType: 'episode',
      mediaId: 100,
      showId: 100,
      seasonNumber: 2,
      episodeNumber: 3,
      mediaTitle: 'Episode 3',
    });

    const path = navigateFromLibraryNote({
      note,
      currentTab: 'home',
      queryClient,
      push,
    });

    expect(path).toBe('/(tabs)/home/tv/100/season/2/episode/3');
    expect(push).toHaveBeenCalledWith('/(tabs)/home/tv/100/season/2/episode/3');
    expect(queryClient.getQueryData(getMediaNoteQueryKey('user-1', 'episode', 100, 2, 3))).toEqual(
      note
    );
  });

  it('does not navigate or seed cache when current tab is missing', () => {
    const queryClient = new QueryClient();
    const push = jest.fn();
    const onMissingTab = jest.fn();
    const note = createNote({
      id: 'movie-20',
      mediaType: 'movie',
      mediaId: 20,
    });

    const path = navigateFromLibraryNote({
      note,
      currentTab: null,
      queryClient,
      push,
      onMissingTab,
    });

    expect(path).toBeNull();
    expect(onMissingTab).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(getMediaNoteQueryKey('user-1', 'movie', 20, undefined, undefined))).toBeUndefined();
  });

  it('does not navigate or seed cache for malformed episode notes', () => {
    const queryClient = new QueryClient();
    const push = jest.fn();
    const onInvalidEpisodeNote = jest.fn();
    const note = createNote({
      id: 'episode-100-2-3',
      mediaType: 'episode',
      mediaId: 100,
      showId: undefined,
      seasonNumber: 2,
      episodeNumber: 3,
    });

    const path = navigateFromLibraryNote({
      note,
      currentTab: 'library',
      queryClient,
      push,
      onInvalidEpisodeNote,
    });

    expect(path).toBeNull();
    expect(onInvalidEpisodeNote).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(getMediaNoteQueryKey('user-1', 'episode', 100, 2, 3))).toBeUndefined();
  });
});
