import { AppIcon } from '@/src/components/ui/AppIcon';
import { APP_COMPATIBILITY_VERSION } from '@/src/constants/appCompatibility';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { fetchMinimumCompatibilityVersion, isBelowMinimum } from '@/src/services/appVersionGate';
import { Download04Icon } from '@hugeicons/core-free-icons';
import * as StoreReview from 'expo-store-review';
import * as Updates from 'expo-updates';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const ANDROID_PACKAGE_ID = 'app.horizon.showseek';
/** Re-check when the app comes back to the foreground, at most this often. */
const RECHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Blocks the app with "Update required" when this build's APP_COMPATIBILITY_VERSION is below
 * `minimumCompatibilityVersion` in Firestore `config/app`. Never blocks on a failed check alone.
 */
export function UpdateRequiredGate({ children }: { children: React.ReactNode }) {
  const [isUpdateRequired, setIsUpdateRequired] = useState(false);
  const lastCheckedAt = useRef(0);

  const check = useCallback(async () => {
    lastCheckedAt.current = Date.now();
    const minimum = await fetchMinimumCompatibilityVersion();
    setIsUpdateRequired(isBelowMinimum(minimum, APP_COMPATIBILITY_VERSION));
  }, []);

  useEffect(() => {
    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheckedAt.current >= RECHECK_INTERVAL_MS) {
        void check();
      }
    });
    return () => subscription.remove();
  }, [check]);

  if (isUpdateRequired) {
    return <UpdateRequiredScreen />;
  }
  return <>{children}</>;
}

export function UpdateRequiredScreen() {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleUpdate = async () => {
    setIsUpdating(true);
    setMessage(null);
    try {
      // An OTA update is the quickest fix and needs no store visit.
      if (Updates.isEnabled) {
        try {
          const result = await Updates.checkForUpdateAsync();
          if (result.isAvailable) {
            await Updates.fetchUpdateAsync();
            await Updates.reloadAsync();
            return;
          }
        } catch (error) {
          console.warn('[UpdateRequired] OTA update failed; falling back to the store.', error);
        }
      }

      if (await openStore()) {
        return;
      }
      setMessage(t('updateRequired.storeUnavailable'));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="update-required-screen">
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: hexToRGBA(accentColor, 0.16) }]}>
          <AppIcon icon={Download04Icon} size={32} color={accentColor} />
        </View>
        <Text style={styles.title}>{t('updateRequired.title')}</Text>
        <Text style={styles.body}>{t('updateRequired.body')}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: accentColor }]}
        onPress={handleUpdate}
        activeOpacity={ACTIVE_OPACITY}
        disabled={isUpdating}
        testID="update-required-button"
      >
        {isUpdating ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text style={styles.buttonText}>{t('updateRequired.updateButton')}</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

async function openStore(): Promise<boolean> {
  const candidates =
    Platform.OS === 'android'
      ? [
          `market://details?id=${ANDROID_PACKAGE_ID}`,
          `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`,
        ]
      : // iOS: the App Store link from app config (ios.appStoreUrl), when one is set.
        [typeof StoreReview.storeUrl === 'function' ? StoreReview.storeUrl() : null].filter(
          (url): url is string => !!url
        );

  for (const url of candidates) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      // Try the next one.
    }
  }
  return false;
}

const styles = StyleSheet.create({
  body: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.l,
    justifyContent: 'center',
    marginBottom: SPACING.l,
    marginHorizontal: SPACING.l,
    minHeight: 52,
  },
  buttonText: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
  },
  container: {
    backgroundColor: COLORS.background,
    flex: 1,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    gap: SPACING.m,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    marginBottom: SPACING.s,
    width: 80,
  },
  message: {
    color: COLORS.warning,
    fontSize: FONT_SIZE.s,
    textAlign: 'center',
  },
  title: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xl,
    textAlign: 'center',
  },
});
