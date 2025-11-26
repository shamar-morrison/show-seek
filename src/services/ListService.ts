import { FirebaseError } from 'firebase/app';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

// Error message mapping for user-friendly feedback
const getFirestoreErrorMessage = (error: unknown): string => {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'permission-denied':
        return 'You do not have permission to perform this action';
      case 'unavailable':
        return 'Network error. Please check your connection';
      case 'not-found':
        return 'The requested list was not found';
      case 'already-exists':
        return 'A list with this name already exists';
      case 'deadline-exceeded':
        return 'Request timed out. Please try again';
      case 'resource-exhausted':
        return 'Too many requests. Please wait a moment';
      default:
        return `Database error: ${error.message}`;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

export interface ListMediaItem {
  id: number;
  title: string;
  poster_path: string | null;
  media_type: 'movie' | 'tv';
  vote_average: number;
  release_date: string;
  addedAt: number;
}

export interface UserList {
  id: string;
  name: string;
  items: Record<string, ListMediaItem>;
  createdAt: number;
}

export const DEFAULT_LISTS = [
  { id: 'favorites', name: 'Favorites' },
  { id: 'watchlist', name: 'Should Watch' },
  { id: 'dropped', name: 'Dropped' },
];

class ListService {
  private getUserListRef(userId: string, listId: string) {
    return doc(db, 'users', userId, 'lists', listId);
  }

  private getUserListsCollection(userId: string) {
    return collection(db, 'users', userId, 'lists');
  }

  /**
   * Subscribe to all lists for the current user
   */
  subscribeToUserLists(callback: (lists: UserList[]) => void, onError?: (error: Error) => void) {
    const user = auth.currentUser;
    if (!user) return () => {};

    const listsRef = this.getUserListsCollection(user.uid);

    return onSnapshot(
      listsRef,
      (snapshot) => {
        const lists: UserList[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as UserList[];

        // Ensure default lists exist in the output even if not in DB yet
        const mergedLists = [...lists];

        DEFAULT_LISTS.forEach((defaultList) => {
          if (!mergedLists.find((l) => l.id === defaultList.id)) {
            mergedLists.push({
              id: defaultList.id,
              name: defaultList.name,
              items: {},
              createdAt: Date.now(),
            });
          }
        });

        callback(mergedLists);
      },
      (error) => {
        console.error('[ListService] Subscription error:', error);
        const message = getFirestoreErrorMessage(error);
        if (onError) {
          onError(new Error(message));
        }
        // Graceful degradation: show default lists
        callback(
          DEFAULT_LISTS.map((defaultList) => ({
            id: defaultList.id,
            name: defaultList.name,
            items: {},
            createdAt: Date.now(),
          }))
        );
      }
    );
  }

  /**
   * Add a media item to a specific list
   */
  async addToList(listId: string, mediaItem: Omit<ListMediaItem, 'addedAt'>, listName?: string) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');

      const listRef = this.getUserListRef(user.uid, listId);

      const itemToAdd: ListMediaItem = {
        ...mediaItem,
        addedAt: Date.now(),
      };

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([
        setDoc(
          listRef,
          {
            name: listName || listId, // Fallback name if creating new doc
            items: {
              [mediaItem.id]: itemToAdd,
            },
            createdAt: Date.now(), // Required by security rules when document doesn't exist
            updatedAt: Date.now(),
          },
          { merge: true }
        ),
        timeoutPromise,
      ]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[ListService] addToList error:', error);
      throw new Error(message);
    }
  }

  /**
   * Remove a media item from a specific list
   */
  async removeFromList(listId: string, mediaId: number) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');

      const listRef = this.getUserListRef(user.uid, listId);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([
        updateDoc(listRef, {
          [`items.${mediaId}`]: deleteField(),
          updatedAt: Date.now(),
        }),
        timeoutPromise,
      ]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[ListService] removeFromList error:', error);
      throw new Error(message);
    }
  }

  /**
   * Create a new custom list
   */
  async createList(listName: string) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');

      // Generate a URL-friendly ID from the name
      const baseId = listName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let listId = baseId;
      let attempts = 0;
      const maxAttempts = 5;

      // Check for collisions and generate unique ID
      while (attempts < maxAttempts) {
        const listRef = this.getUserListRef(user.uid, listId);
        const docSnap = await getDoc(listRef);

        if (!docSnap.exists()) {
          // ID is unique, proceed with creation
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timed out')), 10000);
          });

          await Promise.race([
            setDoc(listRef, {
              name: listName,
              items: {},
              createdAt: Date.now(),
              isCustom: true,
            }),
            timeoutPromise,
          ]);

          return listId;
        }

        // ID collision, append random suffix and try again
        attempts++;
        const suffix = Math.random().toString(36).substring(2, 6);
        listId = `${baseId}-${suffix}`;
      }

      throw new Error('Could not generate a unique list ID after multiple attempts');
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[ListService] createList error:', error);
      throw new Error(message);
    }
  }

  /**
   * Delete a custom list
   */
  async deleteList(listId: string) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');

      // Prevent deleting default lists
      if (DEFAULT_LISTS.some((l) => l.id === listId)) {
        throw new Error('Cannot delete default lists');
      }

      const listRef = this.getUserListRef(user.uid, listId);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([deleteDoc(listRef), timeoutPromise]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[ListService] deleteList error:', error);
      throw new Error(message);
    }
  }
}

export const listService = new ListService();
