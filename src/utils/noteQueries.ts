export type NoteMediaType = 'movie' | 'tv' | 'episode';

export const getNotesQueryKey = (userId: string | undefined) => ['notes', userId] as const;

export const getMediaNoteQueryKey = (
  userId: string | undefined,
  mediaType: NoteMediaType,
  mediaId: number,
  seasonNumber?: number,
  episodeNumber?: number
) =>
  ['note', userId, mediaType, mediaId, seasonNumber ?? null, episodeNumber ?? null] as const;
