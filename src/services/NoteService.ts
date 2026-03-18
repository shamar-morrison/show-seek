import {
  auditedGetDoc,
  auditedGetDocs,
} from '@/src/services/firestoreReadAudit';
import {
  createServiceLogger,
  getSignedInUser,
  requireMatchingUser,
  rethrowFirestoreError,
} from '@/src/services/serviceSupport';
import { Note, NoteInput } from '@/src/types/note';
import { raceWithTimeout } from '@/src/utils/timeout';
import {
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';

class NoteService {
  private logDebug = createServiceLogger('NoteService');

  /**
   * Generate note document ID
   * Format: "{mediaType}-{mediaId}" (e.g., "movie-550", "tv-1396", "episode-tvId-season-episode")
   */
  private getNoteId(
    mediaType: 'movie' | 'tv' | 'episode',
    mediaId: number,
    season?: number,
    episode?: number
  ): string {
    if (mediaType === 'episode') {
      if (season === undefined || episode === undefined) {
        throw new Error('Missing season/episode for episode mediaType');
      }
      return `episode-${mediaId}-${season}-${episode}`;
    }
    return `${mediaType}-${mediaId}`;
  }

  /**
   * Get reference to a specific note document
   */
  private getNoteRef(
    userId: string,
    mediaType: 'movie' | 'tv' | 'episode',
    mediaId: number,
    season?: number,
    episode?: number
  ) {
    const noteId = this.getNoteId(mediaType, mediaId, season, episode);
    return doc(db, 'users', userId, 'notes', noteId);
  }

  /**
   * Get reference to user's notes collection
   */
  private getNotesCollection(userId: string) {
    return collection(db, 'users', userId, 'notes');
  }

  /**
   * Map a Firestore document to a Note object
   */
  private mapDocToNote(doc: { id: string; data: () => Record<string, unknown> }): Note {
    const data = doc.data();
    return {
      id: doc.id,
      userId: data.userId as string,
      mediaType: data.mediaType as 'movie' | 'tv' | 'episode',
      mediaId: data.mediaId as number,
      content: data.content as string,
      posterPath: (data.posterPath as string | null) ?? null,
      mediaTitle: data.mediaTitle as string,
      originalTitle: data.originalTitle as string | undefined,
      createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() || new Date(),
      updatedAt: (data.updatedAt as { toDate?: () => Date })?.toDate?.() || new Date(),
      seasonNumber: data.seasonNumber as number | undefined,
      episodeNumber: data.episodeNumber as number | undefined,
      showId: data.showId as number | undefined,
    };
  }

  async getUserNotes(userId: string): Promise<Note[]> {
    try {
      const user = getSignedInUser();
      if (!user || user.uid !== userId) {
        return [];
      }

      this.logDebug('getUserNotes:start', {
        userId,
        path: `users/${userId}/notes`,
      });

      const notesRef = this.getNotesCollection(userId);
      const q = query(notesRef, orderBy('createdAt', 'desc'));
      const snapshot = await raceWithTimeout(
        auditedGetDocs(q, {
          path: `users/${userId}/notes`,
          queryKey: 'notes',
          callsite: 'NoteService.getUserNotes',
        }),
      );

      const notes = snapshot.docs.map((noteDoc) => this.mapDocToNote(noteDoc));
      this.logDebug('getUserNotes:result', {
        userId,
        docCount: snapshot.size,
        resultCount: notes.length,
      });
      return notes;
    } catch (error) {
      this.logDebug('getUserNotes:error', {
        userId,
        error,
      });
      return rethrowFirestoreError('NoteService.getUserNotes', error);
    }
  }

  /**
   * Save or update a note for a media item
   */
  async saveNote(userId: string, noteData: NoteInput): Promise<void> {
    try {
      requireMatchingUser(userId);

      const noteRef = this.getNoteRef(
        userId,
        noteData.mediaType,
        noteData.mediaId,
        noteData.seasonNumber,
        noteData.episodeNumber
      );
      const existingNote = await raceWithTimeout(
        auditedGetDoc(noteRef, {
          path: `users/${userId}/notes/${noteRef.id}`,
          queryKey: 'noteById',
          callsite: 'NoteService.saveNote',
        }),
      );

      const now = Timestamp.now();
      const noteDocument = {
        userId,
        mediaType: noteData.mediaType,
        mediaId: noteData.mediaId,
        content: noteData.content,
        posterPath: noteData.posterPath ?? null,
        mediaTitle: noteData.mediaTitle,
        ...(noteData.originalTitle !== undefined && { originalTitle: noteData.originalTitle }),
        createdAt: existingNote.exists() ? existingNote.data().createdAt : now,
        updatedAt: now,
        // Optional episode fields
        ...(noteData.seasonNumber !== undefined && { seasonNumber: noteData.seasonNumber }),
        ...(noteData.episodeNumber !== undefined && { episodeNumber: noteData.episodeNumber }),
        ...(noteData.showId !== undefined && { showId: noteData.showId }),
      };

      await raceWithTimeout(setDoc(noteRef, noteDocument));
    } catch (error) {
      return rethrowFirestoreError('NoteService.saveNote', error);
    }
  }

  /**
   * Get a single note for a media item
   */
  async getNote(
    userId: string,
    mediaType: 'movie' | 'tv' | 'episode',
    mediaId: number,
    season?: number,
    episode?: number
  ): Promise<Note | null> {
    try {
      const user = getSignedInUser();
      if (!user || user.uid !== userId) {
        return null;
      }

      const noteRef = this.getNoteRef(userId, mediaType, mediaId, season, episode);
      this.logDebug('getNote:start', {
        userId,
        mediaType,
        mediaId,
        season: season ?? null,
        episode: episode ?? null,
        path: `users/${userId}/notes/${noteRef.id}`,
      });

      const docSnap = await raceWithTimeout(
        auditedGetDoc(noteRef, {
          path: `users/${userId}/notes/${noteRef.id}`,
          queryKey: 'noteById',
          callsite: 'NoteService.getNote',
        }),
      );

      if (docSnap.exists()) {
        const note = this.mapDocToNote(docSnap);
        this.logDebug('getNote:result', {
          userId,
          mediaType,
          mediaId,
          exists: true,
        });
        return note;
      }

      this.logDebug('getNote:result', {
        userId,
        mediaType,
        mediaId,
        exists: false,
      });

      return null;
    } catch (error) {
      this.logDebug('getNote:error', {
        userId,
        mediaType,
        mediaId,
        season: season ?? null,
        episode: episode ?? null,
        error,
      });
      return rethrowFirestoreError('NoteService.getNote', error);
    }
  }

  /**
   * Delete a note for a media item
   */
  async deleteNote(
    userId: string,
    mediaType: 'movie' | 'tv' | 'episode',
    mediaId: number,
    season?: number,
    episode?: number
  ): Promise<void> {
    try {
      requireMatchingUser(userId);

      const noteRef = this.getNoteRef(userId, mediaType, mediaId, season, episode);

      await raceWithTimeout(deleteDoc(noteRef));
    } catch (error) {
      return rethrowFirestoreError('NoteService.deleteNote', error);
    }
  }
}

export const noteService = new NoteService();
