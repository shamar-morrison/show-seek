import { noteService } from '@/src/services/NoteService';
import { deleteDoc, doc, getDoc, getDocs, setDoc, Timestamp } from 'firebase/firestore';

// Create module-level mutable mock state
let mockCurrentUser: { uid: string; isAnonymous: boolean } | null = {
  uid: 'test-user-id',
  isAnonymous: false,
};

// Mock the firebase config
jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
  db: {},
}));

// Mock firestore error helper
jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

describe('NoteService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = {
      uid: 'test-user-id',
      isAnonymous: false,
    };
  });

  describe('saveNote', () => {
    it('should save a movie note with originalTitle when provided', async () => {
      const mockDocRef = { path: 'users/test-user-id/notes/movie-123' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const noteData = {
        mediaType: 'movie' as const,
        mediaId: 123,
        content: 'Great movie!',
        mediaTitle: 'Inception',
        originalTitle: 'Inception Original',
        posterPath: '/path.jpg',
      };

      await noteService.saveNote('test-user-id', noteData);

      expect(doc).toHaveBeenCalledWith(
        expect.anything(),
        'users',
        'test-user-id',
        'notes',
        'movie-123'
      );
      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          mediaType: 'movie',
          content: 'Great movie!',
          mediaTitle: 'Inception',
          originalTitle: 'Inception Original',
        })
      );
    });

    it('should save an episode note with metadata and originalTitle', async () => {
      const mockDocRef = { path: 'users/test-user-id/notes/episode-123-1-5' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const noteData = {
        mediaType: 'episode' as const,
        mediaId: 123,
        content: 'Epic episode!',
        mediaTitle: 'Pilot',
        originalTitle: 'Pilot Original',
        posterPath: '/path.jpg',
        seasonNumber: 1,
        episodeNumber: 5,
        showId: 123,
      };

      await noteService.saveNote('test-user-id', noteData);

      expect(doc).toHaveBeenCalledWith(
        expect.anything(),
        'users',
        'test-user-id',
        'notes',
        'episode-123-1-5'
      );
      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          mediaType: 'episode',
          seasonNumber: 1,
          episodeNumber: 5,
          showId: 123,
          content: 'Epic episode!',
          originalTitle: 'Pilot Original',
        })
      );
    });
  });

  describe('getNote', () => {
    it('should return note for an episode with originalTitle when present', async () => {
      const mockNoteData = {
        mediaType: 'episode',
        mediaId: 123,
        content: 'Test note',
        mediaTitle: 'Episode Title',
        originalTitle: 'Episode Title Original',
        seasonNumber: 1,
        episodeNumber: 1,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockNoteData,
      });

      const result = await noteService.getNote('test-user-id', 'episode', 123, 1, 1);

      expect(result).toMatchObject({
        mediaType: 'episode',
        content: 'Test note',
        originalTitle: 'Episode Title Original',
        seasonNumber: 1,
        episodeNumber: 1,
      });
    });

    it('should return legacy notes without originalTitle', async () => {
      const mockNoteData = {
        mediaType: 'movie',
        mediaId: 550,
        content: 'Legacy note',
        mediaTitle: 'Fight Club',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        data: () => mockNoteData,
      });

      const result = await noteService.getNote('test-user-id', 'movie', 550);

      expect(result).toMatchObject({
        mediaType: 'movie',
        content: 'Legacy note',
        mediaTitle: 'Fight Club',
      });
      expect(result?.originalTitle).toBeUndefined();
    });

    it('returns null when user is not authenticated', async () => {
      mockCurrentUser = null;

      const result = await noteService.getNote('test-user-id', 'movie', 550);

      expect(result).toBeNull();
      expect(getDoc).not.toHaveBeenCalled();
    });

    it('returns null when user is anonymous', async () => {
      mockCurrentUser = {
        uid: 'test-user-id',
        isAnonymous: true,
      };

      const result = await noteService.getNote('test-user-id', 'movie', 550);

      expect(result).toBeNull();
      expect(getDoc).not.toHaveBeenCalled();
    });

    it('returns null when user does not match requested userId', async () => {
      mockCurrentUser = {
        uid: 'another-user-id',
        isAnonymous: false,
      };

      const result = await noteService.getNote('test-user-id', 'movie', 550);

      expect(result).toBeNull();
      expect(getDoc).not.toHaveBeenCalled();
    });
  });

  describe('getUserNotes', () => {
    it('returns an empty array when user is not authenticated', async () => {
      mockCurrentUser = null;

      await expect(noteService.getUserNotes('test-user-id')).resolves.toEqual([]);
      expect(getDocs).not.toHaveBeenCalled();
    });

    it('returns an empty array when user is anonymous', async () => {
      mockCurrentUser = {
        uid: 'test-user-id',
        isAnonymous: true,
      };

      await expect(noteService.getUserNotes('test-user-id')).resolves.toEqual([]);
      expect(getDocs).not.toHaveBeenCalled();
    });

    it('returns an empty array when user does not match requested userId', async () => {
      mockCurrentUser = {
        uid: 'another-user-id',
        isAnonymous: false,
      };

      await expect(noteService.getUserNotes('test-user-id')).resolves.toEqual([]);
      expect(getDocs).not.toHaveBeenCalled();
    });
  });

  describe('deleteNote', () => {
    it('should delete an episode note', async () => {
      const mockDocRef = { path: 'users/test-user-id/notes/episode-123-1-5' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (deleteDoc as jest.Mock).mockResolvedValue(undefined);

      await noteService.deleteNote('test-user-id', 'episode', 123, 1, 5);

      expect(doc).toHaveBeenCalledWith(
        expect.anything(),
        'users',
        'test-user-id',
        'notes',
        'episode-123-1-5'
      );
      expect(deleteDoc).toHaveBeenCalledWith(mockDocRef);
    });
  });
});
