import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearPersonalOnboardingCache,
  getPersonalOnboardingCacheKey,
  persistPersonalOnboardingCache,
  readPersonalOnboardingCache,
} from '@/src/utils/personalOnboardingCache';

describe('personalOnboardingCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Verifies onboarding cache values can be written, read back, and then cleared cleanly.
  it('supports reading, writing, and clearing cached onboarding state', async () => {
    await persistPersonalOnboardingCache('user-1', true);
    expect(await readPersonalOnboardingCache('user-1')).toBe(true);

    await clearPersonalOnboardingCache('user-1');

    expect(await readPersonalOnboardingCache('user-1')).toBeNull();
  });

  // Verifies empty caches return null so callers can distinguish unknown state from a stored false value.
  it('returns null for an empty cache entry', async () => {
    expect(await readPersonalOnboardingCache('missing-user')).toBeNull();
  });

  // Verifies explicitly clearing stale cached data prevents the old value from being reused.
  it('does not reuse stale data after the cache is cleared', async () => {
    await AsyncStorage.setItem(getPersonalOnboardingCacheKey('user-2'), 'false');
    expect(await readPersonalOnboardingCache('user-2')).toBe(false);

    await clearPersonalOnboardingCache('user-2');

    expect(await readPersonalOnboardingCache('user-2')).toBeNull();
  });
});
