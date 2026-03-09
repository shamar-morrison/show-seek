import { deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

let mockUserId: string | null = 'test-user-id';
let mockIsAnonymous = false;

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockUserId ? { uid: mockUserId, isAnonymous: mockIsAnonymous } : null;
    },
  },
  db: {},
}));

jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

jest.mock('@/src/utils/timeout', () => ({
  raceWithTimeout: (promise: Promise<unknown>) => promise,
}));

import { favoritePersonsService } from '@/src/services/FavoritePersonsService';

describe('FavoritePersonsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'test-user-id';
    mockIsAnonymous = false;
  });

  describe('getFavoritePersons', () => {
    it('returns mapped favorite people for the signed-in user', async () => {
      const mockSnapshot = {
        size: 2,
        docs: [
          { id: '101', data: () => ({ name: 'Person One', profilePath: '/one.jpg' }) },
          { id: '202', data: () => ({ name: 'Person Two', profilePath: '/two.jpg' }) },
        ],
      };
      (getDocs as jest.Mock).mockResolvedValue(mockSnapshot);

      const result = await favoritePersonsService.getFavoritePersons('test-user-id');

      expect(result).toEqual([
        { id: 101, name: 'Person One', profilePath: '/one.jpg' },
        { id: 202, name: 'Person Two', profilePath: '/two.jpg' },
      ]);
    });

    it('rejects when the signed-in user does not match the requested user id', async () => {
      mockUserId = 'another-user-id';

      await expect(favoritePersonsService.getFavoritePersons('test-user-id')).rejects.toThrow(
        'Please sign in to continue'
      );
      expect(getDocs).not.toHaveBeenCalled();
    });

    it('rejects when the user is anonymous', async () => {
      mockIsAnonymous = true;

      await expect(favoritePersonsService.getFavoritePersons('test-user-id')).rejects.toThrow(
        'Please sign in to continue'
      );
      expect(getDocs).not.toHaveBeenCalled();
    });
  });

  describe('getFavoritePerson', () => {
    it('returns null when the favorite person does not exist', async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => false,
      });

      const result = await favoritePersonsService.getFavoritePerson('test-user-id', 101);

      expect(result).toBeNull();
    });

    it('returns the mapped favorite person when the document exists', async () => {
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        id: '303',
        data: () => ({ name: 'Favorite Person', profilePath: '/favorite.jpg' }),
      });

      const result = await favoritePersonsService.getFavoritePerson('test-user-id', 303);

      expect(result).toEqual({
        id: 303,
        name: 'Favorite Person',
        profilePath: '/favorite.jpg',
      });
    });
  });

  describe('addFavoritePerson', () => {
    it('writes the favorite person with an addedAt timestamp', async () => {
      const mockDocRef = { path: 'users/test-user-id/favorite_persons/101' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await favoritePersonsService.addFavoritePerson({
        id: 101,
        name: 'Favorite Person',
        profilePath: '/favorite.jpg',
      } as any);

      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          id: 101,
          name: 'Favorite Person',
          addedAt: expect.any(Number),
        })
      );
    });

    it('rejects when no signed-in user is available', async () => {
      mockUserId = null;

      await expect(
        favoritePersonsService.addFavoritePerson({ id: 101, name: 'Favorite Person' } as any)
      ).rejects.toThrow('Please sign in to continue');
      expect(setDoc).not.toHaveBeenCalled();
    });
  });

  describe('removeFavoritePerson', () => {
    it('deletes the favorite person document for the signed-in user', async () => {
      const mockDocRef = { path: 'users/test-user-id/favorite_persons/101' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (deleteDoc as jest.Mock).mockResolvedValue(undefined);

      await favoritePersonsService.removeFavoritePerson(101);

      expect(deleteDoc).toHaveBeenCalledWith(mockDocRef);
    });

    it('rejects when the user is anonymous', async () => {
      mockIsAnonymous = true;

      await expect(favoritePersonsService.removeFavoritePerson(101)).rejects.toThrow(
        'Please sign in to continue'
      );
      expect(deleteDoc).not.toHaveBeenCalled();
    });
  });
});
