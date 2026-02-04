import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform } from 'react-native';

/**
 * Creates a promise that rejects after the specified timeout
 */
const createTimeout = (ms: number): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Operation timed out')), ms);
  });
};

/**
 * Wraps an async operation with a timeout guard
 */
const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number = 5000): Promise<T> => {
  return Promise.race([promise, createTimeout(timeoutMs)]);
};

export const useNotificationPermissions = () => {
  const { t } = useTranslation();
  const [permissionStatus, setPermissionStatus] = useState<
    'granted' | 'denied' | 'undetermined' | 'checking'
  >('checking');

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    try {
      const { status } = await withTimeout(Notifications.getPermissionsAsync(), 5000);
      setPermissionStatus(status);
    } catch (error) {
      console.error('[useNotificationPermissions] Failed to check permission:', error);

      // Fall back gracefully - assume undetermined
      setPermissionStatus('undetermined');

      Alert.alert(
        t('notifications.permissionCheckUnavailableTitle'),
        t('notifications.permissionCheckUnavailableMessage'),
        [{ text: t('common.ok') }]
      );
    }
  };

  const requestPermission = async (): Promise<boolean> => {
    // Physical device check
    if (!Device.isDevice) {
      Alert.alert(
        t('notifications.notAvailableTitle'),
        t('notifications.notAvailableMessage')
      );
      return false;
    }

    try {
      const { status: existingStatus } = await withTimeout(
        Notifications.getPermissionsAsync(),
        5000
      );

      if (existingStatus === 'granted') {
        setPermissionStatus('granted');
        return true;
      }

      if (existingStatus === 'denied') {
        // Permission previously denied, need to open settings
        Alert.alert(
          t('notifications.permissionRequiredTitle'),
          t('notifications.permissionRequiredMessage'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('notifications.openSettings'),
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              },
            },
          ]
        );
        return false;
      }

      // Request permission
      try {
        const { status } = await withTimeout(Notifications.requestPermissionsAsync(), 5000);
        setPermissionStatus(status);

        if (status !== 'granted') {
          Alert.alert(
            t('notifications.permissionDeniedTitle'),
            t('notifications.permissionDeniedMessage')
          );
          return false;
        }

        return true;
      } catch (requestError) {
        console.error('[useNotificationPermissions] Failed to request permission:', requestError);

        Alert.alert(
          t('notifications.permissionRequestFailedTitle'),
          t('notifications.permissionRequestFailedMessage'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('notifications.openSettings'),
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              },
            },
          ]
        );
        return false;
      }
    } catch (error) {
      console.error('[useNotificationPermissions] Failed to check existing permission:', error);

      Alert.alert(
        t('notifications.permissionCheckFailedTitle'),
        t('notifications.permissionCheckFailedMessage'),
        [{ text: t('common.ok') }]
      );
      return false;
    }
  };

  return {
    permissionStatus,
    hasPermission: permissionStatus === 'granted',
    requestPermission,
    checkPermission,
  };
};
