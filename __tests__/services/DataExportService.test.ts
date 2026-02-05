import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getDocs } from 'firebase/firestore';

let mockUserId: string | null = 'test-user-id';

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockUserId ? { uid: mockUserId } : null;
    },
  },
  db: {},
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file://docs/',
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  EncodingType: { UTF8: 'utf8' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(false)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

import { exportUserData } from '@/src/services/DataExportService';

describe('DataExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'test-user-id';
  });

  it('writes export file even when sharing is unavailable', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    (getDocs as jest.Mock)
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    await expect(exportUserData('markdown')).rejects.toThrow('Sharing is not available');

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file://docs/showseek_export.md',
      expect.any(String),
      { encoding: FileSystem.EncodingType.UTF8 }
    );
  });

  it('escapes CSV values with commas, quotes, and newlines', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    (getDocs as jest.Mock)
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'watchlist',
            data: () => ({
              name: 'My List',
              items: {
                1: {
                  id: 1,
                  title: 'Bad, "Good"\nTitle',
                  media_type: 'movie',
                  poster_path: null,
                  vote_average: 0,
                  release_date: '2024-01-01',
                },
              },
            }),
          },
        ],
      })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    await exportUserData('csv');

    const writtenContent = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1];
    expect(writtenContent).toContain('List: My List,"Bad, ""Good""\nTitle",Movie,');
  });
});
