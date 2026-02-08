import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { Note, NoteInput } from '@/src/types/note';
import { createTimeout } from '@/src/utils/timeout';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

class NoteService {
  /**
   * Generate note document ID
   * Format: "{mediaType}-{mediaId}" (e.g., "movie-550", "tv-1396", "episode-tvId-season-episode")
   */
  private getNoteId(mediaType: 'movie' | 'tv' | 'episode', mediaId: number, season?: number, episode?: number): string {
    if (mediaType === 'episode' && season !== undefined && episode !== undefined) {
      return `episode-${mediaId}-${season}-${episode}`;
    }
    return `${mediaType}-${mediaId}`;
  }

  /**
   * Get reference to a specific note document
   */
  private getNoteRef(userId: string, mediaType: 'movie' | 'tv' | 'episode', mediaId: number, season?: number, episode?: number) {
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
      createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() || new Date(),
      updatedAt: (data.updatedAt as { toDate?: () => Date })?.toDate?.() || new Date(),
      seasonNumber: data.seasonNumber as number | undefined,
      episodeNumber: data.episodeNumber as number | undefined,
      showId: data.showId as number | undefined,
    };
  }

  /**
   * Subscribe to all notes for a user (real-time updates)
   * @param userId - The user's ID to subscribe for
   * @param callback - Called with notes array on each update
   * @param onError - Optional error handler
   */
  subscribeToUserNotes(
    userId: string,
    callback: (notes: Note[]) => void,
    onError?: (error: Error) => void
  ) {
    if (!userId) return () => {};

    const notesRef = this.getNotesCollection(userId);
    const q = query(notesRef, orderBy('createdAt', 'desc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const notes: Note[] = snapshot.docs.map((doc) => this.mapDocToNote(doc));
        callback(notes);
      },
      (error) => {
        console.error('[NoteService] Subscription error:', error);
        const message = getFirestoreErrorMessage(error);
        // Don't call callback([]) here - preserve existing notes on transient errors
        // Let the consumer decide whether to clear the cache via onError
        if (onError) {
          onError(new Error(message));
        }
      }
    );
  }

  /**
   * Save or update a note for a media item
   */
  async saveNote(userId: string, noteData: NoteInput): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      const noteRef = this.getNoteRef(
        userId, 
        noteData.mediaType, 
        noteData.mediaId, 
        noteData.seasonNumber, 
        noteData.episodeNumber
      );
      const existingNote = await Promise.race([getDoc(noteRef), createTimeout()]);

      const now = Timestamp.now();
      const noteDocument = {
        userId,
        mediaType: noteData.mediaType,
        mediaId: noteData.mediaId,
        content: noteData.content,
        posterPath: noteData.posterPath ?? null,
        mediaTitle: noteData.mediaTitle,
        createdAt: existingNote.exists() ? existingNote.data().createdAt : now,
        updatedAt: now,
        // Optional episode fields
        ...(noteData.seasonNumber !== undefined && { seasonNumber: noteData.seasonNumber }),
        ...(noteData.episodeNumber !== undefined && { episodeNumber: noteData.episodeNumber }),
        ...(noteData.showId !== undefined && { showId: noteData.showId }),
      };

      await Promise.race([setDoc(noteRef, noteDocument), createTimeout()]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[NoteService] saveNote error:', error);
      throw new Error(message);
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
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      const noteRef = this.getNoteRef(userId, mediaType, mediaId, season, episode);

      const docSnap = await Promise.race([getDoc(noteRef), createTimeout()]);

      if (docSnap.exists()) {
        return this.mapDocToNote(docSnap);
      }

      return null;
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[NoteService] getNote error:', error);
      throw new Error(message);
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
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      const noteRef = this.getNoteRef(userId, mediaType, mediaId, season, episode);

      await Promise.race([deleteDoc(noteRef), createTimeout()]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[NoteService] deleteNote error:', error);
      throw new Error(message);
    }
  }
}

export const noteService = new NoteService();
