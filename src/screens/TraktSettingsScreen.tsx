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
import { PremiumBadge } from '@/src/components/ui/PremiumBadge';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { useTrakt } from '@/src/context/TraktContext';
import { formatDistanceToNow } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronLeft,
  Link2,
  RefreshCw,
  Sparkles,
  Unlink,
} from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Trakt brand color
const TRAKT_COLOR = '#ED1C24';

export default function TraktSettingsScreen() {
  const router = useRouter();
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

  const handleConnect = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsConnecting(true);
    try {
      await connectTrakt();
    } catch (error) {
      console.error('Failed to connect Trakt:', error);
      Alert.alert('Connection Failed', 'Unable to connect to Trakt. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  }, [connectTrakt]);

  const handleSync = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await syncNow();
    } catch (error) {
      console.error('Failed to sync:', error);
      Alert.alert('Sync Failed', 'Unable to sync with Trakt. Please try again.');
    }
  }, [syncNow]);

  const handleDisconnect = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Disconnect Trakt',
      'Are you sure you want to disconnect your Trakt account? Your synced data will remain in the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setIsDisconnecting(true);
            try {
              await disconnectTrakt();
            } catch (error) {
              console.error('Failed to disconnect:', error);
              Alert.alert(
                'Disconnect Failed',
                'Unable to disconnect from Trakt. Please try again.'
              );
            } finally {
              setIsDisconnecting(false);
            }
          },
        },
      ]
    );
  }, [disconnectTrakt]);

  const handleEnrich = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await enrichData();
    } catch (error) {
      console.error('Failed to enrich:', error);
      Alert.alert('Enrichment Failed', 'Unable to enrich data. Please try again.');
    }
  }, [enrichData]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // State: Syncing
  if (isSyncing) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={ACTIVE_OPACITY}>
            <ChevronLeft size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Syncing with Trakt...</Text>
        </View>
        <View style={styles.syncingContainer}>
          <View style={styles.syncingIconContainer}>
            <RefreshCw size={48} color={TRAKT_COLOR} />
          </View>
          <Text style={styles.syncingTitle}>Importing your watch history</Text>
          <Text style={styles.syncingSubtitle}>
            This may take a few minutes depending on the size of your library...
          </Text>
          <ActivityIndicator size="large" color={TRAKT_COLOR} style={styles.syncingSpinner} />

          <View style={styles.estimateContainer}>
            <Text style={styles.estimateText}>Usually takes 2-3 minutes</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // State: Enriching
  if (isEnriching) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={ACTIVE_OPACITY}>
            <ChevronLeft size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Enriching Your Library...</Text>
        </View>
        <View style={styles.syncingContainer}>
          <View style={styles.syncingIconContainer}>
            <Sparkles size={48} color={COLORS.warning} />
          </View>
          <Text style={styles.syncingTitle}>Fetching posters, ratings, and genres</Text>
          <Text style={styles.syncingSubtitle}>Adding TMDB metadata to your synced items...</Text>
          <ActivityIndicator size="large" color={COLORS.warning} style={styles.syncingSpinner} />

          <View style={styles.estimateContainer}>
            <Text style={styles.estimateText}>Takes 1-5 minutes for large libraries</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // State: Not connected
  if (!isConnected) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={ACTIVE_OPACITY}>
            <ChevronLeft size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Connect with Trakt</Text>
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
            <Text style={styles.heroTitle}>Sync your movie and TV show history from Trakt</Text>
            <Text style={styles.heroSubtitle}>
              Import your watched items, ratings, and lists from your Trakt account.
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
                <Text style={styles.primaryButtonText}>Connect to Trakt</Text>
                {!isPremium && <PremiumBadge />}
              </>
            )}
          </TouchableOpacity>

          <CollapsibleCategory title="What will be synced" defaultExpanded>
            <CollapsibleFeatureItem text="Watched movies & shows" icon="checkmark-circle" />
            <CollapsibleFeatureItem text="Ratings" icon="checkmark-circle" />
            <CollapsibleFeatureItem text="Custom lists" icon="checkmark-circle" />
            <CollapsibleFeatureItem text="Watchlist" icon="checkmark-circle" />
            <CollapsibleFeatureItem text="Favorites" icon="checkmark-circle" />
            <CollapsibleFeatureItem text="Episode progress" icon="checkmark-circle" />
          </CollapsibleCategory>

          <View style={styles.privacyNote}>
            <AlertCircle size={16} color={COLORS.textSecondary} />
            <Text style={styles.privacyNoteText}>
              Data is imported read-only. Your Trakt account will not be modified.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // State: Connected but not synced yet
  if (!lastSyncedAt) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={ACTIVE_OPACITY}>
            <ChevronLeft size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Connected to Trakt</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.heroSection}>
            <View style={[styles.iconCircle, { backgroundColor: COLORS.success }]}>
              <Check size={32} color={COLORS.white} />
            </View>
            <Text style={styles.heroTitle}>Your Trakt account is connected!</Text>
            <Text style={styles.heroSubtitle}>
              You haven't synced yet. Import your watch history to get started.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: TRAKT_COLOR }]}
            onPress={handleSync}
            activeOpacity={ACTIVE_OPACITY}
          >
            <RefreshCw size={20} color={COLORS.white} />
            <Text style={styles.primaryButtonText}>Import from Trakt</Text>
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
                <Text style={styles.disconnectButtonText}>Disconnect</Text>
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
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={ACTIVE_OPACITY}>
          <ChevronLeft size={24} color={COLORS.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trakt Connected</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.statusSection}>
          <View style={[styles.iconCircle, { backgroundColor: COLORS.success }]}>
            <Check size={32} color={COLORS.white} />
          </View>
          <Text style={styles.lastSyncText}>
            Last synced: {formatDistanceToNow(lastSyncedAt, { addSuffix: true })}
          </Text>
        </View>

        {itemsSynced && (
          <View style={styles.statsContainer}>
            <Text style={styles.statsTitle}>Synced Items</Text>
            <View style={styles.statsGrid}>
              {itemsSynced.movies > 0 && <StatItem label="Movies" value={itemsSynced.movies} />}
              {itemsSynced.shows > 0 && <StatItem label="Shows" value={itemsSynced.shows} />}
              {itemsSynced.episodes > 0 && (
                <StatItem label="Episodes" value={itemsSynced.episodes} />
              )}
              {itemsSynced.ratings > 0 && <StatItem label="Ratings" value={itemsSynced.ratings} />}
              {itemsSynced.lists > 0 && <StatItem label="Lists" value={itemsSynced.lists} />}
              {itemsSynced.favorites > 0 && (
                <StatItem label="Favorites" value={itemsSynced.favorites} />
              )}
              {itemsSynced.watchlistItems > 0 && (
                <StatItem label="Watchlist" value={itemsSynced.watchlistItems} />
              )}
            </View>
          </View>
        )}

        {syncStatus?.errors && syncStatus.errors.length > 0 && (
          <View style={styles.errorsContainer}>
            <Text style={styles.errorsTitle}>Some items could not be synced:</Text>
            {syncStatus.errors.slice(0, 3).map((error, index) => (
              <Text key={index} style={styles.errorText}>
                • {error}
              </Text>
            ))}
            {syncStatus.errors.length > 3 && (
              <Text style={styles.errorText}>...and {syncStatus.errors.length - 3} more</Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: TRAKT_COLOR }]}
          onPress={handleSync}
          activeOpacity={ACTIVE_OPACITY}
        >
          <RefreshCw size={20} color={COLORS.white} />
          <Text style={styles.primaryButtonText}>Sync Now</Text>
        </TouchableOpacity>

        {/* Enrichment Section - show if synced but not enriched yet */}
        {lastSyncedAt && !lastEnrichedAt && (
          <View style={styles.enrichmentSection}>
            <View style={styles.enrichmentHeader}>
              <Sparkles size={24} color={COLORS.warning} />
              <Text style={styles.enrichmentTitle}>✨ Add Posters & Ratings</Text>
            </View>
            <Text style={styles.enrichmentDescription}>
              Enhance your library with movie posters and ratings from TMDB.
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: COLORS.warning }]}
              onPress={handleEnrich}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Sparkles size={20} color={COLORS.white} />
              <Text style={styles.primaryButtonText}>Enrich My Library</Text>
            </TouchableOpacity>
            <Text style={styles.enrichmentNote}>Takes 1-5 minutes for large libraries</Text>
          </View>
        )}

        {/* Show enrichment status if already enriched */}
        {lastEnrichedAt && (
          <View style={styles.enrichedBadge}>
            <Check size={16} color={COLORS.success} />
            <Text style={styles.enrichedText}>
              Enriched {formatDistanceToNow(lastEnrichedAt, { addSuffix: true })}
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
              <Text style={styles.disconnectButtonText}>Disconnect Trakt</Text>
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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
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
    backgroundColor: 'rgba(229, 9, 20, 0.1)',
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
