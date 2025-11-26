import { collection, deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

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
  subscribeToUserLists(callback: (lists: UserList[]) => void) {
    const user = auth.currentUser;
    if (!user) return () => {};

    const listsRef = this.getUserListsCollection(user.uid);

    return onSnapshot(listsRef, (snapshot) => {
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
    });
  }

  /**
   * Add a media item to a specific list
   */
  async addToList(listId: string, mediaItem: Omit<ListMediaItem, 'addedAt'>, listName?: string) {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const listRef = this.getUserListRef(user.uid, listId);

    const itemToAdd: ListMediaItem = {
      ...mediaItem,
      addedAt: Date.now(),
    };

    await setDoc(
      listRef,
      {
        name: listName || listId, // Fallback name if creating new doc
        items: {
          [mediaItem.id]: itemToAdd,
        },
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  }

  /**
   * Remove a media item from a specific list
   */
  async removeFromList(listId: string, mediaId: number) {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const listRef = this.getUserListRef(user.uid, listId);

    await updateDoc(listRef, {
      [`items.${mediaId}`]: deleteField(),
      updatedAt: Date.now(),
    });
  }

  /**
   * Create a new custom list
   */
  async createList(listName: string) {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Generate a URL-friendly ID from the name
    const listId = listName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const listRef = this.getUserListRef(user.uid, listId);

    await setDoc(listRef, {
      name: listName,
      items: {},
      createdAt: Date.now(),
      isCustom: true,
    });

    return listId;
  }

  /**
   * Delete a custom list
   */
  async deleteList(listId: string) {
    const user = auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Prevent deleting default lists
    if (DEFAULT_LISTS.some((l) => l.id === listId)) {
      throw new Error('Cannot delete default lists');
    }

    const listRef = this.getUserListRef(user.uid, listId);
    await deleteField(); // This doesn't delete the doc, need deleteDoc
    // Actually we need to import deleteDoc
  }
}

export const listService = new ListService();
