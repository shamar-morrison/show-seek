import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
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
        'Permission Check Unavailable',
        'Unable to check notification permissions at this time. You can still try to enable notifications when setting a reminder.',
        [{ text: 'OK' }]
      );
    }
  };

  const requestPermission = async (): Promise<boolean> => {
    // Physical device check
    if (!Device.isDevice) {
      Alert.alert(
        'Notifications Not Available',
        'Push notifications only work on physical devices, not simulators.'
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
          'Notification Permission Required',
          'Reminders require notification permission. Please enable notifications in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
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
            'Permission Denied',
            'You need to enable notifications to set reminders for movie releases.'
          );
          return false;
        }

        return true;
      } catch (requestError) {
        console.error('[useNotificationPermissions] Failed to request permission:', requestError);

        Alert.alert(
          'Permission Request Failed',
          'Unable to request notification permissions at this time. Please try again later or enable notifications manually in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
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
        'Permission Check Failed',
        'Unable to verify notification permissions at this time. Please try again later.',
        [{ text: 'OK' }]
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
