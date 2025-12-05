import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';

export const useNotificationPermissions = () => {
  const [permissionStatus, setPermissionStatus] = useState<
    'granted' | 'denied' | 'undetermined' | 'checking'
  >('checking');

  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setPermissionStatus(status);
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

    const { status: existingStatus } = await Notifications.getPermissionsAsync();

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
    const { status } = await Notifications.requestPermissionsAsync();
    setPermissionStatus(status);

    if (status !== 'granted') {
      Alert.alert(
        'Permission Denied',
        'You need to enable notifications to set reminders for movie releases.'
      );
      return false;
    }

    return true;
  };

  return {
    permissionStatus,
    hasPermission: permissionStatus === 'granted',
    requestPermission,
    checkPermission,
  };
};
