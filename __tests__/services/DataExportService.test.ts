import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const mockAuditedGetDocs = jest.fn();
const mockGetAllWatchedShows = jest.fn();
const mockGetUserNotes = jest.fn();
const mockGetFavoriteEpisodes = jest.fn();

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

jest.mock('@/src/services/EpisodeTrackingService', () => ({
  episodeTrackingService: {
    getAllWatchedShows: (...args: unknown[]) => mockGetAllWatchedShows(...args),
  },
}));

jest.mock('@/src/services/NoteService', () => ({
  noteService: {
    getUserNotes: (...args: unknown[]) => mockGetUserNotes(...args),
  },
}));

jest.mock('@/src/services/FavoriteEpisodeService', () => ({
  favoriteEpisodeService: {
    getFavoriteEpisodes: (...args: unknown[]) => mockGetFavoriteEpisodes(...args),
  },
}));

import { exportUserData } from '@/src/services/DataExportService';

const localDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
};

const getWrittenContent = () =>
  (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1] as string;

describe('DataExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'test-user-id';
    mockGetAllWatchedShows.mockResolvedValue([]);
    mockGetUserNotes.mockResolvedValue([]);
    mockGetFavoriteEpisodes.mockResolvedValue([]);
  });

  it('writes export file even when sharing is unavailable', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    mockAuditedGetDocs
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    await expect(exportUserData('markdown')).rejects.toThrow('Sharing is not available');

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/docs\/showseek_export_\d{4}-\d{2}-\d{2}\.md$/),
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
    expect(mockGetAllWatchedShows).toHaveBeenCalledWith('test-user-id');
    expect(mockGetUserNotes).toHaveBeenCalledWith('test-user-id');
    expect(mockGetFavoriteEpisodes).toHaveBeenCalledWith('test-user-id');
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

  it('exports season list entries as seasons with their season number', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    const listDocs = {
      docs: [
        {
          id: 'favorites',
          data: () => ({
            name: 'Favorites',
            items: {
              'season-1396-0': {
                id: 1396,
                title: 'Breaking Bad · Specials',
                media_type: 'season',
                season_number: 0,
                poster_path: null,
                vote_average: 0,
                release_date: '',
              },
            },
          }),
        },
      ],
    };
    mockAuditedGetDocs
      .mockResolvedValueOnce(listDocs)
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    await exportUserData('csv');
    expect(getWrittenContent()).toContain(
      'List: Favorites,Breaking Bad · Specials,Season,,,1396,0,,'
    );

    (FileSystem.writeAsStringAsync as jest.Mock).mockClear();
    mockAuditedGetDocs
      .mockResolvedValueOnce(listDocs)
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] });

    await exportUserData('markdown');
    expect(getWrittenContent()).toContain('- **Breaking Bad · Specials** (Season)');
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
            id: 'season-10-1',
            data: () => ({
              mediaType: 'season',
              rating: 8.5,
              ratedAt: 1700000000002,
              title: 'Season 1',
              tvShowName: 'Loaded Show',
              seasonNumber: 1,
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
    expect(writtenContent).toContain('Rating,Loaded Show - Season 1,Season,8.5');
    expect(writtenContent).not.toContain('movie-99');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
  describe('watched episodes, favorite episodes, and notes', () => {
    const watchedAt = new Date(2025, 2, 1, 12).getTime();
    const addedAt = new Date(2025, 0, 5, 12).getTime();
    const noteUpdatedAt = new Date(2025, 3, 10, 12);

    beforeEach(() => {
      (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
      mockAuditedGetDocs.mockResolvedValue({ docs: [] });
      mockGetAllWatchedShows.mockResolvedValue([
        {
          metadata: { tvShowName: 'Zeta Show', posterPath: null, lastUpdated: 0 },
          episodes: {
            '2_1': {
              episodeId: 201,
              tvShowId: 20,
              seasonNumber: 2,
              episodeNumber: 1,
              watchedAt,
              episodeName: 'Return',
              episodeAirDate: null,
            },
            '1_2': {
              episodeId: 102,
              tvShowId: 20,
              seasonNumber: 1,
              episodeNumber: 2,
              watchedAt,
              episodeName: 'Second, "Quoted"',
              episodeAirDate: null,
            },
          },
        },
        {
          metadata: { tvShowName: 'Alpha Show', posterPath: null, lastUpdated: 0 },
          episodes: {
            '1_1': {
              episodeId: 11,
              tvShowId: 10,
              seasonNumber: 1,
              episodeNumber: 1,
              watchedAt,
              episodeName: 'Pilot',
              episodeAirDate: null,
            },
          },
        },
      ]);
      mockGetFavoriteEpisodes.mockResolvedValue([
        {
          id: '10-1-1',
          tvShowId: 10,
          seasonNumber: 1,
          episodeNumber: 1,
          episodeName: 'Pilot',
          showName: 'Alpha Show',
          posterPath: null,
          addedAt,
        },
      ]);
      mockGetUserNotes.mockResolvedValue([
        {
          id: 'movie-5',
          userId: 'test-user-id',
          mediaType: 'movie',
          mediaId: 5,
          content: 'Loved it, would\nwatch again',
          posterPath: null,
          mediaTitle: 'Some Movie',
          createdAt: noteUpdatedAt,
          updatedAt: noteUpdatedAt,
        },
        {
          id: 'episode-10-1-1',
          userId: 'test-user-id',
          mediaType: 'episode',
          mediaId: 11,
          showId: 10,
          seasonNumber: 1,
          episodeNumber: 1,
          content: 'Great opener',
          posterPath: null,
          mediaTitle: 'Alpha Show',
          createdAt: noteUpdatedAt,
          updatedAt: noteUpdatedAt,
        },
      ]);
    });

    it('adds the new categories and columns to the CSV', async () => {
      await exportUserData('csv');

      const content = getWrittenContent();
      const lines = content.trim().split('\n');
      expect(lines[0]).toBe('Category,Title,Type,Rating,Date,TMDB ID,Season,Episode,Note');

      const watchedLines = lines.filter((line) => line.startsWith('Watched Episode,'));
      expect(watchedLines).toEqual([
        `Watched Episode,Alpha Show - Pilot,Episode,,${localDate(watchedAt)},10,1,1,`,
        `Watched Episode,"Zeta Show - Second, ""Quoted""",Episode,,${localDate(watchedAt)},20,1,2,`,
        `Watched Episode,Zeta Show - Return,Episode,,${localDate(watchedAt)},20,2,1,`,
      ]);
      expect(content).toContain(
        `Favorite Episode,Alpha Show - Pilot,Episode,,${localDate(addedAt)},10,1,1,`
      );
      expect(content).toContain(
        `Note,Some Movie,Movie,,${localDate(noteUpdatedAt.getTime())},5,,,"Loved it, would\nwatch again"`
      );
      expect(content).toContain(
        `Note,Alpha Show,Episode,,${localDate(noteUpdatedAt.getTime())},10,1,1,Great opener`
      );
    });

    it('adds summary, watched episode, favorite episode, and note sections to Markdown', async () => {
      await exportUserData('markdown');

      const content = getWrittenContent();
      expect(content).toContain('- Watched episodes: 3 across 2 shows');
      expect(content).toContain('- Favorite episodes: 1');
      expect(content).toContain('- Notes: 2');

      const watchedSection = content.slice(
        content.indexOf('## Watched Episodes'),
        content.indexOf('## Favorite Episodes')
      );
      expect(watchedSection.indexOf('### Alpha Show')).toBeLessThan(
        watchedSection.indexOf('### Zeta Show')
      );
      expect(watchedSection.indexOf('- S1E2')).toBeLessThan(watchedSection.indexOf('- S2E1'));
      expect(watchedSection).toContain(`- S1E1 – Pilot (watched ${localDate(watchedAt)})`);

      expect(content).toContain('- **Alpha Show** – S1E1 Pilot');
      expect(content).toContain('### Some Movie (Movie)');
      expect(content).toContain('Loved it, would\nwatch again');
      expect(content).toContain('### Alpha Show (S1E1)');
    });
  });
});
