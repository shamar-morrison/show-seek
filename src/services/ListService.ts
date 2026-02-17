import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import {
  auditedGetDoc,
  auditedGetDocs,
} from '@/src/services/firestoreReadAudit';
import { createTimeoutWithCleanup } from '@/src/utils/timeout';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export interface ListMediaItem {
  id: number;
  title: string;
  poster_path: string | null;
  media_type: 'movie' | 'tv';
  vote_average: number;
  release_date: string;
  addedAt: number;
  genre_ids?: number[];
  // TV show fields (optional, used when media_type is 'tv')
  name?: string;
  first_air_date?: string;
}

export interface UserList {
  id: string;
  name: string;
  description?: string;
  items: Record<string, ListMediaItem>;
  createdAt: number;
  updatedAt?: number;
}

export type ListMembershipIndex = Record<string, string[]>;

export const DEFAULT_LISTS = [
  { id: 'watchlist', name: 'Should Watch' },
  { id: 'currently-watching', name: 'Watching' },
  { id: 'already-watched', name: 'Already Watched' },
  { id: 'favorites', name: 'Favorites' },
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
   * Remove undefined values from an object to make it Firestore-compatible
   * Firestore doesn't accept undefined values - they must be omitted entirely
   */
  private sanitizeForFirestore<T extends Record<string, any>>(obj: T): Partial<T> {
    const sanitized: any = {};

    Object.keys(obj).forEach((key) => {
      if (obj[key] !== undefined) {
        sanitized[key] = obj[key];
      }
    });

    return sanitized;
  }

  private isCreateFallbackEligibleError(error: unknown): boolean {
    const code = (error as { code?: string })?.code;
    // Intentional: updateDoc on a missing document can surface as permission-denied when
    // rules evaluate resource.data, so we allow fallback from updateDoc to setDoc(..., { merge: true }).
    // This is first-write recovery logic, not a generic auth retry.
    return (
      code === 'not-found' ||
      code === 'firestore/not-found' ||
      code === 'permission-denied' ||
      code === 'firestore/permission-denied'
    );
  }

  async getUserLists(userId: string): Promise<UserList[]> {
    const listsRef = this.getUserListsCollection(userId);
    const timeout = createTimeoutWithCleanup(10000);
    const debugLogsEnabled = __DEV__ && READ_OPTIMIZATION_FLAGS.enableServiceQueryDebugLogs;

    try {
      if (debugLogsEnabled) {
        console.log('[ListService.getUserLists:start]', {
          userId,
          path: `users/${userId}/lists`,
        });
      }

      const snapshot = await Promise.race([
        auditedGetDocs(listsRef, {
          path: `users/${userId}/lists`,
          queryKey: 'lists',
          callsite: 'ListService.getUserLists',
        }),
        timeout.promise,
      ]).finally(() => {
        timeout.cancel();
      });

      const lists: UserList[] = snapshot.docs.map((listDoc) => ({
        id: listDoc.id,
        ...listDoc.data(),
      })) as UserList[];

      const mergedLists = [...lists];

      DEFAULT_LISTS.forEach((defaultList) => {
        if (!mergedLists.find((list) => list.id === defaultList.id)) {
          mergedLists.push({
            id: defaultList.id,
            name: defaultList.name,
            items: {},
            createdAt: Date.now(),
          });
        }
      });

      const defaultListIds = DEFAULT_LISTS.map((list) => list.id);
      mergedLists.sort((a, b) => {
        const aDefaultIndex = defaultListIds.indexOf(a.id);
        const bDefaultIndex = defaultListIds.indexOf(b.id);

        if (aDefaultIndex !== -1 && bDefaultIndex !== -1) {
          return aDefaultIndex - bDefaultIndex;
        }

        if (aDefaultIndex !== -1) return -1;
        if (bDefaultIndex !== -1) return 1;

        return (a.createdAt || 0) - (b.createdAt || 0);
      });

      if (debugLogsEnabled) {
        console.log('[ListService.getUserLists:result]', {
          userId,
          rawDocCount: snapshot.size,
          mergedListCount: mergedLists.length,
          defaultListCount: DEFAULT_LISTS.length,
        });
      }

      return mergedLists;
    } catch (error) {
      if (debugLogsEnabled) {
        console.error('[ListService.getUserLists:error]', {
          userId,
          error,
        });
      }
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Build a cached membership index for list indicators.
   * Key format: "${mediaId}-${mediaType}" => array of list IDs containing the media item.
   */
  async getListMembershipIndex(userId: string): Promise<ListMembershipIndex> {
    const listsRef = this.getUserListsCollection(userId);
    const timeout = createTimeoutWithCleanup(10000);
    const debugLogsEnabled = __DEV__ && READ_OPTIMIZATION_FLAGS.enableServiceQueryDebugLogs;

    try {
      if (debugLogsEnabled) {
        console.log('[ListService.getListMembershipIndex:start]', {
          userId,
          path: `users/${userId}/lists`,
        });
      }

      const snapshot = await Promise.race([
        auditedGetDocs(listsRef, {
          path: `users/${userId}/lists`,
          queryKey: 'list-membership-index',
          callsite: 'ListService.getListMembershipIndex',
        }),
        timeout.promise,
      ]).finally(() => {
        timeout.cancel();
      });

      const index: ListMembershipIndex = {};

      snapshot.docs.forEach((listDoc) => {
        const listId = listDoc.id;
        const listData = listDoc.data() as Partial<UserList>;
        const listItems = listData.items || {};

        Object.values(listItems).forEach((item) => {
          if (!item || typeof item.id !== 'number' || !item.media_type) {
            return;
          }

          const key = `${item.id}-${item.media_type}`;
          const existingListIds = index[key] || [];
          if (!existingListIds.includes(listId)) {
            existingListIds.push(listId);
            index[key] = existingListIds;
          }
        });
      });

      if (debugLogsEnabled) {
        console.log('[ListService.getListMembershipIndex:result]', {
          userId,
          rawDocCount: snapshot.size,
          indexedMediaCount: Object.keys(index).length,
        });
      }

      return index;
    } catch (error) {
      if (debugLogsEnabled) {
        console.error('[ListService.getListMembershipIndex:error]', {
          userId,
          error,
        });
      }
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Add a media item to a specific list
   */
  async addToList(listId: string, mediaItem: Omit<ListMediaItem, 'addedAt'>, listName?: string) {
    let failureStage: 'update' | 'fallback-create' | null = null;

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const listRef = this.getUserListRef(user.uid, listId);

      // Sanitize to remove any undefined values (Firestore doesn't accept undefined)
      const sanitizedItem = this.sanitizeForFirestore(mediaItem);

      const itemToAdd: ListMediaItem = {
        ...sanitizedItem,
        addedAt: Date.now(),
      } as ListMediaItem;

      const now = Date.now();
      const updateTimeout = createTimeoutWithCleanup(10000);

      // Fast path for existing lists: update without a read.
      try {
        await Promise.race([
          updateDoc(listRef, {
            name: listName || listId, // Keep behavior: ensure name exists for system lists
            [`items.${mediaItem.id}`]: itemToAdd,
            updatedAt: now,
          }),
          updateTimeout.promise,
        ]);
        return;
      } catch (error) {
        failureStage = 'update';
        if (!this.isCreateFallbackEligibleError(error)) {
          throw error;
        }
      } finally {
        updateTimeout.cancel();
      }

      // Fallback for first write to a missing list doc with a fresh timeout budget.
      const createTimeout = createTimeoutWithCleanup(10000);
      try {
        await Promise.race([
          setDoc(
            listRef,
            {
              name: listName || listId,
              items: {
                [mediaItem.id]: itemToAdd,
              },
              updatedAt: now,
              createdAt: now,
            },
            { merge: true }
          ),
          createTimeout.promise,
        ]);
      } catch (error) {
        failureStage = 'fallback-create';
        throw error;
      } finally {
        createTimeout.cancel();
      }
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      const firebaseCode = (error as { code?: string })?.code;
      const currentUserId = auth.currentUser?.uid ?? null;
      console.error('[ListService] addToList error:', {
        error,
        code: firebaseCode,
        userId: currentUserId,
        listId,
        mediaId: mediaItem.id,
        stage: failureStage,
      });
      throw new Error(message);
    }
  }

  /**
   * Remove a media item from a specific list
   */
  async removeFromList(listId: string, mediaId: number) {
    const timeout = createTimeoutWithCleanup(10000);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const listRef = this.getUserListRef(user.uid, listId);

      await Promise.race([
        updateDoc(listRef, {
          [`items.${mediaId}`]: deleteField(),
          updatedAt: Date.now(),
        }),
        timeout.promise,
      ]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      const firebaseCode = (error as { code?: string })?.code;
      const currentUserId = auth.currentUser?.uid ?? null;
      console.error('[ListService] removeFromList error:', {
        error,
        code: firebaseCode,
        userId: currentUserId,
        listId,
        mediaId,
      });
      throw new Error(message);
    } finally {
      timeout.cancel();
    }
  }

  /**
   * Create a new custom list
   */
  async createList(listName: string, description?: string) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      // Generate a URL-friendly ID from the name
      const baseId = listName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      let listId = baseId;
      let attempts = 0;
      const maxAttempts = 5;
      const collisionCheckTimeoutMessage = 'List creation collision check timed out';
      const collisionCheckTimeout = createTimeoutWithCleanup(10000, collisionCheckTimeoutMessage);

      try {
        // Check for collisions and generate unique ID
        while (attempts < maxAttempts) {
          const listRef = this.getUserListRef(user.uid, listId);
          const docSnap = await Promise.race([
            auditedGetDoc(listRef, {
              path: `users/${user.uid}/lists/${listId}`,
              queryKey: 'listById',
              callsite: 'ListService.createList',
            }),
            collisionCheckTimeout.promise,
          ]);

          if (!docSnap.exists()) {
            // ID is unique, proceed with creation
            const timeout = createTimeoutWithCleanup(10000);

            const trimmedDescription = description?.trim();
            const listData = this.sanitizeForFirestore({
              name: listName,
              description: trimmedDescription ? trimmedDescription : undefined,
              items: {},
              createdAt: Date.now(),
              isCustom: true,
            });

            try {
              await Promise.race([setDoc(listRef, listData), timeout.promise]);
            } finally {
              timeout.cancel();
            }

            return listId;
          }

          // ID collision, append random suffix and try again
          attempts++;
          const suffix = Math.random().toString(36).substring(2, 6);
          listId = `${baseId}-${suffix}`;
        }
      } finally {
        collisionCheckTimeout.cancel();
      }

      throw new Error('Could not generate a unique list ID after multiple attempts');
    } catch (error) {
      if (error instanceof Error && error.message === 'List creation collision check timed out') {
        throw new Error('Unable to create list right now, please try again');
      }
      const message = getFirestoreErrorMessage(error);
      console.error('[ListService] createList error:', error);
      throw new Error(message);
    }
  }

  /**
   * Delete a custom list
   */
  async deleteList(listId: string) {
    const timeout = createTimeoutWithCleanup(10000);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      // Prevent deleting default lists
      if (DEFAULT_LISTS.some((l) => l.id === listId)) {
        throw new Error('Cannot delete default lists');
      }

      const listRef = this.getUserListRef(user.uid, listId);

      await Promise.race([deleteDoc(listRef), timeout.promise]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[ListService] deleteList error:', error);
      throw new Error(message);
    } finally {
      timeout.cancel();
    }
  }

  /**
   * Rename a custom list
   */
  async renameList(listId: string, newName: string, newDescription?: string) {
    const timeout = createTimeoutWithCleanup(10000);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      // Prevent renaming default lists
      if (DEFAULT_LISTS.some((l) => l.id === listId)) {
        throw new Error('Cannot rename default lists');
      }

      const trimmedName = newName.trim();
      if (!trimmedName) {
        throw new Error('List name cannot be empty');
      }

      const listRef = this.getUserListRef(user.uid, listId);

      // Verify the list exists
      const docSnap = await Promise.race([
        auditedGetDoc(listRef, {
          path: `users/${user.uid}/lists/${listId}`,
          queryKey: 'listById',
          callsite: 'ListService.renameList',
        }),
        timeout.promise,
      ]);
      if (!docSnap.exists()) {
        throw new Error('List not found');
      }

      const trimmedDescription = newDescription?.trim();
      const updateData: Record<string, any> = {
        name: trimmedName,
        updatedAt: Date.now(),
      };

      if (trimmedDescription) {
        updateData.description = trimmedDescription;
      } else {
        updateData.description = deleteField();
      }

      await Promise.race([updateDoc(listRef, updateData), timeout.promise]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[ListService] renameList error:', error);
      throw new Error(message);
    } finally {
      timeout.cancel();
    }
  }
}

export const listService = new ListService();
