import { AccountPrompt } from '@/src/components/profile/AccountPrompt';
import { ActionButton } from '@/src/components/profile/ActionButton';
import { UserInfoSection } from '@/src/components/profile/UserInfoSection';
import { SPACING } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { useProfileBackground } from '@/src/hooks/useProfileBackground';
import { useProfileLogic } from '@/src/hooks/useProfileLogic';
import { screenStyles } from '@/src/styles/screenStyles';
import {
  Delete02Icon,
  Download01Icon,
  Logout01Icon,
  UserEdit01Icon,
} from '@hugeicons/core-free-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AccountScreen() {
  const { t } = useTranslation();
  const { user, isGuest } = useAuth();
  const router = useRouter();
  const { profileBackground } = useProfileBackground();
  const {
    isPremium,
    isPremiumLoading,
    isSigningOut,
    isDeletingAccount,
    handleExportData,
    handleDeleteAccount,
    handleSignOut,
    handleUpgradePress,
  } = useProfileLogic();

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <UserInfoSection
          user={user}
          isGuest={isGuest}
          isPremium={isPremium}
          background={isGuest ? null : profileBackground}
        />

        <AccountPrompt
          isGuest={isGuest}
          isPremium={isPremium}
          isPremiumLoading={isPremiumLoading}
          isSigningOut={isSigningOut}
          onSignIn={handleSignOut}
          onUpgrade={handleUpgradePress}
        />

        <View style={styles.actionsList}>
          {!isGuest && (
            <ActionButton
              icon={UserEdit01Icon}
              label={t('profile.editProfile')}
              onPress={() => router.push('/(tabs)/profile/edit-profile')}
            />
          )}
          {!isGuest && (
            <ActionButton
              icon={Download01Icon}
              label={t('profile.exportData')}
              onPress={handleExportData}
            />
          )}
          <ActionButton
            icon={Delete02Icon}
            label={isDeletingAccount ? t('profile.deletingAccount') : t('profile.deleteAccount')}
            onPress={handleDeleteAccount}
            loading={isDeletingAccount}
            variant="danger"
          />
          <ActionButton
            icon={Logout01Icon}
            label={isSigningOut ? t('auth.signingOut') : t('auth.signOut')}
            onPress={handleSignOut}
            loading={isSigningOut}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: SPACING.l,
    paddingBottom: SPACING.xxl,
  },
  actionsList: {
    gap: SPACING.s,
    marginTop: SPACING.m,
  },
});
