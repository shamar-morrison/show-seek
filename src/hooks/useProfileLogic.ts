import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import { exportUserData } from '@/src/services/DataExportService';
import { profileService } from '@/src/services/ProfileService';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking } from 'react-native';

const SHOWSEEK_WEB_URL = 'https://show-seek-web.vercel.app';
const PACKAGE_ID = 'app.horizon.showseek';
const PLAY_STORE_URL = `market://details?id=${PACKAGE_ID}`;

/**
 * Custom hook that encapsulates all profile screen business logic.
 * Returns state and handlers for the profile screen.
 */
export function useProfileLogic() {
  const { user, signOut } = useAuth();
  const { isPremium } = usePremium();
  const router = useRouter();

  const [showReauthModal, setShowReauthModal] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthLoading, setReauthLoading] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showWebAppModal, setShowWebAppModal] = useState(false);

  const isGuest = user?.isAnonymous === true;

  const handleSupportDevelopment = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowSupportModal(true);
  }, []);

  const handleCloseSupportModal = useCallback(() => {
    setShowSupportModal(false);
  }, []);

  const handleRateApp = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Linking.openURL(PLAY_STORE_URL);
    } catch (_error) {
      try {
        await Linking.openURL(`https://play.google.com/store/apps/details?id=${PACKAGE_ID}`);
      } catch {
        Alert.alert('Error', 'Unable to open the Play Store');
      }
    }
  }, []);

  const handleSendFeedback = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const feedbackUrl = 'https://showseek.canny.io';

    try {
      await Linking.openURL(feedbackUrl);
    } catch {
      Alert.alert('Error', 'Unable to open the feedback page. Please try again.');
    }
  }, []);

  const handleOpenWebApp = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowWebAppModal(true);
  }, []);

  const handleConfirmOpenWebApp = useCallback(async () => {
    setShowWebAppModal(false);
    try {
      await Linking.openURL(SHOWSEEK_WEB_URL);
    } catch {
      Alert.alert('Error', 'Unable to open the ShowSeek website. Please try again.');
    }
  }, []);

  const handleCloseWebAppModal = useCallback(() => {
    setShowWebAppModal(false);
  }, []);

  const performExport = useCallback(async (format: 'csv' | 'markdown') => {
    setIsExporting(true);
    try {
      await exportUserData(format);
    } catch (error) {
      console.error('Export failed:', error);
      const message = error instanceof Error ? error.message : 'Failed to export data';
      Alert.alert('Export Failed', message);
    } finally {
      setIsExporting(false);
    }
  }, []);

  const handleExportData = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isGuest) {
      Alert.alert(
        'Guest Account',
        'Guest accounts have no data to export. Sign in to save and export your data.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!isPremium) {
      router.push('/premium');
      return;
    }

    Alert.alert('Export Data', 'Choose a format to export your lists, ratings, and favorites.', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Export as CSV',
        onPress: () => performExport('csv'),
      },
      {
        text: 'Export as Markdown',
        onPress: () => performExport('markdown'),
      },
    ]);
  }, [isGuest, isPremium, router, performExport]);

  const handleSignOut = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await signOut();
    } catch (_error) {
      Alert.alert('Error', 'Unable to sign out. Please try again.');
    }
  }, [signOut]);

  const handleDeleteAccount = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    if (isGuest) {
      Alert.alert('Guest Account', 'Guest accounts have no data to delete. Sign out to leave.', [
        { text: 'OK' },
      ]);
      return;
    }

    Alert.alert(
      'Delete Account',
      'This action is permanent and cannot be undone. All your data including ratings, favorites, lists, and watch history will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => setShowReauthModal(true),
        },
      ]
    );
  }, [isGuest]);

  const handleReauthAndDelete = useCallback(async () => {
    if (!reauthPassword.trim()) {
      Alert.alert('Error', 'Please enter your password');
      return;
    }

    setReauthLoading(true);
    try {
      await profileService.deleteAccountWithReauth(reauthPassword);
      setShowReauthModal(false);
    } catch (error: any) {
      Alert.alert(
        'Error',
        error.message || 'Unable to delete account. Please check your password and try again.'
      );
    } finally {
      setReauthLoading(false);
      setReauthPassword('');
    }
  }, [reauthPassword]);

  const cancelReauth = useCallback(() => {
    setShowReauthModal(false);
    setReauthPassword('');
  }, []);

  const handleUpgradePress = useCallback(() => {
    router.push('/premium');
  }, [router]);

  const handleLanguagePress = useCallback(() => {
    router.push('/(tabs)/profile/language' as any);
  }, [router]);

  const handleRegionPress = useCallback(() => {
    router.push('/(tabs)/profile/region' as any);
  }, [router]);

  const handleLaunchScreenPress = useCallback(() => {
    router.push('/(tabs)/profile/default-launch-screen' as any);
  }, [router]);

  const handleTraktPress = useCallback(() => {
    router.push('/(tabs)/profile/trakt-settings');
  }, [router]);

  const handlePremiumPress = useCallback(() => {
    router.push('/premium');
  }, [router]);

  return {
    // User
    user,
    isGuest,
    isPremium,

    // Modal states
    showReauthModal,
    reauthPassword,
    reauthLoading,
    showSupportModal,
    isExporting,
    showWebAppModal,

    // State setters
    setReauthPassword,

    // Handlers
    handleSupportDevelopment,
    handleCloseSupportModal,
    handleRateApp,
    handleSendFeedback,
    handleOpenWebApp,
    handleConfirmOpenWebApp,
    handleCloseWebAppModal,
    handleExportData,
    handleSignOut,
    handleDeleteAccount,
    handleReauthAndDelete,
    cancelReauth,
    handleUpgradePress,
    handleLanguagePress,
    handleRegionPress,
    handleLaunchScreenPress,
    handleTraktPress,
    handlePremiumPress,
  };
}
