import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

const REVENUECAT_ANDROID_PUBLIC_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_KEY ?? '';

let isConfigured = false;

export const configureRevenueCat = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return false;
  }

  console.log('[RevenueCat] configureRevenueCat called', {
    hasAndroidPublicKey: Boolean(REVENUECAT_ANDROID_PUBLIC_KEY),
    isConfigured,
  });

  if (!REVENUECAT_ANDROID_PUBLIC_KEY) {
    console.warn('EXPO_PUBLIC_REVENUECAT_ANDROID_PUBLIC_KEY is missing. RevenueCat is disabled.');
    return false;
  }

  if (isConfigured) {
    console.log('[RevenueCat] SDK already configured.');
    return true;
  }

  await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
  Purchases.configure({
    apiKey: REVENUECAT_ANDROID_PUBLIC_KEY,
  });

  isConfigured = true;
  console.log('[RevenueCat] SDK configured successfully.');
  return true;
};

export const isRevenueCatConfigured = (): boolean => isConfigured;
