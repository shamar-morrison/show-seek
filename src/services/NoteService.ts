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
   * Format: "{mediaType}-{mediaId}" (e.g., "movie-550", "tv-1396")
   */
  private getNoteId(mediaType: 'movie' | 'tv', mediaId: number): string {
    return `${mediaType}-${mediaId}`;
  }

  /**
   * Get reference to a specific note document
   */
  private getNoteRef(userId: string, mediaType: 'movie' | 'tv', mediaId: number) {
    const noteId = this.getNoteId(mediaType, mediaId);
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
      mediaType: data.mediaType as 'movie' | 'tv',
      mediaId: data.mediaId as number,
      content: data.content as string,
      posterPath: (data.posterPath as string | null) ?? null,
      mediaTitle: data.mediaTitle as string,
      createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.() || new Date(),
      updatedAt: (data.updatedAt as { toDate?: () => Date })?.toDate?.() || new Date(),
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
        if (onError) {
          onError(new Error(message));
        }
        callback([]);
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

      const noteRef = this.getNoteRef(userId, noteData.mediaType, noteData.mediaId);
      const existingNote = await Promise.race([getDoc(noteRef), createTimeout()]);

      const now = Timestamp.now();
      const noteDocument = {
        id: this.getNoteId(noteData.mediaType, noteData.mediaId),
        userId,
        mediaType: noteData.mediaType,
        mediaId: noteData.mediaId,
        content: noteData.content,
        posterPath: noteData.posterPath,
        mediaTitle: noteData.mediaTitle,
        createdAt: existingNote.exists() ? existingNote.data().createdAt : now,
        updatedAt: now,
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
  async getNote(userId: string, mediaType: 'movie' | 'tv', mediaId: number): Promise<Note | null> {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) return null;

      const noteRef = this.getNoteRef(userId, mediaType, mediaId);

      const docSnap = await Promise.race([getDoc(noteRef), createTimeout()]);

      if (docSnap.exists()) {
        return this.mapDocToNote(docSnap);
      }

      return null;
    } catch (error) {
      console.error('[NoteService] getNote error:', error);
      return null;
    }
  }

  /**
   * Get all notes for a user, ordered by createdAt descending
   */
  async getNotes(userId: string): Promise<Note[]> {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) return [];

      const notesRef = this.getNotesCollection(userId);
      const q = query(notesRef, orderBy('createdAt', 'desc'));

      const snapshot = await Promise.race([getDocs(q), createTimeout()]);

      return snapshot.docs.map((doc) => this.mapDocToNote(doc));
    } catch (error) {
      console.error('[NoteService] getNotes error:', error);
      return [];
    }
  }

  /**
   * Delete a note for a media item
   */
  async deleteNote(userId: string, mediaType: 'movie' | 'tv', mediaId: number): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      const noteRef = this.getNoteRef(userId, mediaType, mediaId);

      await Promise.race([deleteDoc(noteRef), createTimeout()]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[NoteService] deleteNote error:', error);
      throw new Error(message);
    }
  }
}

export const noteService = new NoteService();
