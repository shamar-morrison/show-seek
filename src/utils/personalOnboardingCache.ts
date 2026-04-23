import AsyncStorage from '@react-native-async-storage/async-storage';

export const getPersonalOnboardingCacheKey = (userId: string) =>
  `hasCompletedPersonalOnboarding:${userId}`;

export const persistPersonalOnboardingCache = async (
  userId: string,
  value: boolean
): Promise<void> => {
  await AsyncStorage.setItem(getPersonalOnboardingCacheKey(userId), String(value));
};
