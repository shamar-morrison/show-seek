import {
  markCurrentWhatsNewSeen,
  markWhatsNewSeen,
  shouldShowWhatsNew,
  WHATS_NEW_LAST_SEEN_KEY,
} from '@/src/services/whatsNewService';
import { CURRENT_WHATS_NEW } from '@/src/constants/whatsNew';
import AsyncStorage from '@react-native-async-storage/async-storage';

const setDev = (value: boolean) => {
  (global as unknown as { __DEV__: boolean }).__DEV__ = value;
};

describe('whatsNewService', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    delete process.env.EXPO_PUBLIC_FORCE_WHATS_NEW;
    setDev(true);
  });

  afterAll(() => {
    delete process.env.EXPO_PUBLIC_FORCE_WHATS_NEW;
    setDev(true);
  });

  it('shows to someone who used the app before this feature existed', async () => {
    await AsyncStorage.setItem('hasCompletedOnboarding', 'true');

    await expect(shouldShowWhatsNew('a')).resolves.toBe(true);
  });

  it('does not show to someone who has not finished onboarding', async () => {
    await expect(shouldShowWhatsNew('a')).resolves.toBe(false);
  });

  it('does not show again once seen', async () => {
    await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
    await markWhatsNewSeen('a');

    await expect(shouldShowWhatsNew('a')).resolves.toBe(false);
  });

  it('shows the next announcement after an older one was seen', async () => {
    await AsyncStorage.setItem('hasCompletedOnboarding', 'true');
    await markWhatsNewSeen('a');

    await expect(shouldShowWhatsNew('b')).resolves.toBe(true);
  });

  it('does not show a brand new user the announcement that shipped with their install', async () => {
    // Mirrors completeOnboarding, which runs before a new user first reaches Home.
    await markCurrentWhatsNewSeen();
    await AsyncStorage.setItem('hasCompletedOnboarding', 'true');

    await expect(AsyncStorage.getItem(WHATS_NEW_LAST_SEEN_KEY)).resolves.toBe(
      CURRENT_WHATS_NEW?.id
    );
    await expect(shouldShowWhatsNew(CURRENT_WHATS_NEW!.id)).resolves.toBe(false);
  });

  it('does not show when storage cannot be read', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('read failed'));
    await expect(shouldShowWhatsNew('a')).resolves.toBe(false);
    consoleError.mockRestore();
  });

  describe('EXPO_PUBLIC_FORCE_WHATS_NEW', () => {
    it('always shows in development, even after being seen', async () => {
      process.env.EXPO_PUBLIC_FORCE_WHATS_NEW = 'true';
      await markWhatsNewSeen('a');

      await expect(shouldShowWhatsNew('a')).resolves.toBe(true);
    });

    it('is ignored outside development', async () => {
      process.env.EXPO_PUBLIC_FORCE_WHATS_NEW = 'true';
      setDev(false);

      await expect(shouldShowWhatsNew('a')).resolves.toBe(false);
    });

    it('only reacts to the value true', async () => {
      process.env.EXPO_PUBLIC_FORCE_WHATS_NEW = 'false';

      await expect(shouldShowWhatsNew('a')).resolves.toBe(false);
    });
  });
});
