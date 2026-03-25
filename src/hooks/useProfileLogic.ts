import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import { accountDeletionService } from '@/src/services/AccountDeletionService';
import { exportUserData } from '@/src/services/DataExportService';
import { clearLocalAccountData } from '@/src/utils/accountDeletion';
import { clearAppCache } from '@/src/utils/appCache';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking } from 'react-native';

const SHOWSEEK_WEB_URL = 'https://show-seek-web.shamar-webdev.workers.dev';
const PACKAGE_ID = 'app.horizon.showseek';
const PLAY_STORE_URL = `market://details?id=${PACKAGE_ID}`;

/**
 * Custom hook that encapsulates all profile screen business logic.
 * Returns state and handlers for the profile screen.
 */
export function useProfileLogic() {
  const { t } = useTranslation();
  const { user, resetSession, signOut } = useAuth();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const router = useRouter();

  const [isExporting, setIsExporting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [showWebAppModal, setShowWebAppModal] = useState(false);

  const handleRateApp = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Linking.openURL(PLAY_STORE_URL);
    } catch {
      try {
        await Linking.openURL(`https://play.google.com/store/apps/details?id=${PACKAGE_ID}`);
      } catch {
        Alert.alert(t('common.errorTitle'), t('profile.unableToOpenPlayStore'));
      }
    }
  }, [t]);

  const handleSendFeedback = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const feedbackUrl = 'https://showseek.canny.io';

    try {
      await Linking.openURL(feedbackUrl);
    } catch {
      Alert.alert(t('common.errorTitle'), t('profile.unableToOpenFeedback'));
    }
  }, [t]);

  const handleOpenWebApp = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowWebAppModal(true);
  }, []);

  const handleConfirmOpenWebApp = useCallback(async () => {
    setShowWebAppModal(false);
    try {
      await Linking.openURL(SHOWSEEK_WEB_URL);
    } catch {
      Alert.alert(t('common.errorTitle'), t('profile.unableToOpenWebsite'));
    }
  }, [t]);

  const handleCloseWebAppModal = useCallback(() => {
    setShowWebAppModal(false);
  }, []);

  const performExport = useCallback(
    async (format: 'csv' | 'markdown') => {
      setIsExporting(true);
      try {
        await exportUserData(format);
      } catch (error) {
        console.error('Export failed:', error);
        Alert.alert(t('profile.exportFailedTitle'), t('profile.exportFailedFallbackMessage'));
      } finally {
        setIsExporting(false);
      }
    },
    [t]
  );

  const handleExportData = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isPremiumLoading) {
      return;
    }

    if (!isPremium) {
      router.push('/premium');
      return;
    }

    Alert.alert(t('profile.exportDataTitle'), t('profile.exportDataMessage'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('profile.exportAsCsv'),
        onPress: () => performExport('csv'),
      },
      {
        text: t('profile.exportAsMarkdown'),
        onPress: () => performExport('markdown'),
      },
    ]);
  }, [isPremium, isPremiumLoading, router, performExport, t]);

  const handleImdbImport = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/profile/imdb-import' as any);
  }, [router]);

  const handleClearCache = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert(t('profile.clearCacheTitle'), t('profile.clearCacheMessage'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('common.clearAll'),
        style: 'destructive',
        onPress: async () => {
          setIsClearingCache(true);
          try {
            await clearAppCache();
            Alert.alert(t('common.success'), t('profile.cacheCleared'));
          } catch (error) {
            console.error('[profile] Failed to clear cache:', error);
            Alert.alert(t('common.errorTitle'), t('profile.clearCacheFailed'));
          } finally {
            setIsClearingCache(false);
          }
        },
      },
    ]);
  }, [t]);

  const handleSignOut = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsSigningOut(true);
    try {
      await signOut();
    } catch {
      Alert.alert(t('common.errorTitle'), t('auth.signOutFailed'));
    } finally {
      setIsSigningOut(false);
    }
  }, [signOut, t]);

  const executeDeleteAccount = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    setIsDeletingAccount(true);

    try {
      await accountDeletionService.deleteAccount();

      try {
        await clearLocalAccountData(user.uid);
      } catch (cleanupError) {
        console.warn(
          '[profile] Failed to clear local account data after remote deletion:',
          cleanupError
        );
      }

      try {
        await signOut();
      } catch (signOutError) {
        console.warn('[profile] Failed to sign out after account deletion:', signOutError);
        resetSession();
      }

      router.replace('/(auth)/sign-in');
    } catch (error) {
      console.error('[profile] Failed to delete account:', error);
      Alert.alert(t('common.errorTitle'), t('profile.deleteAccountFailed'));
    } finally {
      setIsDeletingAccount(false);
    }
  }, [resetSession, router, signOut, t, user?.uid]);

  const handleDeleteAccount = useCallback(() => {
    if (!user?.uid || isDeletingAccount) {
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Alert.alert(t('profile.deleteAccountTitle'), t('profile.deleteAccountMessage'), [
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
      {
        text: t('profile.deleteAccountContinue'),
        style: 'destructive',
        onPress: () => {
          Alert.alert(t('profile.deleteAccountFinalTitle'), t('profile.deleteAccountFinalMessage'), [
            {
              text: t('common.cancel'),
              style: 'cancel',
            },
            {
              text: t('profile.deleteAccountAction'),
              style: 'destructive',
              onPress: () => {
                void executeDeleteAccount();
              },
            },
          ]);
        },
      },
    ]);
  }, [executeDeleteAccount, isDeletingAccount, t, user?.uid]);

  const handleUpgradePress = useCallback(() => {
    router.push('/premium');
  }, [router]);

  const handleLanguagePress = useCallback(() => {
    router.push('/(tabs)/profile/language' as any);
  }, [router]);

  const handleRegionPress = useCallback(() => {
    router.push('/(tabs)/profile/region' as any);
  }, [router]);

  const handleColorPress = useCallback(() => {
    router.push('/(tabs)/profile/colors' as any);
  }, [router]);

  const handleLaunchScreenPress = useCallback(() => {
    router.push('/(tabs)/profile/default-launch-screen' as any);
  }, [router]);

  const handleTraktPress = useCallback(() => {
    router.push('/(tabs)/profile/trakt-settings');
  }, [router]);

  const handleAboutPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/profile/about' as any);
  }, [router]);

  const handlePremiumPress = useCallback(() => {
    router.push('/premium');
  }, [router]);

  return {
    // User
    user,
    isPremium,

    // Modal states
    isExporting,
    isSigningOut,
    isDeletingAccount,
    isClearingCache,
    showWebAppModal,

    // Handlers
    handleRateApp,
    handleSendFeedback,
    handleOpenWebApp,
    handleConfirmOpenWebApp,
    handleCloseWebAppModal,
    handleImdbImport,
    handleExportData,
    handleClearCache,
    handleDeleteAccount,
    handleSignOut,
    handleUpgradePress,
    handleLanguagePress,
    handleRegionPress,
    handleColorPress,
    handleLaunchScreenPress,
    handleTraktPress,
    handleAboutPress,
    handlePremiumPress,
  };
}
