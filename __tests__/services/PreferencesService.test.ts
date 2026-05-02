import { DEFAULT_PREFERENCES } from '@/src/types/preferences';

const mockAuditedGetDoc = jest.fn();

jest.mock('@/src/firebase/config', () => ({
  db: {},
}));

jest.mock('@/src/services/firestoreReadAudit', () => ({
  auditedGetDoc: (...args: unknown[]) => mockAuditedGetDoc(...args),
  auditedOnSnapshot: jest.fn(),
}));

import { preferencesService } from '@/src/services/PreferencesService';

describe('PreferencesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to default genre ids when persisted genre arrays are malformed', async () => {
    mockAuditedGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        preferences: {
          favoriteMovieGenreIds: ['18', 35],
          favoriteTVGenreIds: { bad: true },
        },
      }),
    });

    const preferences = await preferencesService.fetchPreferences('user-1');

    expect(preferences.favoriteMovieGenreIds).toEqual(DEFAULT_PREFERENCES.favoriteMovieGenreIds);
    expect(preferences.favoriteTVGenreIds).toEqual(DEFAULT_PREFERENCES.favoriteTVGenreIds);
  });

  it('preserves valid persisted genre id arrays', async () => {
    mockAuditedGetDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        preferences: {
          favoriteMovieGenreIds: [18, 35],
          favoriteTVGenreIds: [10765],
        },
      }),
    });

    const preferences = await preferencesService.fetchPreferences('user-1');

    expect(preferences.favoriteMovieGenreIds).toEqual([18, 35]);
    expect(preferences.favoriteTVGenreIds).toEqual([10765]);
  });
});
