import { auditedGetDoc, auditedGetDocs } from '@/src/services/firestoreReadAudit';
import {
  createServiceLogger,
  requireMatchingUser,
  requireSignedInUser,
  rethrowFirestoreError,
} from '@/src/services/serviceSupport';
import { raceWithTimeout } from '@/src/utils/timeout';
import { collection, deleteDoc, doc, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { FavoritePerson } from '../types/favoritePerson';

class FavoritePersonsService {
  private logDebug = createServiceLogger('FavoritePersonsService');

  private getUserFavoritePersonRef(userId: string, personId: string) {
    return doc(db, 'users', userId, 'favorite_persons', personId);
  }

  private getUserFavoritePersonsCollection(userId: string) {
    return collection(db, 'users', userId, 'favorite_persons');
  }

  async getFavoritePersons(userId: string): Promise<FavoritePerson[]> {
    try {
      requireMatchingUser(userId);

      this.logDebug('getFavoritePersons:start', {
        userId,
        path: `users/${userId}/favorite_persons`,
      });

      const personsRef = this.getUserFavoritePersonsCollection(userId);
      const q = query(personsRef, orderBy('addedAt', 'desc'));
      const snapshot = await raceWithTimeout(
        auditedGetDocs(q, {
          path: `users/${userId}/favorite_persons`,
          queryKey: 'favoritePersons',
          callsite: 'FavoritePersonsService.getFavoritePersons',
        }),
      );

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
      return rethrowFirestoreError('FavoritePersonsService.getFavoritePersons', error);
    }
  }

  async getFavoritePerson(userId: string, personId: number): Promise<FavoritePerson | null> {
    try {
      requireMatchingUser(userId);

      const personRef = this.getUserFavoritePersonRef(userId, personId.toString());
      const snapshot = await raceWithTimeout(
        auditedGetDoc(personRef, {
          path: `users/${userId}/favorite_persons/${personId}`,
          queryKey: 'favoritePersonById',
          callsite: 'FavoritePersonsService.getFavoritePerson',
        }),
      );

      if (!snapshot.exists()) {
        return null;
      }

      return {
        id: Number(snapshot.id),
        ...snapshot.data(),
      } as FavoritePerson;
    } catch (error) {
      return rethrowFirestoreError('FavoritePersonsService.getFavoritePerson', error);
    }
  }

  /**
   * Add a person to favorites
   */
  async addFavoritePerson(personData: Omit<FavoritePerson, 'addedAt'>) {
    try {
      const user = requireSignedInUser();

      const personRef = this.getUserFavoritePersonRef(user.uid, personData.id.toString());

      const favoriteData: FavoritePerson = {
        ...personData,
        addedAt: Date.now(),
      };

      await raceWithTimeout(setDoc(personRef, favoriteData));
    } catch (error) {
      return rethrowFirestoreError('FavoritePersonsService.addFavoritePerson', error);
    }
  }

  /**
   * Remove a person from favorites
   */
  async removeFavoritePerson(personId: number) {
    try {
      const user = requireSignedInUser();

      const personRef = this.getUserFavoritePersonRef(user.uid, personId.toString());

      await raceWithTimeout(deleteDoc(personRef));
    } catch (error) {
      return rethrowFirestoreError('FavoritePersonsService.removeFavoritePerson', error);
    }
  }
}

export const favoritePersonsService = new FavoritePersonsService();
