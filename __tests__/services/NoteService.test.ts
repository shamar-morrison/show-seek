import { noteService } from '@/src/services/NoteService';
import { deleteDoc, doc, getDoc, getDocs, setDoc, Timestamp } from 'firebase/firestore';

// Create module-level mutable mock state
let mockUserId: string | null = 'test-user-id';

// Mock the firebase config
jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockUserId ? { uid: mockUserId } : null;
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
    mockUserId = 'test-user-id';
  });

  describe('saveNote', () => {
    it('should save a movie note', async () => {
      const mockDocRef = { path: 'users/test-user-id/notes/movie-123' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const noteData = {
        mediaType: 'movie' as const,
        mediaId: 123,
        content: 'Great movie!',
        mediaTitle: 'Inception',
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
        })
      );
    });

    it('should save an episode note with metadata', async () => {
      const mockDocRef = { path: 'users/test-user-id/notes/episode-123-1-5' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const noteData = {
        mediaType: 'episode' as const,
        mediaId: 123,
        content: 'Epic episode!',
        mediaTitle: 'Pilot',
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
        })
      );
    });
  });

  describe('getNote', () => {
    it('should return note for an episode', async () => {
      const mockNoteData = {
        mediaType: 'episode',
        mediaId: 123,
        content: 'Test note',
        mediaTitle: 'Episode Title',
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
        seasonNumber: 1,
        episodeNumber: 1,
      });
    });
  });

  describe('getUserNotes', () => {
    it('rejects when user is not authenticated', async () => {
      mockUserId = null;

      await expect(noteService.getUserNotes('test-user-id')).rejects.toThrow(
        'Please sign in to continue'
      );
      expect(getDocs).not.toHaveBeenCalled();
    });

    it('rejects when user does not match requested userId', async () => {
      mockUserId = 'another-user-id';

      await expect(noteService.getUserNotes('test-user-id')).rejects.toThrow(
        'Please sign in to continue'
      );
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
