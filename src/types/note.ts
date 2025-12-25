/**
 * Note type definitions for the Notes feature
 */

export interface Note {
  id: string;
  userId: string;
  mediaType: 'movie' | 'tv';
  mediaId: number;
  content: string;
  posterPath: string | null;
  mediaTitle: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NoteInput {
  mediaType: 'movie' | 'tv';
  mediaId: number;
  content: string;
  posterPath: string | null;
  mediaTitle: string;
}
