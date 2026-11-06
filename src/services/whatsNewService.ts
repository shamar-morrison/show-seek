import { CURRENT_WHATS_NEW } from '@/src/constants/whatsNew';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const WHATS_NEW_LAST_SEEN_KEY = 'whatsNewLastSeenId';
const ONBOARDING_COMPLETE_KEY = 'hasCompletedOnboarding';

/** Testing aid: always shows the sheet. `__DEV__` makes production and preview builds ignore it. */
function isWhatsNewForced(): boolean {
  return __DEV__ && process.env.EXPO_PUBLIC_FORCE_WHATS_NEW === 'true';
}

export async function shouldShowWhatsNew(announcementId: string): Promise<boolean> {
  if (isWhatsNewForced()) return true;

  try {
    const [lastSeenId, hasCompletedOnboarding] = await Promise.all([
      AsyncStorage.getItem(WHATS_NEW_LAST_SEEN_KEY),
      AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY),
    ]);

    if (lastSeenId === announcementId) return false;

    // Nothing saved yet, so only someone who used the app before this feature existed qualifies.
    return lastSeenId !== null || hasCompletedOnboarding === 'true';
  } catch (error) {
    console.error('[whatsNewService] Failed to read state:', error);
    return false;
  }
}

export async function markWhatsNewSeen(announcementId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(WHATS_NEW_LAST_SEEN_KEY, announcementId);
  } catch (error) {
    console.error('[whatsNewService] Failed to save state:', error);
  }
}

/** New users already have everything in the current announcement, so they skip it. */
export async function markCurrentWhatsNewSeen(): Promise<void> {
  if (CURRENT_WHATS_NEW) {
    await markWhatsNewSeen(CURRENT_WHATS_NEW.id);
  }
}
