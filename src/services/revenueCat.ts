import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

const REVENUECAT_ANDROID_PUBLIC_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_KEY ?? '';

let isConfigured = false;

export const configureRevenueCat = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return false;
  }

  if (!REVENUECAT_ANDROID_PUBLIC_KEY) {
    console.warn('EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_KEY is missing. RevenueCat is disabled.');
    return false;
  }

  if (isConfigured) {
    return true;
  }

  Purchases.configure({
    apiKey: REVENUECAT_ANDROID_PUBLIC_KEY,
  });

  await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
  isConfigured = true;
  return true;
};

export const isRevenueCatConfigured = (): boolean => isConfigured;
