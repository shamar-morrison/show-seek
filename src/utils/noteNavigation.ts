import { Note } from '@/src/types/note';
import { getMediaNoteQueryKey } from '@/src/utils/noteQueries';
import { QueryClient } from '@tanstack/react-query';

export const getNoteDetailPath = (note: Note, currentTab: string): string | null => {
  if (note.mediaType === 'episode') {
    if (note.seasonNumber === undefined || note.episodeNumber === undefined) {
      return null;
    }

    const showOrMediaId = note.showId ?? note.mediaId;
    if (showOrMediaId === undefined) {
      return null;
    }

    return `/(tabs)/${currentTab}/tv/${showOrMediaId}/season/${note.seasonNumber}/episode/${note.episodeNumber}`;
  }

  const mediaPath = note.mediaType === 'movie' ? 'movie' : 'tv';
  return `/(tabs)/${currentTab}/${mediaPath}/${note.mediaId}`;
};

export const seedMediaNoteCacheFromLibraryNote = (queryClient: QueryClient, note: Note) => {
  queryClient.setQueryData<Note | null>(
    getMediaNoteQueryKey(
      note.userId,
      note.mediaType,
      note.mediaId,
      note.seasonNumber,
      note.episodeNumber
    ),
    note
  );
};

export const navigateFromLibraryNote = ({
  note,
  currentTab,
  queryClient,
  push,
  onMissingTab,
  onInvalidEpisodeNote,
}: {
  note: Note;
  currentTab: string | null;
  queryClient: QueryClient;
  push: (path: string) => void;
  onMissingTab?: () => void;
  onInvalidEpisodeNote?: () => void;
}): string | null => {
  if (!currentTab) {
    onMissingTab?.();
    return null;
  }

  const path = getNoteDetailPath(note, currentTab);
  if (!path) {
    onInvalidEpisodeNote?.();
    return null;
  }

  seedMediaNoteCacheFromLibraryNote(queryClient, note);
  push(path);
  return path;
};
