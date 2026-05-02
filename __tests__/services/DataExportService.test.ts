import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const mockAuditedGetDocs = jest.fn();

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

jest.mock('@/src/services/firestoreReadAudit', () => ({
  auditedGetDocs: (...args: unknown[]) => mockAuditedGetDocs(...args),
}));

import { exportUserData } from '@/src/services/DataExportService';

describe('DataExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'test-user-id';
  });

  it('writes export file even when sharing is unavailable', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    mockAuditedGetDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    await expect(exportUserData('markdown')).rejects.toThrow('Sharing is not available');

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file://docs/showseek_export.md',
      expect.any(String),
      { encoding: FileSystem.EncodingType.UTF8 }
    );
    expect(mockAuditedGetDocs.mock.calls.map(([, meta]) => meta)).toEqual([
      {
        path: 'users/test-user-id/lists',
        queryKey: 'exportLists',
        callsite: 'DataExportService.fetchAllUserData',
      },
      {
        path: 'users/test-user-id/ratings',
        queryKey: 'exportRatings',
        callsite: 'DataExportService.fetchAllUserData',
      },
      {
        path: 'users/test-user-id/favorite_persons',
        queryKey: 'exportFavoritePersons',
        callsite: 'DataExportService.fetchAllUserData',
      },
    ]);
  });

  it('escapes CSV values with commas, quotes, and newlines', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    mockAuditedGetDocs
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

  it('skips invalid legacy ratings during export instead of producing malformed rows', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(true);
    mockAuditedGetDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'episode-10-1-2',
            data: () => ({
              mediaType: 'episode',
              rating: 9,
              ratedAt: 1700000000000,
              tvShowName: 'Loaded Show',
              episodeName: 'Pilot',
            }),
          },
          {
            id: 'movie-99',
            data: () => ({
              rating: 8,
              ratedAt: 1700000000001,
            }),
          },
        ],
      })
      .mockResolvedValueOnce({ docs: [] });

    await exportUserData('csv');

    const writtenContent = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1];
    expect(writtenContent).toContain('Rating,Loaded Show - Pilot,Episode,9');
    expect(writtenContent).not.toContain('movie-99');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
