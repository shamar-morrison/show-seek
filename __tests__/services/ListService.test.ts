import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

// Create module-level mutable mock state
let mockUserId: string | null = 'test-user-id';
const mockTrackAddToList = jest.fn();
const mockTrackCreateList = jest.fn();

// Mock the firebase config using a getter that reads the mutable state
jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockUserId ? { uid: mockUserId } : null;
    },
  },
  db: {},
}));

// Mock the firestore error helper
jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

const mockTimeoutCancel = jest.fn();
const mockCreateTimeoutWithCleanup = jest.fn((_ms?: number, _message?: string) => ({
  promise: new Promise<never>(() => {}),
  cancel: mockTimeoutCancel,
}));

jest.mock('@/src/utils/timeout', () => ({
  createTimeoutWithCleanup: (ms?: number, message?: string) =>
    mockCreateTimeoutWithCleanup(ms, message),
}));

jest.mock('@/src/services/analytics', () => ({
  normalizeListKind: (listId: string) =>
    ['watchlist', 'currently-watching', 'already-watched', 'favorites', 'dropped'].includes(listId)
      ? listId
      : 'custom',
  trackAddToList: (...args: unknown[]) => mockTrackAddToList(...args),
  trackCreateList: (...args: unknown[]) => mockTrackCreateList(...args),
}));

import { DEFAULT_LISTS, listService } from '@/src/services/ListService';
import {
  clearFirestoreReadAuditEvents,
  getFirestoreReadAuditReport,
} from '@/src/services/firestoreReadAudit';

/** The layouts `useLists` hands the service in the app: these lists fit in their document. */
const seedSinglePageLayouts = (...listIds: string[]) => {
  listService.rememberListLayouts(
    'test-user-id',
    listIds.map((id) => ({ id, name: id, items: {}, createdAt: 0 }))
  );
};

describe('ListService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset current user to authenticated state
    mockUserId = 'test-user-id';
    listService.clearListLayouts();
    seedSinglePageLayouts('watchlist', 'my-custom-list');
  });

  describe('addToList', () => {
    it('should update existing list without an initial getDoc read', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      const mediaItem = {
        id: 123,
        title: 'Test Movie',
        poster_path: '/poster.jpg',
        media_type: 'movie' as const,
        vote_average: 8.5,
        release_date: '2024-01-01',
      };

      await listService.addToList('watchlist', mediaItem);

      expect(doc).toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'Should Watch',
          'items.movie-123': expect.objectContaining({
            id: 123,
            title: 'Test Movie',
            media_type: 'movie',
            addedAt: expect.any(Number),
          }),
          'items.123': '__deleteField__',
          updatedAt: expect.any(Number),
        })
      );
      expect(setDoc).not.toHaveBeenCalled();
      expect(getDoc).not.toHaveBeenCalled();
      expect(mockTrackAddToList).toHaveBeenCalledWith({
        listKind: 'watchlist',
        mediaType: 'movie',
      });
    });

    it('should fallback to setDoc with createdAt when updateDoc fails with not-found', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockRejectedValue({ code: 'not-found', message: 'Not found' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const mediaItem = {
        id: 123,
        title: 'Test Movie',
        poster_path: '/poster.jpg',
        media_type: 'movie' as const,
        vote_average: 8.5,
        release_date: '2024-01-01',
      };

      await listService.addToList('watchlist', mediaItem);

      expect(setDoc).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'Should Watch',
          items: expect.objectContaining({
            'movie-123': expect.objectContaining({
              id: 123,
              title: 'Test Movie',
              media_type: 'movie',
              addedAt: expect.any(Number),
            }),
          }),
          updatedAt: expect.any(Number),
          createdAt: expect.any(Number),
        }),
        { merge: true }
      );
      expect(getDoc).not.toHaveBeenCalled();
      expect(mockTrackAddToList).toHaveBeenCalledWith({
        listKind: 'watchlist',
        mediaType: 'movie',
      });
    });

    it('should fallback to setDoc with createdAt when updateDoc fails with permission-denied', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockRejectedValue({
        code: 'permission-denied',
        message: 'Permission denied',
      });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const mediaItem = {
        id: 123,
        title: 'Test Movie',
        poster_path: '/poster.jpg',
        media_type: 'movie' as const,
        vote_average: 8.5,
        release_date: '2024-01-01',
      };

      await listService.addToList('watchlist', mediaItem);

      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'Should Watch',
          items: expect.objectContaining({
            'movie-123': expect.objectContaining({
              id: 123,
              title: 'Test Movie',
              media_type: 'movie',
              addedAt: expect.any(Number),
            }),
          }),
          updatedAt: expect.any(Number),
          createdAt: expect.any(Number),
        }),
        { merge: true }
      );
    });

    it('should throw when update and fallback create both fail with permission-denied', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
        (doc as jest.Mock).mockReturnValue(mockDocRef);
        (updateDoc as jest.Mock).mockRejectedValue({
          code: 'permission-denied',
          message: 'Permission denied',
        });
        (setDoc as jest.Mock).mockRejectedValue({
          code: 'permission-denied',
          message: 'Permission denied',
        });

        const mediaItem = {
          id: 123,
          title: 'Test Movie',
          poster_path: '/poster.jpg',
          media_type: 'movie' as const,
          vote_average: 8.5,
          release_date: '2024-01-01',
        };

        await expect(listService.addToList('watchlist', mediaItem)).rejects.toThrow(
          'Permission denied'
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[ListService] addToList error:',
          expect.objectContaining({
            code: 'permission-denied',
            stage: 'fallback-create',
          })
        );
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it('should throw error when user is not authenticated', async () => {
      mockUserId = null;

      const mediaItem = {
        id: 123,
        title: 'Test Movie',
        poster_path: '/poster.jpg',
        media_type: 'movie' as const,
        vote_average: 8.5,
        release_date: '2024-01-01',
      };

      await expect(listService.addToList('watchlist', mediaItem)).rejects.toThrow(
        'Please sign in to continue'
      );
    });

    it('should not write a name on update when no listName is provided for a custom list', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/foreign-language-films' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      const mediaItem = {
        id: 123,
        title: 'Test Movie',
        poster_path: '/poster.jpg',
        media_type: 'movie' as const,
        vote_average: 8.5,
        release_date: '2024-01-01',
      };

      await listService.addToList('foreign-language-films', mediaItem);

      expect(updateDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          'items.movie-123': expect.objectContaining({ id: 123 }),
          updatedAt: expect.any(Number),
        })
      );
      const [, updatePayload] = (updateDoc as jest.Mock).mock.calls[0];
      expect(updatePayload).not.toHaveProperty('name');
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('should write the provided listName on update for a custom list', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/foreign-language-films' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      const mediaItem = {
        id: 123,
        title: 'Test Movie',
        poster_path: '/poster.jpg',
        media_type: 'movie' as const,
        vote_average: 8.5,
        release_date: '2024-01-01',
      };

      await listService.addToList('foreign-language-films', mediaItem, 'Foreign Language Films');

      expect(updateDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'Foreign Language Films',
          'items.movie-123': expect.objectContaining({ id: 123 }),
          updatedAt: expect.any(Number),
        })
      );
      expect(setDoc).not.toHaveBeenCalled();
    });

    it('should fall back to the slug ID as name on first create without a listName', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/foreign-language-films' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockRejectedValue({ code: 'not-found', message: 'Not found' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const mediaItem = {
        id: 123,
        title: 'Test Movie',
        poster_path: '/poster.jpg',
        media_type: 'movie' as const,
        vote_average: 8.5,
        release_date: '2024-01-01',
      };

      await listService.addToList('foreign-language-films', mediaItem);

      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'foreign-language-films',
          createdAt: expect.any(Number),
        }),
        { merge: true }
      );
    });
  });

  describe('removeFromList', () => {
    it('should call updateDoc with deleteField for the media item', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.removeFromList('watchlist', { id: 123, media_type: 'movie' });

      expect(updateDoc).toHaveBeenCalledWith(mockDocRef, {
        'items.movie-123': '__deleteField__',
        'items.123': '__deleteField__',
        updatedAt: expect.any(Number),
      });
    });

    it('should throw error when user is not authenticated', async () => {
      mockUserId = null;

      await expect(
        listService.removeFromList('watchlist', { id: 123, media_type: 'movie' })
      ).rejects.toThrow('Please sign in to continue');
    });
  });

  describe('season entries', () => {
    const seasonItem = {
      id: 1396,
      title: 'Breaking Bad · Season 3',
      poster_path: '/season3.jpg',
      media_type: 'season' as const,
      vote_average: 8.4,
      release_date: '2010-03-21',
      season_number: 3,
      season_name: 'Season 3',
      show_name: 'Breaking Bad',
    };

    it('adds a season under its own key without clearing the numeric key of the show', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.addToList('watchlist', seasonItem);

      const update = (updateDoc as jest.Mock).mock.calls[0][1];
      expect(update['items.season-1396-3']).toEqual(
        expect.objectContaining({ id: 1396, media_type: 'season', season_number: 3 })
      );
      expect(update).not.toHaveProperty('items.1396');
      expect(mockTrackAddToList).toHaveBeenCalledWith({
        listKind: 'watchlist',
        mediaType: 'season',
      });
    });

    it('adds specials (season 0)', async () => {
      (doc as jest.Mock).mockReturnValue({ path: 'x' });
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.addToList('watchlist', { ...seasonItem, season_number: 0 });

      expect((updateDoc as jest.Mock).mock.calls[0][1]).toHaveProperty(['items.season-1396-0']);
    });

    it('refuses a season without a season number', async () => {
      const { season_number: _omit, ...withoutNumber } = seasonItem;

      await expect(listService.addToList('watchlist', withoutNumber)).rejects.toThrow();
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('removes only the season entry', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.removeFromList('watchlist', {
        id: 1396,
        media_type: 'season',
        season_number: 3,
      });

      expect(updateDoc).toHaveBeenCalledWith(mockDocRef, {
        'items.season-1396-3': '__deleteField__',
        updatedAt: expect.any(Number),
      });
    });

    it('refuses to remove a season without its number', async () => {
      await expect(
        listService.removeFromList('watchlist', { id: 1396, media_type: 'season' })
      ).rejects.toThrow();
      expect(updateDoc).not.toHaveBeenCalled();
    });
  });

  describe('episode entries', () => {
    const episodeItem = {
      id: 1396,
      title: 'Breaking Bad · S2E12 · Phoenix',
      poster_path: '/season2.jpg',
      media_type: 'episode' as const,
      vote_average: 8.9,
      release_date: '2009-05-24',
      season_number: 2,
      episode_number: 12,
      episode_name: 'Phoenix',
      show_name: 'Breaking Bad',
    };

    it('adds an episode under its own key without clearing the numeric key of the show', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.addToList('watchlist', episodeItem);

      const update = (updateDoc as jest.Mock).mock.calls[0][1];
      expect(update['items.episode-1396-2-12']).toEqual(
        expect.objectContaining({
          id: 1396,
          media_type: 'episode',
          season_number: 2,
          episode_number: 12,
        })
      );
      expect(update).not.toHaveProperty('items.1396');
      expect(mockTrackAddToList).toHaveBeenCalledWith({
        listKind: 'watchlist',
        mediaType: 'episode',
      });
    });

    it('adds specials episodes and episode 0', async () => {
      (doc as jest.Mock).mockReturnValue({ path: 'x' });
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.addToList('watchlist', {
        ...episodeItem,
        season_number: 0,
        episode_number: 0,
      });

      expect((updateDoc as jest.Mock).mock.calls[0][1]).toHaveProperty(['items.episode-1396-0-0']);
    });

    it('refuses an episode without an episode number', async () => {
      const { episode_number: _omit, ...withoutNumber } = episodeItem;

      await expect(listService.addToList('watchlist', withoutNumber)).rejects.toThrow();
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('removes only the episode entry, never the legacy key of the show', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.removeFromList('watchlist', {
        id: 1396,
        media_type: 'episode',
        season_number: 2,
        episode_number: 12,
      });

      expect(updateDoc).toHaveBeenCalledWith(mockDocRef, {
        'items.episode-1396-2-12': '__deleteField__',
        updatedAt: expect.any(Number),
      });
    });

    it('refuses to remove an episode without its numbers', async () => {
      await expect(
        listService.removeFromList('watchlist', {
          id: 1396,
          media_type: 'episode',
          season_number: 2,
        })
      ).rejects.toThrow();
      expect(updateDoc).not.toHaveBeenCalled();
    });
  });

  describe('updateListItemFields', () => {
    const episodeRef = {
      id: 1396,
      media_type: 'episode' as const,
      season_number: 2,
      episode_number: 5,
    };
    const savedEntry = { id: 1396, media_type: 'episode', season_number: 2, episode_number: 5 };
    /** Runs the transaction against a document holding `items`; returns its update spy. */
    const withDocument = (items: Record<string, unknown> | null) => {
      const transaction = {
        get: jest.fn().mockResolvedValue({
          exists: () => items !== null,
          data: () => (items === null ? undefined : { items }),
        }),
        update: jest.fn(),
      };
      (runTransaction as jest.Mock).mockImplementation(
        async (_db: unknown, run: (tx: typeof transaction) => Promise<unknown>) => run(transaction)
      );
      return transaction;
    };

    it('updates only the given fields of an entry still in the list document', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      const transaction = withDocument({ 'episode-1396-2-5': savedEntry });

      const updated = await listService.updateListItemFields('watchlist', episodeRef, 0, {
        episode_name: 'Breakage',
        still_path: undefined,
      });

      expect(updated).toBe(true);
      expect(transaction.get).toHaveBeenCalledWith(mockDocRef);
      expect(transaction.update).toHaveBeenCalledWith(mockDocRef, {
        'items.episode-1396-2-5.episode_name': 'Breakage',
      });
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('updates an entry on its overflow page', async () => {
      (doc as jest.Mock).mockImplementation((_db: unknown, ...segments: string[]) => ({
        path: segments.join('/'),
      }));
      const transaction = withDocument({ 'episode-1396-2-5': savedEntry });

      await listService.updateListItemFields('watchlist', episodeRef, 3, {
        release_date: '2009-04-05',
      });

      const [ref, updates] = transaction.update.mock.calls[0];
      expect(ref.path).toContain('watchlist');
      expect(ref.path).toMatch(/3$/);
      expect(updates).toEqual({ 'items.episode-1396-2-5.release_date': '2009-04-05' });
    });

    it('never re-creates an entry removed meanwhile, or writes to a missing page', async () => {
      (doc as jest.Mock).mockReturnValue({ path: 'x' });

      let transaction = withDocument({ 'tv-1396': { id: 1396, media_type: 'tv' } });
      expect(
        await listService.updateListItemFields('watchlist', episodeRef, 0, { episode_name: 'X' })
      ).toBe(false);
      expect(transaction.update).not.toHaveBeenCalled();

      transaction = withDocument(null);
      expect(
        await listService.updateListItemFields('watchlist', episodeRef, 2, { episode_name: 'X' })
      ).toBe(false);
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it('writes nothing with no fields to change', async () => {
      expect(await listService.updateListItemFields('watchlist', episodeRef, 0, {})).toBe(false);
      expect(runTransaction).not.toHaveBeenCalled();
    });
  });

  describe('updateListItemRatings', () => {
    /** Runs the transaction against a document holding `items`; returns its spies. */
    const withDocument = (items: Record<string, unknown> | null) => {
      const transaction = {
        get: jest.fn().mockResolvedValue({
          exists: () => items !== null,
          data: () => (items === null ? undefined : { items }),
        }),
        update: jest.fn(),
      };
      (runTransaction as jest.Mock).mockImplementation(
        async (_db: unknown, run: (tx: typeof transaction) => Promise<unknown>) => run(transaction)
      );
      return transaction;
    };
    const movie = (id: number, voteAverage?: number) => ({
      id,
      media_type: 'movie',
      title: `Movie ${id}`,
      ...(voteAverage === undefined ? {} : { vote_average: voteAverage }),
    });

    it('saves changed ratings in one write, by stored key, leaving the list untouched otherwise', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      const transaction = withDocument({
        'movie-1': movie(1, 7.3),
        '2': movie(2, 5),
        'tv-3': { id: 3, media_type: 'tv', vote_average: 8 },
      });

      const result = await listService.updateListItemRatings('watchlist', 0, {
        'movie-1': { mediaType: 'movie', mediaId: 1, rating: 6.3 },
        '2': { mediaType: 'movie', mediaId: 2, rating: 5.8 },
        'tv-3': { mediaType: 'tv', mediaId: 3, rating: 8.04 },
      });

      expect([...result.updated].sort()).toEqual(['2', 'movie-1']);
      expect(result.missing).toEqual([]);
      expect(transaction.get).toHaveBeenCalledWith(mockDocRef);
      expect(transaction.update).toHaveBeenCalledTimes(1);
      expect(transaction.update).toHaveBeenCalledWith(mockDocRef, {
        'items.movie-1.vote_average': 6.3,
        'items.2.vote_average': 5.8,
      });
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('writes to the overflow page holding the entries', async () => {
      (doc as jest.Mock).mockImplementation((_db: unknown, ...segments: string[]) => ({
        path: segments.join('/'),
      }));
      const transaction = withDocument({ 'movie-1': movie(1, 7.3) });

      await listService.updateListItemRatings('watchlist', 2, {
        'movie-1': { mediaType: 'movie', mediaId: 1, rating: 6.3 },
      });

      const [ref, updates] = transaction.update.mock.calls[0];
      expect(ref.path).toContain('watchlist');
      expect(ref.path).toMatch(/2$/);
      expect(updates).toEqual({ 'items.movie-1.vote_average': 6.3 });
    });

    it('never writes to an entry that is gone, replaced, or on a missing page', async () => {
      (doc as jest.Mock).mockReturnValue({ path: 'x' });

      let transaction = withDocument({
        'movie-2': movie(2, 7),
        'tv-1': { id: 1, media_type: 'tv', vote_average: 7 },
      });
      expect(
        await listService.updateListItemRatings('watchlist', 0, {
          'movie-1': { mediaType: 'movie', mediaId: 1, rating: 6.3 },
          'tv-1': { mediaType: 'movie', mediaId: 1, rating: 6.3 },
        })
      ).toEqual({ updated: [], missing: ['movie-1', 'tv-1'] });
      expect(transaction.update).not.toHaveBeenCalled();

      transaction = withDocument(null);
      expect(
        await listService.updateListItemRatings('watchlist', 3, {
          'movie-1': { mediaType: 'movie', mediaId: 1, rating: 6.3 },
        })
      ).toEqual({ updated: [], missing: ['movie-1'] });
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it('writes nothing when the stored rating already shows the same, is unset, or would become 0', async () => {
      (doc as jest.Mock).mockReturnValue({ path: 'x' });
      const transaction = withDocument({
        'movie-1': movie(1, 6.31),
        'movie-2': movie(2),
        'movie-3': movie(3, 7),
      });

      const result = await listService.updateListItemRatings('watchlist', 0, {
        'movie-1': { mediaType: 'movie', mediaId: 1, rating: 6.34 },
        'movie-2': { mediaType: 'movie', mediaId: 2, rating: 6.3 },
        'movie-3': { mediaType: 'movie', mediaId: 3, rating: 0 },
      });

      expect(result).toEqual({ updated: [], missing: [] });
      expect(transaction.update).not.toHaveBeenCalled();
    });

    it('does nothing without ratings, and reports failures', async () => {
      expect(await listService.updateListItemRatings('watchlist', 0, {})).toEqual({
        updated: [],
        missing: [],
      });
      expect(runTransaction).not.toHaveBeenCalled();

      (doc as jest.Mock).mockReturnValue({ path: 'x' });
      (runTransaction as jest.Mock).mockRejectedValueOnce(new Error('offline'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(
        listService.updateListItemRatings('watchlist', 0, {
          'movie-1': { mediaType: 'movie', mediaId: 1, rating: 6.3 },
        })
      ).rejects.toThrow();
      consoleSpy.mockRestore();
    });
  });

  describe('removeManyFromList', () => {
    it('removes several entries in one write, clearing legacy keys only for movies and shows', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.removeManyFromList('watchlist', [
        { id: 1396, media_type: 'episode', season_number: 2, episode_number: 12 },
        { id: 1396, media_type: 'episode', season_number: 2, episode_number: 13 },
        { id: 1396, media_type: 'season', season_number: 3 },
        { id: 7, media_type: 'movie' },
      ]);

      expect(updateDoc).toHaveBeenCalledTimes(1);
      expect(updateDoc).toHaveBeenCalledWith(mockDocRef, {
        'items.episode-1396-2-12': '__deleteField__',
        'items.episode-1396-2-13': '__deleteField__',
        'items.season-1396-3': '__deleteField__',
        'items.movie-7': '__deleteField__',
        'items.7': '__deleteField__',
        updatedAt: expect.any(Number),
      });
    });

    it('writes nothing when any entry cannot be keyed', async () => {
      await expect(
        listService.removeManyFromList('watchlist', [
          { id: 7, media_type: 'movie' },
          { id: 1396, media_type: 'episode', season_number: 2 },
        ])
      ).rejects.toThrow();
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('does nothing for an empty list of entries', async () => {
      await listService.removeManyFromList('watchlist', []);
      expect(updateDoc).not.toHaveBeenCalled();
      expect(getDoc).not.toHaveBeenCalled();
    });
  });

  describe('createList', () => {
    it('should create list with URL-friendly ID', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/my-new-list' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const listId = await listService.createList('My New List');

      expect(listId).toBe('my-new-list');
      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'My New List',
          items: {},
          createdAt: expect.any(Number),
          isCustom: true,
        })
      );
      expect(mockTrackCreateList).toHaveBeenCalledWith({ hasDescription: false });
    });

    it('should generate unique ID when collision occurs', async () => {
      const mockDocRef = { path: 'test' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      // First call: exists, second call: doesn't exist
      (getDoc as jest.Mock)
        .mockResolvedValueOnce({ exists: () => true })
        .mockResolvedValueOnce({ exists: () => false });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const listId = await listService.createList('Test List');

      // Should have appended a suffix
      expect(listId).toMatch(/^test-list-[a-z0-9]+$/);
    });

    it('returns a friendly error when collision checks time out', async () => {
      const collisionTimeoutCancel = jest.fn();
      (doc as jest.Mock).mockReturnValue({ path: 'users/test-user-id/lists/timeout-list' });
      (getDoc as jest.Mock).mockReturnValue(new Promise(() => {}));
      mockCreateTimeoutWithCleanup.mockImplementationOnce(() => ({
        promise: Promise.reject(new Error('List creation collision check timed out')),
        cancel: collisionTimeoutCancel,
      }));

      await expect(listService.createList('Timeout List')).rejects.toThrow(
        'Unable to create list right now, please try again'
      );
      expect(mockCreateTimeoutWithCleanup).toHaveBeenCalledWith(
        10000,
        'List creation collision check timed out'
      );
      expect(collisionTimeoutCancel).toHaveBeenCalledTimes(1);
      expect(mockTrackCreateList).not.toHaveBeenCalled();
    });

    it('does not track list creation when the write fails', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/broken-list' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });
      (setDoc as jest.Mock).mockRejectedValue(new Error('Write failed'));

      await expect(listService.createList('Broken List')).rejects.toThrow('Write failed');

      expect(mockTrackCreateList).not.toHaveBeenCalled();
    });
  });

  describe('deleteList', () => {
    it('deletes a custom list together with its overflow pages in one batch', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/my-custom-list' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDocs as jest.Mock).mockResolvedValue({ size: 0, docs: [] });
      const batch = { delete: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) };
      (writeBatch as jest.Mock).mockReturnValueOnce(batch);

      await listService.deleteList('my-custom-list');

      expect(batch.delete).toHaveBeenCalledWith(mockDocRef);
      expect(batch.commit).toHaveBeenCalledTimes(1);
    });

    it('should prevent deletion of default lists', async () => {
      await expect(listService.deleteList('watchlist')).rejects.toThrow(
        'Cannot delete default lists'
      );
      expect(deleteDoc).not.toHaveBeenCalled();
    });
  });

  describe('renameList', () => {
    it('updates list name and description for custom lists', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/my-custom-list' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => true });
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.renameList('my-custom-list', 'Renamed List', 'Updated description');

      expect(updateDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'Renamed List',
          description: 'Updated description',
          updatedAt: expect.any(Number),
        })
      );
    });

    it('throws when list does not exist', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/missing-list' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

      await expect(listService.renameList('missing-list', 'Renamed')).rejects.toThrow(
        'List not found'
      );
      expect(updateDoc).not.toHaveBeenCalled();
    });

    it('times out if list existence read hangs', async () => {
      const timeoutCancel = jest.fn();
      const mockDocRef = { path: 'users/test-user-id/lists/hanging-list' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockReturnValue(new Promise(() => {}));
      mockCreateTimeoutWithCleanup.mockImplementationOnce(() => ({
        promise: Promise.reject(new Error('Request timed out')),
        cancel: timeoutCancel,
      }));

      await expect(listService.renameList('hanging-list', 'Renamed')).rejects.toThrow(
        'Request timed out'
      );
      expect(updateDoc).not.toHaveBeenCalled();
      expect(timeoutCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('timeout cleanup', () => {
    it('cancels timeout after removeFromList resolves', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.removeFromList('watchlist', { id: 123, media_type: 'movie' });

      expect(mockCreateTimeoutWithCleanup).toHaveBeenCalled();
      expect(mockTimeoutCancel).toHaveBeenCalled();
    });

    it('cancels timeout when deleteList throws', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/my-custom-list' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDocs as jest.Mock).mockResolvedValue({ size: 0, docs: [] });
      (writeBatch as jest.Mock).mockReturnValueOnce({
        delete: jest.fn(),
        commit: jest.fn().mockRejectedValue(new Error('delete failed')),
      });

      await expect(listService.deleteList('my-custom-list')).rejects.toThrow('delete failed');
      expect(mockCreateTimeoutWithCleanup).toHaveBeenCalled();
      expect(mockTimeoutCancel).toHaveBeenCalled();
    });
  });

  describe('DEFAULT_LISTS', () => {
    it('should contain expected default lists', () => {
      expect(DEFAULT_LISTS).toHaveLength(5);
      expect(DEFAULT_LISTS.map((l) => l.id)).toEqual([
        'watchlist',
        'currently-watching',
        'already-watched',
        'favorites',
        'dropped',
      ]);
    });
  });

  describe('getListMembershipIndex', () => {
    it('builds a complete membership index and records a single audited fetch', async () => {
      const mockCollectionRef = { path: 'users/test-user-id/lists' };
      (collection as jest.Mock).mockReturnValue(mockCollectionRef);

      const mockSnapshot = {
        size: 6,
        docs: [
          {
            id: 'watchlist',
            data: () => ({
              items: {
                101: { id: 101, media_type: 'movie' },
                202: { id: 202, media_type: 'tv' },
                'season-202-1': { id: 202, media_type: 'season', season_number: 1 },
                'season-202-0': { id: 202, media_type: 'season', season_number: 0 },
              },
            }),
          },
          {
            id: 'favorites',
            data: () => ({
              items: {
                101: { id: 101, media_type: 'movie' },
              },
            }),
          },
          {
            id: 'custom-1',
            data: () => ({
              items: {
                303: { id: 303, media_type: 'movie' },
                'episode-202-1-4': {
                  id: 202,
                  media_type: 'episode',
                  season_number: 1,
                  episode_number: 4,
                },
              },
            }),
          },
          { id: 'currently-watching', data: () => ({ items: {} }) },
          { id: 'already-watched', data: () => ({ items: {} }) },
          { id: 'dropped', data: () => ({ items: {} }) },
        ],
      };

      (getDocs as jest.Mock).mockResolvedValue(mockSnapshot);
      clearFirestoreReadAuditEvents();

      const membership = await listService.getListMembershipIndex('test-user-id');

      expect(membership).toEqual({
        '101-movie': ['watchlist', 'favorites'],
        '202-tv': ['watchlist'],
        '202-season-1': ['watchlist'],
        '202-season-0': ['watchlist'],
        '202-episode-1-4': ['custom-1'],
        '303-movie': ['custom-1'],
      });
      expect(getDocs).toHaveBeenCalledTimes(1);

      const report = getFirestoreReadAuditReport();
      const membershipCallsite = report.byCallsite.find(
        (entry) => entry.name === 'ListService.getListMembershipIndex'
      );

      expect(membershipCallsite?.reads).toBe(6);
      expect(report.byOperation.find((entry) => entry.name === 'getDocs')?.reads).toBe(6);
      expect(report.byPath.find((entry) => entry.name === 'users/test-user-id/lists')?.reads).toBe(
        6
      );
    });
  });
});
