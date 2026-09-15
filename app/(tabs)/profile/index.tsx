import { AppSettingsSection } from '@/src/components/profile/AppSettingsSection';
import { HORIZONTAL_SCROLL_PROPS } from '@/src/components/ui/horizontalScrollProps';
import { ContentSettingsSection, CONTENT_ITEMS } from '@/src/components/profile/ContentSettingsSection';
import { IntegrationsSection, INTEGRATION_ITEMS } from '@/src/components/profile/IntegrationsSection';
import { PreferencesSection, PREFERENCE_ITEMS } from '@/src/components/profile/PreferencesSection';
import { UserInfoSection } from '@/src/components/profile/UserInfoSection';
import { WebAppModal } from '@/src/components/profile/WebAppModal';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Cancel01Icon, Search01Icon } from '@hugeicons/core-free-icons';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { useLanguage } from '@/src/context/LanguageProvider';
import { useRegion } from '@/src/context/RegionProvider';
import { useTrakt } from '@/src/context/TraktContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { usePreferences, useUpdatePreference } from '@/src/hooks/usePreferences';
import { useProfileLogic } from '@/src/hooks/useProfileLogic';
import { useProfileSearchScroll } from '@/src/hooks/useProfileSearchScroll';
import { getFirestoreReadAuditReport } from '@/src/services/firestoreReadAudit';
import { screenStyles } from '@/src/styles/screenStyles';
import { UserPreferences } from '@/src/types/preferences';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ProfileTab = 'preferences' | 'content' | 'integrations' | 'settings';

interface TabConfig {
  id: ProfileTab;
  label: string;
}

interface SearchIndexEntry {
  id: string;
  tab: ProfileTab;
  title: string;
  description: string;
  category: string;
}

/** How long a search-matched item stays highlighted (ms). */
const SEARCH_HIGHLIGHT_DURATION_MS = 1600;
/** Debounce delay for search-as-you-type (ms). */
const SEARCH_DEBOUNCE_MS = 200;

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { user, isGuest } = useAuth();
  const isAccountRequired = useAccountRequired();
  const {
    isPremium,
    isExporting,
    isSigningOut,
    isDeletingAccount,
    isClearingCache,
    showWebAppModal,
    handleRateApp,
    handleJoinDiscord,
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
  const [updatingPreferenceKey, setUpdatingPreferenceKey] = useState<keyof UserPreferences | null>(
    null
  );

  const tabs: TabConfig[] = useMemo(
    () => [
      { id: 'preferences', label: t('profile.tabs.preferences') },
      { id: 'content', label: t('profile.tabs.content') },
      { id: 'integrations', label: t('profile.tabs.integrations') },
      { id: 'settings', label: t('profile.tabs.settings') },
    ],
    [t]
  );

  const [selectedTab, setSelectedTab] = useState<ProfileTab>('preferences');
  const selectedTabRef = useRef(selectedTab);
  selectedTabRef.current = selectedTab;

  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const highlightTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizeQuery = useCallback(
    () => searchQuery.trim().toLowerCase(),
    [searchQuery]
  );

  const {
    scrollToItem,
    registerItemLayout,
    queuePendingScroll,
    resolvePendingScroll,
    clearPendingScroll,
  } = useProfileSearchScroll(scrollViewRef, normalizeQuery);

  const clearHighlightTimeout = useCallback(() => {
    if (highlightTimeout.current) {
      clearTimeout(highlightTimeout.current);
      highlightTimeout.current = null;
    }
  }, []);

  // Unified search index across Preferences, Content, and Integrations tabs.
  const searchIndex: SearchIndexEntry[] = useMemo(() => {
    const bulkActionModeLabel = preferences?.copyInsteadOfMove
      ? t('common.copy')
      : t('common.move');
    const entries: SearchIndexEntry[] = PREFERENCE_ITEMS.map((item) => ({
      id: item.key,
      tab: 'preferences' as ProfileTab,
      title:
        item.key === 'copyInsteadOfMove'
          ? t('profile.defaultBulkAction', { mode: bulkActionModeLabel })
          : t(item.titleKey),
      description: t(item.descKey),
      category: t(`profile.categories.${item.category}`),
    }));
    for (const item of CONTENT_ITEMS) {
      entries.push({
        id: item.id,
        tab: 'content',
        title: t(item.titleKey),
        description: '',
        category: t(`profile.categories.${item.category}`),
      });
    }
    for (const item of INTEGRATION_ITEMS) {
      entries.push({
        id: item.id,
        tab: 'integrations',
        title: t(item.titleKey),
        description: '',
        category: t(`profile.categories.${item.category}`),
      });
    }
    return entries;
  }, [t, preferences?.copyInsteadOfMove]);

  // Debounced search-as-you-type: jump to the first match, auto-switching tabs.
  // Both same-tab and cross-tab matches go through the same offset-based path.
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      clearHighlightTimeout();
      clearPendingScroll();
      setHighlightedId(null);
      return;
    }
    const timer = setTimeout(() => {
      const match = searchIndex.find(
        (entry) =>
          entry.title.toLowerCase().includes(query) ||
          entry.description.toLowerCase().includes(query) ||
          entry.category.toLowerCase().includes(query)
      );
      if (!match) {
        clearHighlightTimeout();
        clearPendingScroll();
        setHighlightedId(null);
        return;
      }
      clearHighlightTimeout();
      setHighlightedId(match.id);
      highlightTimeout.current = setTimeout(() => setHighlightedId(null), SEARCH_HIGHLIGHT_DURATION_MS);
      if (match.tab !== selectedTabRef.current) {
        // Cross-tab match: park the scroll; it resolves once the new tab's
        // onLayout offsets arrive (no fixed-delay race).
        queuePendingScroll(match.id, query);
        setSelectedTab(match.tab);
      } else if (!scrollToItem(match.id)) {
        // Same-tab match whose offset isn't recorded yet — resolve on layout.
        queuePendingScroll(match.id, query);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [
    searchQuery,
    searchIndex,
    scrollToItem,
    queuePendingScroll,
    clearPendingScroll,
    clearHighlightTimeout,
  ]);

  // After a tab switch, retry a parked scroll in case its offsets are already
  // recorded (e.g. returning to a visited tab). Otherwise the pending scroll
  // resolves when the target item's onLayout fires.
  useEffect(() => {
    resolvePendingScroll();
  }, [selectedTab, resolvePendingScroll]);

  useEffect(() => clearHighlightTimeout, [clearHighlightTimeout]);

  const handleReadDiagnosticsPress = useCallback(() => {
    if (!__DEV__) {
      return;
    }

    const report = getFirestoreReadAuditReport();
    const topCallsites = report.byCallsite
      .slice(0, 3)
      .map((entry) => `${entry.name}: ${entry.reads}`)
      .join('\n');

    Alert.alert(
      t('profile.readDiagnostics.title'),
      [
        t('profile.readDiagnostics.totalReads', { count: report.totalReads }),
        t('profile.readDiagnostics.events', { count: report.eventCount }),
        topCallsites ? `${t('profile.readDiagnostics.callsites')}\n${topCallsites}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }, [t]);

  const handlePreferenceUpdate = (key: keyof UserPreferences, value: boolean) => {
    if (isAccountRequired()) return;
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
    if (isAccountRequired()) return;
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
            highlightedId={highlightedId}
            registerItemLayout={registerItemLayout}
          />
        );
      case 'content':
        return (
          <ContentSettingsSection
            language={language}
            region={region}
            preferences={preferences}
            onLanguagePress={() => handleGuardedContentAction(handleLanguagePress)}
            onRegionPress={() => handleGuardedContentAction(handleRegionPress)}
            onColorPress={() => handleGuardedContentAction(handleColorPress)}
            onLaunchScreenPress={() => handleGuardedContentAction(handleLaunchScreenPress)}
            showTitle={false}
            highlightedId={highlightedId}
            registerItemLayout={registerItemLayout}
          />
        );
      case 'integrations':
        return (
          <IntegrationsSection
            isTraktConnected={isTraktConnected}
            isTraktLoading={isTraktLoading}
            onImdbImport={() => handleGuardedContentAction(handleImdbImport)}
            onTraktPress={() => handleGuardedContentAction(handleTraktPress)}
            showTitle={false}
            highlightedId={highlightedId}
            registerItemLayout={registerItemLayout}
          />
        );
      case 'settings':
        return (
          <AppSettingsSection
            isGuest={isGuest}
            isExporting={isExporting}
            isClearingCache={isClearingCache}
            isSigningOut={isSigningOut}
            isDeletingAccount={isDeletingAccount}
            onRateApp={handleRateApp}
            onExportData={handleExportData}
            onClearCache={handleClearCache}
            onWebApp={handleOpenWebApp}
            onAbout={handleAboutPress}
            onDiscord={handleJoinDiscord}
            onDeleteAccount={handleDeleteAccount}
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
        <TouchableOpacity
          style={styles.header}
          onLongPress={__DEV__ ? handleReadDiagnosticsPress : undefined}
          activeOpacity={1}
        >
          <Text style={styles.headerTitle}>{t('profile.title')}</Text>
        </TouchableOpacity>

        {/* User Info Section - Fixed at top */}
        <UserInfoSection
          user={user}
          isGuest={isGuest}
          isPremium={isPremium}
          onUpgradePress={handleUpgradePress}
          onSignOut={handleSignOut}
        />

        {/* Search */}
        <View style={styles.searchContainer}>
          <AppIcon icon={Search01Icon} size={18} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('common.search')}
            placeholderTextColor={COLORS.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={ACTIVE_OPACITY}>
              <AppIcon icon={Cancel01Icon} size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <ScrollView
            {...HORIZONTAL_SCROLL_PROPS}
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
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderTabContent()}
        </ScrollView>
      </KeyboardAvoidingView>

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
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    marginHorizontal: SPACING.l,
    marginTop: SPACING.m,
    gap: SPACING.s,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.text,
    paddingVertical: 0,
  },
  tabsContainer: {
    paddingTop: SPACING.m,
    marginBottom: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },  tabsContent: {
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
    fontFamily: FONT_FAMILY.semiBold,
  },
  activeTabText: {
    color: COLORS.white,
  },
});
