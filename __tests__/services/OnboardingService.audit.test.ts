import type { OnboardingSelections } from '@/src/types/onboarding';

const mockUpdateProfile = jest.fn();
const mockSetDoc = jest.fn();
const mockUpdatePreference = jest.fn();
const mockAddToList = jest.fn();
const mockAddFavoritePerson = jest.fn();
const mockMergeUserDocumentCache = jest.fn();
let mockCurrentUser: { uid: string; displayName: string | null; email: string | null } | null = {
  uid: 'test-user-id',
  displayName: null,
  email: 'fallback.user@example.com',
};

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
  db: {},
}));

jest.mock('firebase/auth', () => ({
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(() => ({ path: 'users/test-user-id' })),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
}));

jest.mock('@/src/services/PreferencesService', () => ({
  preferencesService: {
    updatePreference: (...args: unknown[]) => mockUpdatePreference(...args),
  },
}));

jest.mock('@/src/services/ListService', () => ({
  listService: {
    addToList: (...args: unknown[]) => mockAddToList(...args),
  },
}));

jest.mock('@/src/services/FavoritePersonsService', () => ({
  favoritePersonsService: {
    addFavoritePerson: (...args: unknown[]) => mockAddFavoritePerson(...args),
  },
}));

jest.mock('@/src/services/UserDocumentCache', () => ({
  mergeUserDocumentCache: (...args: unknown[]) => mockMergeUserDocumentCache(...args),
}));

describe('OnboardingService audited persistence', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockCurrentUser = {
      uid: 'test-user-id',
      displayName: null,
      email: 'fallback.user@example.com',
    };
    mockUpdateProfile.mockResolvedValue(undefined);
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdatePreference.mockResolvedValue(undefined);
    mockAddToList.mockResolvedValue(undefined);
    mockAddFavoritePerson.mockResolvedValue(undefined);
    mockMergeUserDocumentCache.mockReturnValue(undefined);
  });

  const loadService = () =>
    require('@/src/services/OnboardingService') as typeof import('@/src/services/OnboardingService');

  const selections: OnboardingSelections = {
    accentColor: '#E50914',
    displayName: 'Test User',
    homeScreenLists: [{ id: 'watchlist', type: 'tmdb', label: 'Watchlist' }],
    language: 'fr-FR',
    region: 'CA',
    selectedActors: [],
    selectedGenreIds: [18, 35],
    selectedMovies: [],
    selectedTVGenreIds: [10765],
    selectedTVShows: [
      {
        id: 11,
        name: 'Severance',
        poster_path: '/show.jpg',
        vote_average: 8.8,
        first_air_date: '2025-01-01',
        genre_ids: [10765],
      } as any,
    ],
  };

  // Verifies onboarding persistence now writes both movie and TV genre preferences alongside the existing required writes.
  it('persists language and favorite genre preference arrays during onboarding save', async () => {
    const { onboardingService } = loadService();

    await onboardingService.saveOnboarding(selections);

    expect(mockUpdatePreference).toHaveBeenCalledWith('homeScreenLists', selections.homeScreenLists);
    expect(mockUpdatePreference).toHaveBeenCalledWith(
      'favoriteMovieGenreIds',
      selections.selectedGenreIds
    );
    expect(mockUpdatePreference).toHaveBeenCalledWith(
      'favoriteTVGenreIds',
      selections.selectedTVGenreIds
    );
    expect(mockAddToList).toHaveBeenCalledWith(
      'currently-watching',
      expect.objectContaining({
        id: 11,
        media_type: 'tv',
        title: 'Severance',
      }),
      'Watching'
    );
  });
});
