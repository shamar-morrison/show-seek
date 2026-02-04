/**
 * Trakt Settings Screen
 *
 * Dedicated screen for Trakt integration settings with four states:
 * 1. Not connected - Connect button with sync info
 * 2. Connected, not synced - Import button
 * 3. Syncing - Progress spinner
 * 4. Synced - Stats display with sync/disconnect options
 */

import { TraktLogo } from '@/src/components/icons/TraktLogo';
import {
  CollapsibleCategory,
  CollapsibleFeatureItem,
} from '@/src/components/ui/CollapsibleCategory';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { PremiumBadge } from '@/src/components/ui/PremiumBadge';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  SPACING,
  hexToRGBA,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePremium } from '@/src/context/PremiumContext';
import { useTrakt } from '@/src/context/TraktContext';
import { screenStyles } from '@/src/styles/screenStyles';
import { formatDistanceToNow } from 'date-fns';
import { enUS, es, pt, ptBR } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Link2,
  RefreshCw,
  Sparkles,
  Unlink,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Trakt brand color
const TRAKT_COLOR = '#ED1C24';

export default function TraktSettingsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { accentColor } = useAccentColor();
  const {
    isConnected,
    isSyncing,
    isEnriching,
    lastSyncedAt,
    lastEnrichedAt,
    syncStatus,
    isLoading,
    connectTrakt,
    disconnectTrakt,
    syncNow,
    enrichData,
  } = useTrakt();

  const { isPremium } = usePremium();

  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const distanceLocale = useMemo(() => {
    switch (i18n.language) {
      case 'es-ES':
      case 'es-MX':
        return es;
      case 'pt-BR':
        return ptBR;
      case 'pt-PT':
        return pt;
      default:
        return enUS;
    }
  }, [i18n.language]);

  const handleConnect = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsConnecting(true);
    try {
      await connectTrakt();
    } catch (error) {
      console.error('Failed to connect Trakt:', error);
      Alert.alert(t('trakt.connectionFailedTitle'), t('trakt.connectionFailedMessage'));
    } finally {
      setIsConnecting(false);
    }
  }, [connectTrakt, t]);

  const handleSync = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await syncNow();
    } catch (error) {
      console.error('Failed to sync:', error);
      Alert.alert(t('trakt.syncFailedTitle'), t('trakt.syncFailedMessage'));
    }
  }, [syncNow, t]);

  const handleDisconnect = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      t('trakt.disconnectTitle'),
      t('trakt.disconnectMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('trakt.disconnectButton'),
          style: 'destructive',
          onPress: async () => {
            setIsDisconnecting(true);
            try {
              await disconnectTrakt();
            } catch (error) {
              console.error('Failed to disconnect:', error);
              Alert.alert(
                t('trakt.disconnectFailedTitle'),
                t('trakt.disconnectFailedMessage')
              );
            } finally {
              setIsDisconnecting(false);
            }
          },
        },
      ]
    );
  }, [disconnectTrakt, t]);

  const handleEnrich = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await enrichData();
    } catch (error) {
      console.error('Failed to enrich:', error);
      Alert.alert(t('trakt.enrichmentFailedTitle'), t('trakt.enrichmentFailedMessage'));
    }
  }, [enrichData, t]);

  if (isLoading) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
        <FullScreenLoading />
      </SafeAreaView>
    );
  }

  // State: Syncing
  if (isSyncing) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={ACTIVE_OPACITY}>
            <ArrowLeft size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('trakt.syncingHeader')}</Text>
        </View>
        <View style={styles.syncingContainer}>
          <View style={styles.syncingIconContainer}>
            <RefreshCw size={48} color={TRAKT_COLOR} />
          </View>
          <Text style={styles.syncingTitle}>{t('trakt.syncingTitle')}</Text>
          <Text style={styles.syncingSubtitle}>
            {t('trakt.syncingSubtitle')}
          </Text>
          <ActivityIndicator size="large" color={TRAKT_COLOR} style={styles.syncingSpinner} />

          <View style={styles.estimateContainer}>
            <Text style={styles.estimateText}>{t('trakt.syncingEstimate')}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // State: Enriching
  if (isEnriching) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={ACTIVE_OPACITY}>
            <ArrowLeft size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('trakt.enrichingHeader')}</Text>
        </View>
        <View style={styles.syncingContainer}>
          <View style={styles.syncingIconContainer}>
            <Sparkles size={48} color={COLORS.warning} />
          </View>
          <Text style={styles.syncingTitle}>{t('trakt.enrichingTitle')}</Text>
          <Text style={styles.syncingSubtitle}>{t('trakt.enrichingSubtitle')}</Text>
          <ActivityIndicator size="large" color={COLORS.warning} style={styles.syncingSpinner} />

          <View style={styles.estimateContainer}>
            <Text style={styles.estimateText}>{t('trakt.enrichingEstimate')}</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // State: Not connected
  if (!isConnected) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={ACTIVE_OPACITY}>
            <ArrowLeft size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('trakt.connectHeader')}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.heroSection}>
            <View style={styles.syncIconsContainer}>
              <TraktLogo size={65} />
              <ArrowRight size={24} color={COLORS.textSecondary} style={styles.arrowIcon} />
              <View style={styles.showSeekIconCircle}>
                <Image
                  source={require('@/assets/images/icon.png')}
                  style={styles.showSeekIcon}
                  contentFit="contain"
                />
              </View>
            </View>
            <Text style={styles.heroTitle}>{t('trakt.connectHeroTitle')}</Text>
            <Text style={styles.heroSubtitle}>
              {t('trakt.connectHeroSubtitle')}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: TRAKT_COLOR }]}
            onPress={() => {
              if (!isPremium) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/premium');
              } else {
                handleConnect();
              }
            }}
            activeOpacity={ACTIVE_OPACITY}
            disabled={isConnecting}
          >
            {isConnecting ? (
                <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Link2 size={20} color={COLORS.white} />
                <Text style={styles.primaryButtonText}>{t('trakt.connectButton')}</Text>
                {!isPremium && <PremiumBadge />}
              </>
            )}
          </TouchableOpacity>

          <CollapsibleCategory title={t('trakt.whatWillBeSyncedTitle')} defaultExpanded>
            <CollapsibleFeatureItem text={t('trakt.willSync.watchedMoviesAndShows')} icon="checkmark-circle" />
            <CollapsibleFeatureItem text={t('library.ratings')} icon="checkmark-circle" />
            <CollapsibleFeatureItem text={t('trakt.willSync.customLists')} icon="checkmark-circle" />
            <CollapsibleFeatureItem text={t('library.watchlist')} icon="checkmark-circle" />
            <CollapsibleFeatureItem text={t('library.favorites')} icon="checkmark-circle" />
            <CollapsibleFeatureItem text={t('trakt.willSync.episodeProgress')} icon="checkmark-circle" />
          </CollapsibleCategory>

          <CollapsibleCategory title={t('trakt.howItWorksTitle')}>
            <CollapsibleFeatureItem
              text={t('trakt.howItWorks.connectTitle')}
              description={t('trakt.howItWorks.connectDescription')}
              icon="log-in-outline"
            />
            <CollapsibleFeatureItem
              text={t('trakt.howItWorks.importTitle')}
              description={t('trakt.howItWorks.importDescription')}
              icon="cloud-download-outline"
            />
            <CollapsibleFeatureItem
              text={t('trakt.howItWorks.enrichTitle')}
              description={t('trakt.howItWorks.enrichDescription')}
              icon="sparkles-outline"
            />
            <CollapsibleFeatureItem
              text={t('trakt.howItWorks.conflictsTitle')}
              description={t('trakt.howItWorks.conflictsDescription')}
              icon="information-circle-outline"
            />
          </CollapsibleCategory>

          <View style={styles.privacyNote}>
            <AlertCircle size={16} color={COLORS.textSecondary} />
            <Text style={styles.privacyNoteText}>
              {t('trakt.privacyNote')}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // State: Connected but not synced yet
  if (!lastSyncedAt) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={ACTIVE_OPACITY}>
            <ArrowLeft size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('trakt.connectedHeader')}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.heroSection}>
            <View style={[styles.iconCircle, { backgroundColor: COLORS.success }]}>
              <Check size={32} color={COLORS.white} />
            </View>
            <Text style={styles.heroTitle}>{t('trakt.connectedTitle')}</Text>
            <Text style={styles.heroSubtitle}>
              {t('trakt.connectedSubtitle')}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: TRAKT_COLOR }]}
            onPress={handleSync}
            activeOpacity={ACTIVE_OPACITY}
          >
            <RefreshCw size={20} color={COLORS.white} />
            <Text style={styles.primaryButtonText}>{t('trakt.importButton')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.disconnectButton}
            onPress={handleDisconnect}
            activeOpacity={ACTIVE_OPACITY}
            disabled={isDisconnecting}
          >
            {isDisconnecting ? (
              <ActivityIndicator color={COLORS.error} />
            ) : (
              <>
                <Unlink size={18} color={COLORS.error} />
                <Text style={styles.disconnectButtonText}>{t('trakt.disconnectButton')}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // State: Connected and synced
  const itemsSynced = syncStatus?.itemsSynced;

  return (
    <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={ACTIVE_OPACITY}>
          <ArrowLeft size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('trakt.connectedScreenHeader')}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.statusSection}>
          <View style={[styles.iconCircle, { backgroundColor: COLORS.success }]}>
            <Check size={32} color={COLORS.white} />
          </View>
          <Text style={styles.lastSyncText}>
            {t('trakt.lastSynced', {
              time: formatDistanceToNow(lastSyncedAt, { addSuffix: true, locale: distanceLocale }),
            })}
          </Text>
        </View>

        {itemsSynced && (
          <View style={styles.statsContainer}>
            <Text style={styles.statsTitle}>{t('trakt.syncedItemsTitle')}</Text>
            <View style={styles.statsGrid}>
              {itemsSynced.movies > 0 && <StatItem label={t('media.movies')} value={itemsSynced.movies} />}
              {itemsSynced.shows > 0 && <StatItem label={t('media.tvShows')} value={itemsSynced.shows} />}
              {itemsSynced.episodes > 0 && (
                <StatItem label={t('media.episodes')} value={itemsSynced.episodes} />
              )}
              {itemsSynced.ratings > 0 && <StatItem label={t('library.ratings')} value={itemsSynced.ratings} />}
              {itemsSynced.lists > 0 && <StatItem label={t('library.lists')} value={itemsSynced.lists} />}
              {itemsSynced.favorites > 0 && (
                <StatItem label={t('library.favorites')} value={itemsSynced.favorites} />
              )}
              {itemsSynced.watchlistItems > 0 && (
                <StatItem label={t('library.watchlist')} value={itemsSynced.watchlistItems} />
              )}
            </View>
          </View>
        )}

        {syncStatus?.errors && syncStatus.errors.length > 0 && (
          <View style={[styles.errorsContainer, { backgroundColor: hexToRGBA(accentColor, 0.1) }]}>
            <Text style={styles.errorsTitle}>{t('trakt.syncErrorsTitle')}</Text>
            {syncStatus.errors.slice(0, 3).map((error, index) => (
              <Text key={index} style={styles.errorText}>
                • {error}
              </Text>
            ))}
            {syncStatus.errors.length > 3 && (
              <Text style={styles.errorText}>
                {t('trakt.moreErrors', { count: syncStatus.errors.length - 3 })}
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: TRAKT_COLOR }]}
          onPress={handleSync}
          activeOpacity={ACTIVE_OPACITY}
        >
          <RefreshCw size={20} color={COLORS.white} />
          <Text style={styles.primaryButtonText}>{t('trakt.syncNowButton')}</Text>
        </TouchableOpacity>

        {/* Enrichment Section - show if synced but not enriched yet, or always in dev mode */}
        {lastSyncedAt && (!lastEnrichedAt || __DEV__) && (
          <View style={styles.enrichmentSection}>
            <View style={styles.enrichmentHeader}>
              <Sparkles size={24} color={COLORS.warning} />
              <Text style={styles.enrichmentTitle}>
                {__DEV__ && lastEnrichedAt
                  ? t('trakt.enrichment.devTitle')
                  : t('trakt.enrichment.title')}
              </Text>
            </View>
            <Text style={styles.enrichmentDescription}>
              {__DEV__ && lastEnrichedAt
                ? t('trakt.enrichment.devDescription')
                : t('trakt.enrichment.description')}
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: COLORS.warning }]}
              onPress={handleEnrich}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Sparkles size={20} color={COLORS.white} />
              <Text style={styles.primaryButtonText}>
                {__DEV__ && lastEnrichedAt
                  ? t('trakt.enrichment.devButton')
                  : t('trakt.enrichment.button')}
              </Text>
            </TouchableOpacity>
            <Text style={styles.enrichmentNote}>
              {__DEV__
                ? t('trakt.enrichment.devNote')
                : t('trakt.enrichment.note')}
            </Text>
          </View>
        )}

        {/* Show enrichment status if already enriched */}
        {lastEnrichedAt && (
          <View style={styles.enrichedBadge}>
            <Check size={16} color={COLORS.success} />
            <Text style={styles.enrichedText}>
              {t('trakt.enriched', {
                time: formatDistanceToNow(lastEnrichedAt, { addSuffix: true, locale: distanceLocale }),
              })}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.disconnectButton}
          onPress={handleDisconnect}
          activeOpacity={ACTIVE_OPACITY}
          disabled={isDisconnecting}
        >
          {isDisconnecting ? (
            <ActivityIndicator color={COLORS.error} />
          ) : (
            <>
              <Unlink size={18} color={COLORS.error} />
              <Text style={styles.disconnectButtonText}>{t('trakt.disconnectTraktButton')}</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
    gap: SPACING.m,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.white,
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.l,
    paddingBottom: SPACING.xxl,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  syncIconsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.l,
    gap: SPACING.m,
  },
  traktIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  arrowIcon: {
    marginHorizontal: SPACING.s,
  },
  showSeekIconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  showSeekIcon: {
    width: 93,
    height: 93,
  },
  heroTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: SPACING.s,
  },
  heroSubtitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.l,
    gap: SPACING.s,
    marginBottom: SPACING.m,
  },
  primaryButtonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
    color: COLORS.white,
  },

  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.s,
    marginTop: SPACING.l,
    padding: SPACING.m,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
  },
  privacyNoteText: {
    flex: 1,
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.m,
    gap: SPACING.s,
    marginTop: SPACING.m,
  },
  disconnectButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.error,
    fontWeight: '500',
  },
  syncingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  syncingIconContainer: {
    marginBottom: SPACING.l,
  },
  syncingTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: SPACING.s,
  },
  syncingSubtitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  syncingSpinner: {
    marginTop: SPACING.xl,
  },
  estimateContainer: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
  },
  estimateText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  statusSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  lastSyncText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    marginTop: SPACING.m,
  },
  statsContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    marginBottom: SPACING.l,
  },
  statsTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.m,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
  },
  statItem: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.m,
    minWidth: 80,
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  errorsContainer: {
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.m,
    marginBottom: SPACING.l,
  },
  errorsTitle: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.error,
    marginBottom: SPACING.s,
  },
  errorText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.error,
    opacity: 0.8,
    lineHeight: 18,
  },
  enrichmentSection: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    marginBottom: SPACING.l,
    borderWidth: 1,
    borderColor: COLORS.warning + '40',
  },
  enrichmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    marginBottom: SPACING.s,
  },
  enrichmentTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.warning,
  },
  enrichmentDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: SPACING.m,
    lineHeight: 18,
  },
  enrichmentNote: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.s,
  },
  enrichedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.m,
    backgroundColor: 'rgba(70, 211, 105, 0.1)',
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
  },
  enrichedText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.success,
  },
});
