import SupportDevelopmentModal from '@/src/components/SupportDevelopmentModal';
import { AppSettingsSection } from '@/src/components/profile/AppSettingsSection';
import { ContentSettingsSection } from '@/src/components/profile/ContentSettingsSection';
import { PreferencesSection } from '@/src/components/profile/PreferencesSection';
import { UserInfoSection } from '@/src/components/profile/UserInfoSection';
import { WebAppModal } from '@/src/components/profile/WebAppModal';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { useGuestAccess } from '@/src/context/GuestAccessContext';
import { useLanguage } from '@/src/context/LanguageProvider';
import { useRegion } from '@/src/context/RegionProvider';
import { screenStyles } from '@/src/styles/screenStyles';
import { useTrakt } from '@/src/context/TraktContext';
import { usePreferences, useUpdatePreference } from '@/src/hooks/usePreferences';
import { useProfileLogic } from '@/src/hooks/useProfileLogic';
import { UserPreferences } from '@/src/types/preferences';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ProfileTab = 'preferences' | 'content' | 'settings';

interface TabConfig {
  id: ProfileTab;
  label: string;
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { isGuest } = useAuth();
  const { requireAccount } = useGuestAccess();
  const {
    user,
    isPremium,
    showSupportModal,
    isExporting,
    isSigningOut,
    isClearingCache,
    showWebAppModal,
    handleCloseSupportModal,
    handleRateApp,
    handleSendFeedback,
    handleOpenWebApp,
    handleConfirmOpenWebApp,
    handleCloseWebAppModal,
    handleExportData,
    handleClearCache,
    handleSignOut,
    handleUpgradePress,
    handleLanguagePress,
    handleRegionPress,
    handleColorPress,
    handleLaunchScreenPress,
    handleTraktPress,
    handleAboutPress,
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
  const [updatingPreferenceKey, setUpdatingPreferenceKey] =
    useState<keyof UserPreferences | null>(null);

  const tabs: TabConfig[] = useMemo(
    () => [
      { id: 'preferences', label: t('profile.tabs.preferences') },
      { id: 'content', label: t('profile.tabs.content') },
      { id: 'settings', label: t('profile.tabs.settings') },
    ],
    [t]
  );

  const [selectedTab, setSelectedTab] = useState<ProfileTab>('preferences');

  const handlePreferenceUpdate = (key: keyof UserPreferences, value: boolean) => {
    if (isGuest && !requireAccount()) {
      return;
    }
    setUpdatingPreferenceKey(key);
    updatePreference.mutate(
      { key, value },
      {
        onError: () => {
          Alert.alert(t('common.error'), t('profile.updatePreferenceError'));
        },
        onSettled: () => {
          setUpdatingPreferenceKey(null);
        },
      }
    );
  };

  const handleGuardedContentAction = (action: () => void) => {
    if (isGuest && !requireAccount()) {
      return;
    }
    action();
  };

  const renderTabContent = () => {
    switch (selectedTab) {
      case 'preferences':
        return (
          <PreferencesSection
            preferences={preferences}
            isLoading={preferencesLoading}
            error={preferencesError}
            onRetry={refetchPreferences}
            onUpdate={handlePreferenceUpdate}
            isUpdating={updatePreference.isPending}
            isPremium={isPremium}
            onPremiumPress={() => handleGuardedContentAction(handlePremiumPress)}
            updatingPreferenceKey={updatingPreferenceKey}
            showTitle={false}
          />
        );
      case 'content':
        return (
          <ContentSettingsSection
            language={language}
            region={region}
            preferences={preferences}
            isTraktConnected={isTraktConnected}
            isTraktLoading={isTraktLoading}
            onLanguagePress={() => handleGuardedContentAction(handleLanguagePress)}
            onRegionPress={() => handleGuardedContentAction(handleRegionPress)}
            onColorPress={() => handleGuardedContentAction(handleColorPress)}
            onLaunchScreenPress={() => handleGuardedContentAction(handleLaunchScreenPress)}
            onTraktPress={() => handleGuardedContentAction(handleTraktPress)}
            showTitle={false}
          />
        );
      case 'settings':
        return (
          <AppSettingsSection
            isGuest={isGuest}
            isPremium={isPremium}
            isExporting={isExporting}
            isClearingCache={isClearingCache}
            isSigningOut={isSigningOut}
            onRateApp={handleRateApp}
            onFeedback={handleSendFeedback}
            onExportData={handleExportData}
            onClearCache={handleClearCache}
            onWebApp={handleOpenWebApp}
            onAbout={handleAboutPress}
            onSignOut={handleSignOut}
            showTitle={false}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('profile.title')}</Text>
        </View>

        {/* User Info Section - Fixed at top */}
        <UserInfoSection
          user={user}
          isGuest={isGuest}
          isPremium={isPremium}
          onUpgradePress={handleUpgradePress}
          onSignOut={handleSignOut}
        />

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
          >
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, selectedTab === tab.id && { backgroundColor: accentColor }]}
                onPress={() => setSelectedTab(tab.id)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={[styles.tabText, selectedTab === tab.id && styles.activeTabText]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Tab Content */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderTabContent()}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Support Development Modal */}
      <SupportDevelopmentModal visible={showSupportModal} onClose={handleCloseSupportModal} />

      {/* Web App Navigation Modal */}
      <WebAppModal
        visible={showWebAppModal}
        onClose={handleCloseWebAppModal}
        onConfirm={handleConfirmOpenWebApp}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
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
  tabsContainer: {
    paddingTop: SPACING.m,
    marginBottom: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  tabsContent: {
    paddingHorizontal: SPACING.l,
    gap: SPACING.m,
    paddingBottom: SPACING.m,
  },
  tab: {
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
  },
  tabText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  activeTabText: {
    color: COLORS.white,
  },
});
