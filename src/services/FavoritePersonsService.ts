import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import {
  auditedGetDoc,
  auditedGetDocs,
} from '@/src/services/firestoreReadAudit';
import { collection, deleteDoc, doc, orderBy, query, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { FavoritePerson } from '../types/favoritePerson';

class FavoritePersonsService {
  private isDebugLoggingEnabled() {
    return __DEV__ && READ_OPTIMIZATION_FLAGS.enableServiceQueryDebugLogs;
  }

  private logDebug(event: string, payload: Record<string, unknown>) {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }

    console.log(`[FavoritePersonsService.${event}]`, payload);
  }

  private getUserFavoritePersonRef(userId: string, personId: string) {
    return doc(db, 'users', userId, 'favorite_persons', personId);
  }

  private getUserFavoritePersonsCollection(userId: string) {
    return collection(db, 'users', userId, 'favorite_persons');
  }

  async getFavoritePersons(userId: string): Promise<FavoritePerson[]> {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      this.logDebug('getFavoritePersons:start', {
        userId,
        path: `users/${userId}/favorite_persons`,
      });

      const personsRef = this.getUserFavoritePersonsCollection(userId);
      const q = query(personsRef, orderBy('addedAt', 'desc'));
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      const snapshot = await Promise.race([
        auditedGetDocs(q, {
          path: `users/${userId}/favorite_persons`,
          queryKey: 'favoritePersons',
          callsite: 'FavoritePersonsService.getFavoritePersons',
        }),
        timeoutPromise,
      ]);

      const persons = snapshot.docs.map((personDoc) => ({
        id: Number(personDoc.id),
        ...personDoc.data(),
      })) as FavoritePerson[];
      this.logDebug('getFavoritePersons:result', {
        userId,
        docCount: snapshot.size,
        resultCount: persons.length,
      });
      return persons;
    } catch (error) {
      this.logDebug('getFavoritePersons:error', {
        userId,
        error,
      });
      const message = getFirestoreErrorMessage(error);
      console.error('[FavoritePersonsService] getFavoritePersons error:', error);
      throw new Error(message);
    }
  }

  async getFavoritePerson(userId: string, personId: number): Promise<FavoritePerson | null> {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      const personRef = this.getUserFavoritePersonRef(userId, personId.toString());
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      const snapshot = await Promise.race([
        auditedGetDoc(personRef, {
          path: `users/${userId}/favorite_persons/${personId}`,
          queryKey: 'favoritePersonById',
          callsite: 'FavoritePersonsService.getFavoritePerson',
        }),
        timeoutPromise,
      ]);

      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: Number(snapshot.id),
        ...snapshot.data(),
      } as FavoritePerson;
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[FavoritePersonsService] getFavoritePerson error:', error);
      throw new Error(message);
    }
  }

  /**
   * Add a person to favorites
   */
  async addFavoritePerson(personData: Omit<FavoritePerson, 'addedAt'>) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const personRef = this.getUserFavoritePersonRef(user.uid, personData.id.toString());

      const favoriteData: FavoritePerson = {
        ...personData,
        addedAt: Date.now(),
      };

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([setDoc(personRef, favoriteData), timeoutPromise]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[FavoritePersonsService] addFavoritePerson error:', error);
      throw new Error(message);
    }
  }

  /**
   * Remove a person from favorites
   */
  async removeFavoritePerson(personId: number) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const personRef = this.getUserFavoritePersonRef(user.uid, personId.toString());

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([deleteDoc(personRef), timeoutPromise]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[FavoritePersonsService] removeFavoritePerson error:', error);
      throw new Error(message);
    }
  }
}

export const favoritePersonsService = new FavoritePersonsService();
