import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearOnboardingProgress,
  clearOnboardingStepIndex,
  persistOnboardingProgress,
  persistOnboardingStepIndex,
  readOnboardingProgress,
  readOnboardingStepIndex,
} from '@/src/utils/onboardingStepCache';
import type { OnboardingSelections } from '@/src/types/onboarding';

const mockSelections: OnboardingSelections = {
  region: 'US',
  displayName: 'Alex',
  homeScreenLists: [{ id: 'watchlist', type: 'tmdb', label: 'Watchlist' }],
  language: 'en-US',
  selectedGenreIds: [28, 12],
  selectedTVGenreIds: [10765],
  selectedTVShows: [],
  selectedMovies: [],
  selectedActors: [],
  accentColor: '#E50914',
};

describe('onboardingStepCache (combined progress)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('persists and reads combined progress correctly', async () => {
    await persistOnboardingProgress('user-123', {
      stepIndex: 5,
      selections: mockSelections,
      selectedViaOther: true,
    });

    const result = await readOnboardingProgress('user-123');
    expect(result).toEqual({
      stepIndex: 5,
      selections: mockSelections,
      selectedViaOther: true,
    });
  });

  it('returns null if no progress has been saved', async () => {
    const result = await readOnboardingProgress('user-unknown');
    expect(result).toBeNull();
  });

  it('clears combined progress correctly', async () => {
    await persistOnboardingProgress('user-123', {
      stepIndex: 7,
      selections: mockSelections,
    });
    await clearOnboardingProgress('user-123');

    const result = await readOnboardingProgress('user-123');
    expect(result).toBeNull();
  });

  it('handles corrupted stored JSON gracefully', async () => {
    await AsyncStorage.setItem('onboardingProgress:user-bad', 'invalid-json{{{');
    const result = await readOnboardingProgress('user-bad');
    expect(result).toBeNull();
  });

  it('supports legacy step index helpers with backwards compatibility', async () => {
    await persistOnboardingStepIndex('user-456', 3);
    const step = await readOnboardingStepIndex('user-456');
    expect(step).toBe(3);

    await clearOnboardingStepIndex('user-456');
    const cleared = await readOnboardingStepIndex('user-456');
    expect(cleared).toBeNull();
  });
});
