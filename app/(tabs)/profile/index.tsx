import SupportDevelopmentModal from '@/src/components/SupportDevelopmentModal';
import { AppSettingsSection } from '@/src/components/profile/AppSettingsSection';
import { ContentSettingsSection } from '@/src/components/profile/ContentSettingsSection';
import { PreferencesSection } from '@/src/components/profile/PreferencesSection';
import { ReauthView } from '@/src/components/profile/ReauthView';
import { UserInfoSection } from '@/src/components/profile/UserInfoSection';
import { WebAppModal } from '@/src/components/profile/WebAppModal';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useLanguage } from '@/src/context/LanguageProvider';
import { useRegion } from '@/src/context/RegionProvider';
import { useTrakt } from '@/src/context/TraktContext';
import { usePreferences, useUpdatePreference } from '@/src/hooks/usePreferences';
import { useProfileLogic } from '@/src/hooks/useProfileLogic';
import { UserPreferences } from '@/src/types/preferences';
import React from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const {
    user,
    isGuest,
    isPremium,
    showReauthModal,
    reauthPassword,
    reauthLoading,
    showSupportModal,
    isExporting,
    showWebAppModal,
    setReauthPassword,
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
  } = useProfileLogic();

  const { isConnected: isTraktConnected, isLoading: isTraktLoading } = useTrakt();
  const { language } = useLanguage();
  const { region } = useRegion();
  const {
    preferences,
    isLoading: preferencesLoading,
    error: preferencesError,
    refetch: refetchPreferences,
  } = usePreferences();
  const updatePreference = useUpdatePreference();

  const handlePreferenceUpdate = (key: keyof UserPreferences, value: boolean) => {
    updatePreference.mutate(
      { key, value },
      {
        onError: () => {
          Alert.alert('Error', 'Failed to update preference. Please try again.');
        },
      }
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Profile</Text>
          </View>

          {/* User Info Section */}
          <UserInfoSection
            user={user}
            isPremium={isPremium}
            isGuest={isGuest}
            onUpgradePress={handleUpgradePress}
          />

          {/* Preferences Section */}
          {!isGuest && (
            <PreferencesSection
              preferences={preferences}
              isLoading={preferencesLoading}
              error={preferencesError}
              onRetry={refetchPreferences}
              onUpdate={handlePreferenceUpdate}
              isUpdating={updatePreference.isPending}
              isPremium={isPremium}
              onPremiumPress={handlePremiumPress}
            />
          )}

          {/* Content Settings */}
          <ContentSettingsSection
            language={language}
            region={region}
            preferences={preferences}
            isTraktConnected={isTraktConnected}
            isTraktLoading={isTraktLoading}
            isGuest={isGuest}
            onLanguagePress={handleLanguagePress}
            onRegionPress={handleRegionPress}
            onLaunchScreenPress={handleLaunchScreenPress}
            onTraktPress={handleTraktPress}
          />

          {/* App Settings */}
          <AppSettingsSection
            isGuest={isGuest}
            isPremium={isPremium}
            isExporting={isExporting}
            onRateApp={handleRateApp}
            onFeedback={handleSendFeedback}
            onExportData={handleExportData}
            onWebApp={handleOpenWebApp}
            onSignOut={handleSignOut}
            onDeleteAccount={handleDeleteAccount}
          />

          {/* Re-auth Modal (inline) */}
          {showReauthModal && (
            <ReauthView
              password={reauthPassword}
              onPasswordChange={setReauthPassword}
              loading={reauthLoading}
              onCancel={cancelReauth}
              onConfirm={handleReauthAndDelete}
            />
          )}

          {/* Web App Navigation Modal */}
          <WebAppModal
            visible={showWebAppModal}
            onClose={handleCloseWebAppModal}
            onConfirm={handleConfirmOpenWebApp}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Support Development Modal */}
      <SupportDevelopmentModal visible={showSupportModal} onClose={handleCloseSupportModal} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SPACING.xxl,
  },
  header: {
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.white,
  },
});
