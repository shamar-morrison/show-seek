import type { OnboardingSelections } from '@/src/types/onboarding';

const mockUpdateProfile = jest.fn();
const mockSetDoc = jest.fn();
const mockDoc = jest.fn(() => ({ path: 'users/test-user-id' }));
const mockUpdatePreference = jest.fn();
const mockAddToList = jest.fn();
const mockAddFavoritePerson = jest.fn();
const mockMergeUserDocumentCache = jest.fn();

let mockCurrentUser: { uid: string; displayName: string | null; email: string | null } | null = null;

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
  db: {},
}));

jest.mock('firebase/auth', () => ({
  updateProfile: (...args: any[]) => mockUpdateProfile.apply(null, args),
}));

jest.mock('firebase/firestore', () => ({
  doc: (...args: any[]) => mockDoc.apply(null, args),
  setDoc: (...args: any[]) => mockSetDoc.apply(null, args),
}));

jest.mock('@/src/services/PreferencesService', () => ({
  preferencesService: {
    updatePreference: (...args: any[]) => mockUpdatePreference.apply(null, args),
  },
}));

jest.mock('@/src/services/ListService', () => ({
  listService: {
    addToList: (...args: any[]) => mockAddToList.apply(null, args),
  },
}));

jest.mock('@/src/services/FavoritePersonsService', () => ({
  favoritePersonsService: {
    addFavoritePerson: (...args: any[]) => mockAddFavoritePerson.apply(null, args),
  },
}));

jest.mock('@/src/services/UserDocumentCache', () => ({
  mergeUserDocumentCache: (...args: any[]) => mockMergeUserDocumentCache.apply(null, args),
}));

import { onboardingService } from '@/src/services/OnboardingService';

describe('OnboardingService', () => {
  const selections = {
    displayName: 'Test User',
    homeScreenLists: [{ id: 'watchlist', type: 'tmdb' as const, label: 'Watchlist' }],
    language: 'es-ES',
    selectedGenreIds: [],
    selectedTVShows: [
      {
        id: 1,
        name: 'Show One',
        poster_path: '/show.jpg',
        vote_average: 8.1,
        first_air_date: '2024-01-01',
        genre_ids: [],
      },
    ],
    selectedMovies: [
      {
        id: 2,
        title: 'Movie One',
        poster_path: '/movie.jpg',
        vote_average: 7.4,
        release_date: '2024-01-02',
        genre_ids: [],
      },
    ],
    selectedActors: [
      {
        id: 3,
        name: 'Actor One',
        profile_path: '/actor.jpg',
        known_for_department: 'Acting',
      },
    ],
    region: 'US',
    accentColor: '#E50914',
  } as unknown as OnboardingSelections;

  beforeEach(() => {
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

  it('resolves when every onboarding write succeeds', async () => {
    await expect(onboardingService.saveOnboarding(selections)).resolves.toBeUndefined();

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockUpdatePreference).toHaveBeenCalledTimes(1);
    expect(mockAddToList).toHaveBeenCalledTimes(3);
    expect(mockAddFavoritePerson).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'users/test-user-id' },
      { displayName: 'Test User', language: 'es-ES' },
      { merge: true }
    );
  });

  it('rejects when a required onboarding write fails after logging the summary', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockUpdatePreference.mockRejectedValueOnce(new Error('permission denied'));

    await expect(onboardingService.saveOnboarding(selections)).rejects.toThrow(
      '[OnboardingService] Failed onboarding operations: home-screen-lists'
    );

    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    expect(mockUpdatePreference).toHaveBeenCalledTimes(1);
    expect(mockAddToList).toHaveBeenCalledTimes(3);
    expect(mockAddFavoritePerson).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[OnboardingService] Failed onboarding operations:',
      expect.arrayContaining([
        expect.objectContaining({
          label: 'home-screen-lists',
          reason: expect.any(Error),
        }),
      ])
    );

    consoleErrorSpy.mockRestore();
  });

  it('retries an optional timeout once and resolves when the retry succeeds', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAddFavoritePerson
      .mockRejectedValueOnce(new Error('Request timed out'))
      .mockResolvedValueOnce(undefined);

    await expect(onboardingService.saveOnboarding(selections)).resolves.toBeUndefined();

    expect(mockAddFavoritePerson).toHaveBeenCalledTimes(2);
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('logs optional timeout failures after one retry and still resolves', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAddFavoritePerson.mockRejectedValue(new Error('Request timed out'));

    await expect(onboardingService.saveOnboarding(selections)).resolves.toBeUndefined();

    expect(mockAddFavoritePerson).toHaveBeenCalledTimes(2);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[OnboardingService] Optional onboarding operations failed:',
      expect.arrayContaining([
        expect.objectContaining({
          label: 'actor-3',
          reason: expect.any(Error),
        }),
      ])
    );

    consoleWarnSpy.mockRestore();
  });

  it('logs non-retryable optional failures without blocking completion', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAddFavoritePerson.mockRejectedValue(new Error('permission denied'));

    await expect(onboardingService.saveOnboarding(selections)).resolves.toBeUndefined();

    expect(mockAddFavoritePerson).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[OnboardingService] Optional onboarding operations failed:',
      expect.arrayContaining([
        expect.objectContaining({
          label: 'actor-3',
          reason: expect.any(Error),
        }),
      ])
    );

    consoleWarnSpy.mockRestore();
  });

  it('backfills a fallback display name from the auth email when the onboarding input is blank', async () => {
    await expect(
      onboardingService.saveOnboarding({
        ...selections,
        displayName: '   ',
      })
    ).resolves.toBeUndefined();

    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'test-user-id' }),
      { displayName: 'fallback.user' }
    );
    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'users/test-user-id' },
      { displayName: 'fallback.user', language: 'es-ES' },
      { merge: true }
    );
    expect(mockMergeUserDocumentCache).toHaveBeenCalledWith('test-user-id', {
      displayName: 'fallback.user',
      language: 'es-ES',
    });
  });
});
