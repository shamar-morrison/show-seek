import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { raceWithTimeout } from '@/src/utils/timeout';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform } from 'react-native';

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
      const { status } = await raceWithTimeout(Notifications.getPermissionsAsync(), {
        ms: 5000,
        message: 'Operation timed out',
      });
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
      const { status: existingStatus } = await raceWithTimeout(
        Notifications.getPermissionsAsync(),
        {
          ms: 5000,
          message: 'Operation timed out',
        }
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
        const { status } = await raceWithTimeout(Notifications.requestPermissionsAsync(), {
          ms: 5000,
          message: 'Operation timed out',
        });
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
