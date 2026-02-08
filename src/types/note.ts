/**
 * Note type definitions for the Notes feature
 */

export interface Note {
  id: string;
  userId: string;
  mediaType: 'movie' | 'tv' | 'episode';
  mediaId: number;
  content: string;
  posterPath: string | null;
  mediaTitle: string;
  createdAt: Date;
  updatedAt: Date;
  // Episode specific fields
  seasonNumber?: number;
  episodeNumber?: number;
  showId?: number;
}

export interface NoteInput {
  mediaType: 'movie' | 'tv' | 'episode';
  mediaId: number;
  content: string;
  posterPath: string | null;
  mediaTitle: string;
  // Episode specific fields
  seasonNumber?: number;
  episodeNumber?: number;
  showId?: number;
}
