import AsyncStorage from '@react-native-async-storage/async-storage';

export const getPersonalOnboardingCacheKey = (userId: string) =>
  `hasCompletedPersonalOnboarding:${userId}`;

export const readPersonalOnboardingCache = async (userId: string): Promise<boolean | null> => {
  const value = await AsyncStorage.getItem(getPersonalOnboardingCacheKey(userId));

  if (value === null) {
    return null;
  }

  return value === 'true';
};

export const persistPersonalOnboardingCache = async (
  userId: string,
  value: boolean
): Promise<void> => {
  await AsyncStorage.setItem(getPersonalOnboardingCacheKey(userId), String(value));
};

export const clearPersonalOnboardingCache = async (userId: string): Promise<void> => {
  await AsyncStorage.removeItem(getPersonalOnboardingCacheKey(userId));
};
