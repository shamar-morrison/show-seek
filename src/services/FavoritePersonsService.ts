import { FirebaseError } from 'firebase/app';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { FavoritePerson } from '../types/favoritePerson';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';

class FavoritePersonsService {
  private getUserFavoritePersonRef(userId: string, personId: string) {
    return doc(db, 'users', userId, 'favorite_persons', personId);
  }

  private getUserFavoritePersonsCollection(userId: string) {
    return collection(db, 'users', userId, 'favorite_persons');
  }

  /**
   * Subscribe to all favorite persons for the current user
   */
  subscribeToFavoritePersons(
    callback: (persons: FavoritePerson[]) => void,
    onError?: (error: Error) => void
  ) {
    const user = auth.currentUser;
    if (!user) return () => {};

    const personsRef = this.getUserFavoritePersonsCollection(user.uid);
    const q = query(personsRef, orderBy('addedAt', 'desc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const persons: FavoritePerson[] = snapshot.docs.map((doc) => ({
          id: Number(doc.id),
          ...doc.data(),
        })) as FavoritePerson[];

        callback(persons);
      },
      (error) => {
        console.error('[FavoritePersonsService] Subscription error:', error);
        const message = getFirestoreErrorMessage(error);
        if (onError) {
          onError(new Error(message));
        }
        callback([]);
      }
    );
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
