import { TraktLogo } from '@/src/components/icons/TraktLogo';
import {
  CollapsibleCategory,
  CollapsibleFeatureItem,
} from '@/src/components/ui/CollapsibleCategory';
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
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import {
  traktZipImportService,
  TraktZipImportStats,
} from '@/src/services/TraktZipImportService';
import { screenStyles } from '@/src/styles/screenStyles';
import { formatDistanceToNow } from 'date-fns';
import { enUS, es, fr, pt, ptBR, tr } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileArchive,
  Film,
  FolderPlus,
  Heart,
  List,
  RefreshCw,
  Star,
  Tv,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) {
    return '';
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface StatTileProps {
  icon: React.ReactNode;
  label: string;
  value?: number | null;
}

function StatTile({ icon, label, value }: StatTileProps) {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return (
    <View style={styles.statTile}>
      <View style={styles.statTileIconWrapper}>{icon}</View>
      <Text style={styles.statTileValue}>{safeValue.toLocaleString()}</Text>
      <Text style={styles.statTileLabel}>{label}</Text>
    </View>
  );
}

export default function TraktZipImportScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const requireAccount = useAccountRequired();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const { accentColor } = useAccentColor();
  const {
    isEnriching,
    isSyncing,
    isZipImportRateLimited,
    nextAllowedZipImportAt,
    zipImportUiState: uiState,
    zipUploadProgress: uploadProgress,
    zipImportDoc: progressDoc,
    zipImportError: errorMessage,
    selectedZipFile: selectedFile,
    setSelectedZipFile: setSelectedFile,
    startZipImport,
    dismissZipImport,
  } = useTrakt();

  const [isPickingFile, setIsPickingFile] = useState(false);

  const distanceLocale = useMemo(() => {
    switch (i18n.language) {
      case 'es-ES':
      case 'es-MX':
        return es;
      case 'fr':
      case 'fr-FR':
        return fr;
      case 'pt-BR':
        return ptBR;
      case 'pt-PT':
        return pt;
      case 'tr-TR':
        return tr;
      default:
        return enUS;
    }
  }, [i18n.language]);

  useEffect(() => {
    if (requireAccount()) {
      router.back();
    }
  }, [requireAccount, router]);

  const handlePickFile = async () => {
    if (isPickingFile || isPremiumLoading || isSyncing || isZipImportRateLimited) {
      return;
    }

    if (!isPremium) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/premium');
      return;
    }

    setIsPickingFile(true);

    try {
      const file = await traktZipImportService.pickZipFile();
      if (file) {
        setSelectedFile(file);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('[TraktZipImportScreen] Error picking file:', error);
      const msg =
        error instanceof Error
          ? error.message
          : t('trakt.zipImport.failedFallback');
      Alert.alert(t('trakt.zipImport.title'), msg);
    } finally {
      setIsPickingFile(false);
    }
  };

  const handleStartImport = async () => {
    if (!selectedFile || isSyncing || isZipImportRateLimited) {
      return;
    }

    if (!isPremium) {
      router.push('/premium');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await startZipImport(selectedFile);
    } catch (error) {
      console.error('[TraktZipImportScreen] Start import error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleReset = () => {
    dismissZipImport();
  };

  const getPhaseText = (phase?: string): string => {
    switch (phase) {
      case 'downloading':
        return t('trakt.zipImport.phases.downloading');
      case 'parsing':
        return t('trakt.zipImport.phases.parsing');
      case 'syncing':
        return t('trakt.zipImport.phases.syncing');
      case 'pending':
      default:
        return t('trakt.zipImport.phases.pending');
    }
  };

  const renderIdleView = () => (
    <View style={styles.sectionContainer}>
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
        <Text style={styles.heroTitle}>{t('trakt.zipImport.heroTitle')}</Text>
        <Text style={styles.heroSubtitle}>{t('trakt.zipImport.heroSubtitle')}</Text>
      </View>

      {/* If an OAuth sync is running, show in-flight banner */}
      {isSyncing && (
        <View
          style={[
            styles.syncRunningBanner,
            { backgroundColor: hexToRGBA(COLORS.trakt, 0.12) },
          ]}
        >
          <View style={styles.syncRunningHeader}>
            <RefreshCw size={18} color={COLORS.trakt} />
            <Text style={[styles.syncRunningTitle, { color: COLORS.trakt }]}>
              {t('trakt.zipImport.syncRunningTitle', { defaultValue: 'Trakt Sync In Progress' })}
            </Text>
          </View>
          <Text style={[styles.syncRunningDescription, { color: COLORS.trakt }]}>
            {t('trakt.zipImport.syncRunningDescription', {
              defaultValue:
                'A Trakt sync is currently in progress. Please wait for it to complete before starting a zip import.',
            })}
          </Text>
        </View>
      )}

      {/* If the import cooldown is active, show rate-limited banner */}
      {isZipImportRateLimited && (
        <View
          style={[
            styles.syncRunningBanner,
            { backgroundColor: hexToRGBA(COLORS.warning, 0.12) },
          ]}
        >
          <View style={styles.syncRunningHeader}>
            <AlertCircle size={18} color={COLORS.warning} />
            <Text style={[styles.syncRunningTitle, { color: COLORS.warning }]}>
              {t('trakt.zipImport.rateLimitedTitle', {
                defaultValue: 'Import Cooldown Active',
              })}
            </Text>
          </View>
          <Text style={[styles.syncRunningDescription, { color: COLORS.warning }]}>
            {nextAllowedZipImportAt
              ? t('trakt.zipImport.rateLimitedWithTime', {
                  defaultValue: 'You can start another import {{time}}.',
                  time: formatDistanceToNow(nextAllowedZipImportAt, {
                    addSuffix: true,
                    locale: distanceLocale,
                  }),
                })
              : t('trakt.zipImport.rateLimitedDescription', {
                  defaultValue: 'Please wait before starting another import.',
                })}
          </Text>
        </View>
      )}

      {/* File Picker Box / Selected File Preview */}
      {selectedFile ? (
        <View style={styles.selectedFileCard}>
          <View style={[styles.fileIconWrapper, { backgroundColor: hexToRGBA(accentColor, 0.15) }]}>
            <FileArchive size={26} color={accentColor} />
          </View>
          <View style={styles.fileDetails}>
            <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
              {selectedFile.name}
            </Text>
            <Text style={styles.fileMeta}>
              {formatFileSize(selectedFile.size) || t('trakt.zipImport.readyBadge')}
            </Text>
          </View>
          <Pressable
            onPress={() => setSelectedFile(null)}
            style={({ pressed }) => [styles.removeFileButton, pressed && { opacity: ACTIVE_OPACITY }]}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={t('trakt.zipImport.removeFile')}
            disabled={isSyncing}
          >
            <X size={20} color={COLORS.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.pickerBox,
            pressed && !isSyncing && !isZipImportRateLimited && { borderColor: accentColor, opacity: ACTIVE_OPACITY },
            (isSyncing || isZipImportRateLimited) && { opacity: 0.6 },
          ]}
          onPress={handlePickFile}
          disabled={isPickingFile || isPremiumLoading || isSyncing || isZipImportRateLimited}
        >
          {isPickingFile ? (
            <ActivityIndicator color={accentColor} size="small" />
          ) : (
            <>
              <UploadCloud
                size={40}
                color={isSyncing || isZipImportRateLimited ? COLORS.textSecondary : accentColor}
              />
              <View style={styles.pickerTitleRow}>
                <Text style={styles.pickerBoxTitle}>{t('trakt.zipImport.selectFile')}</Text>
                {!isPremium && !isPremiumLoading && <PremiumBadge />}
              </View>
              <Text style={styles.pickerBoxSubtitle}>
                {t('trakt.zipImport.selectFileSubtitle')}
              </Text>
            </>
          )}
        </Pressable>
      )}

      {/* Action Button */}
      <Pressable
        style={({ pressed }) => [
          styles.primaryButton,
          {
            backgroundColor:
              selectedFile && !isSyncing && !isZipImportRateLimited
                ? COLORS.trakt
                : COLORS.surfaceLight,
          },
          pressed && selectedFile && !isSyncing && !isZipImportRateLimited
            ? { opacity: ACTIVE_OPACITY }
            : null,
        ]}
        onPress={handleStartImport}
        disabled={!selectedFile || isSyncing || isZipImportRateLimited}
      >
        <Upload
          size={20}
          color={
            selectedFile && !isSyncing && !isZipImportRateLimited
              ? COLORS.white
              : COLORS.textSecondary
          }
        />
        <Text
          style={[
            styles.primaryButtonText,
            (!selectedFile || isSyncing || isZipImportRateLimited) && {
              color: COLORS.textSecondary,
            },
          ]}
        >
          {t('trakt.zipImport.startImport')}
        </Text>
      </Pressable>

      {/* What Will Be Imported Collapsible Category */}
      <CollapsibleCategory title={t('trakt.zipImport.whatWillBeImportedTitle')} defaultExpanded>
        <CollapsibleFeatureItem
          text={t('trakt.zipImport.features.watched')}
          description={t('trakt.zipImport.features.watchedDesc')}
          icon="checkmark-circle"
        />
        <CollapsibleFeatureItem
          text={t('trakt.zipImport.features.granularHistory')}
          description={t('trakt.zipImport.features.granularHistoryDesc')}
          icon="checkmark-circle"
        />
        <CollapsibleFeatureItem
          text={t('trakt.zipImport.features.episodeProgress')}
          description={t('trakt.zipImport.features.episodeProgressDesc')}
          icon="checkmark-circle"
        />
        <CollapsibleFeatureItem
          text={t('trakt.zipImport.features.ratings')}
          description={t('trakt.zipImport.features.ratingsDesc')}
          icon="checkmark-circle"
        />
        <CollapsibleFeatureItem
          text={t('trakt.zipImport.features.watchlistAndFavorites')}
          description={t('trakt.zipImport.features.watchlistAndFavoritesDesc')}
          icon="checkmark-circle"
        />
        <CollapsibleFeatureItem
          text={t('trakt.zipImport.features.customLists')}
          description={t('trakt.zipImport.features.customListsDesc')}
          icon="checkmark-circle"
        />
      </CollapsibleCategory>
    </View>
  );

  const renderUploadingView = () => (
    <View style={styles.centerContainer}>
      <View style={[styles.heroIconCircle, { backgroundColor: hexToRGBA(accentColor, 0.15) }]}>
        <UploadCloud size={40} color={accentColor} />
      </View>
      <Text style={styles.statusTitle}>{t('trakt.zipImport.uploadingTitle')}</Text>
      <Text style={styles.statusSubtitle}>{t('trakt.zipImport.uploadingSubtitle')}</Text>

      <View style={styles.progressBarWrapper}>
        <View
          style={[
            styles.progressBarFill,
            { backgroundColor: accentColor, width: `${Math.round(uploadProgress * 100)}%` },
          ]}
        />
      </View>
      <Text style={styles.progressPercentText}>{Math.round(uploadProgress * 100)}%</Text>
    </View>
  );

  const renderProcessingView = () => (
    <View style={styles.centerContainer}>
      <View style={[styles.heroIconCircle, { backgroundColor: hexToRGBA(COLORS.trakt, 0.15) }]}>
        <RefreshCw size={36} color={COLORS.trakt} />
      </View>
      <Text style={styles.statusTitle}>{t('trakt.zipImport.processingTitle')}</Text>
      <Text style={styles.statusSubtitle}>{getPhaseText(progressDoc?.progress?.phase)}</Text>

      <ActivityIndicator size="large" color={COLORS.trakt} style={styles.syncingSpinner} />

      <View style={styles.estimateContainer}>
        <Text style={styles.estimateText}>{t('trakt.zipImport.processingTip')}</Text>
      </View>
    </View>
  );

  const renderCompletedView = () => {
    const rawStats = progressDoc?.stats;
    const normalizeStat = (val: unknown): number => {
      if (typeof val === 'number' && Number.isFinite(val)) {
        return val;
      }
      if (typeof val === 'string') {
        const parsed = Number(val);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    const stats: TraktZipImportStats = {
      customLists: normalizeStat(rawStats?.customLists),
      episodes: normalizeStat(rawStats?.episodes),
      favorites: normalizeStat(rawStats?.favorites),
      movies: normalizeStat(rawStats?.movies),
      movieWatches: normalizeStat(rawStats?.movieWatches),
      ratings: normalizeStat(rawStats?.ratings),
      shows: normalizeStat(rawStats?.shows),
      watchlist: normalizeStat(rawStats?.watchlist),
    };

    return (
      <View style={styles.sectionContainer}>
        <View style={styles.heroSection}>
          <View style={[styles.iconCircle, { backgroundColor: COLORS.success }]}>
            <Check size={32} color={COLORS.white} />
          </View>
          <Text style={styles.heroTitle}>{t('trakt.zipImport.completeTitle')}</Text>
          <Text style={styles.heroSubtitle}>{t('trakt.zipImport.completeSubtitle')}</Text>
          {isEnriching && (
            <View style={styles.enrichingBadge}>
              <Text style={styles.enrichingBadgeText}>
                {t('trakt.zipImport.enrichingBackground', {
                  defaultValue: 'Fetching posters in the background...',
                })}
              </Text>
            </View>
          )}
        </View>

        {/* Stats Summary Grid */}
        <View style={styles.statsCard}>
          <Text style={styles.statsCardTitle}>{t('trakt.zipImport.summaryTitle')}</Text>
          <View style={styles.statsGrid}>
            <StatTile
              icon={<Film size={22} color={accentColor} />}
              label={t('trakt.zipImport.stats.movies')}
              value={stats.movies}
            />
            <StatTile
              icon={<Tv size={22} color={accentColor} />}
              label={t('trakt.zipImport.stats.shows')}
              value={stats.shows}
            />
            <StatTile
              icon={<CheckCircle2 size={22} color={accentColor} />}
              label={t('trakt.zipImport.stats.episodes')}
              value={stats.episodes}
            />
            <StatTile
              icon={<Star size={22} color={COLORS.warning} />}
              label={t('trakt.zipImport.stats.ratings')}
              value={stats.ratings}
            />
            <StatTile
              icon={<List size={22} color={accentColor} />}
              label={t('trakt.zipImport.stats.watchlist')}
              value={stats.watchlist}
            />
            <StatTile
              icon={<Heart size={22} color={COLORS.error} />}
              label={t('trakt.zipImport.stats.favorites')}
              value={stats.favorites}
            />
            <StatTile
              icon={<FolderPlus size={22} color={accentColor} />}
              label={t('trakt.zipImport.stats.customLists')}
              value={stats.customLists}
            />
            <StatTile
              icon={<Film size={22} color={COLORS.success} />}
              label={t('trakt.zipImport.stats.movieWatches')}
              value={stats.movieWatches}
            />
          </View>
        </View>

        {/* Navigation Buttons */}
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: accentColor },
            pressed && { opacity: ACTIVE_OPACITY },
          ]}
          onPress={() => {
            dismissZipImport();
            router.push('/(tabs)/library');
          }}
        >
          <Text style={styles.primaryButtonText}>{t('trakt.zipImport.viewLibrary')}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { opacity: ACTIVE_OPACITY },
          ]}
          onPress={() => {
            dismissZipImport();
            router.back();
          }}
        >
          <Text style={styles.secondaryButtonText}>{t('trakt.zipImport.done')}</Text>
        </Pressable>
      </View>
    );
  };

  const renderFailedView = () => (
    <View style={styles.centerContainer}>
      <View style={[styles.heroIconCircle, { backgroundColor: hexToRGBA(COLORS.error, 0.15) }]}>
        <AlertCircle size={40} color={COLORS.error} />
      </View>
      <Text style={styles.statusTitle}>{t('trakt.zipImport.failedTitle')}</Text>

      <View style={styles.errorCard}>
        <Text style={styles.errorDescription}>
          {errorMessage || t('trakt.zipImport.failedFallback')}
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: COLORS.trakt, width: '100%' },
          pressed && { opacity: ACTIVE_OPACITY },
        ]}
        onPress={handleReset}
      >
        <RefreshCw size={18} color={COLORS.white} />
        <Text style={styles.primaryButtonText}>{t('trakt.zipImport.tryAgain')}</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [
          styles.secondaryButton,
          { width: '100%' },
          pressed && { opacity: ACTIVE_OPACITY },
        ]}
        onPress={() => {
          dismissZipImport();
          router.back();
        }}
      >
        <Text style={styles.secondaryButtonText}>{t('trakt.zipImport.backToSettings')}</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: ACTIVE_OPACITY }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={24} color={COLORS.white} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('trakt.zipImport.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {uiState === 'idle' && renderIdleView()}
        {uiState === 'uploading' && renderUploadingView()}
        {uiState === 'processing' && renderProcessingView()}
        {uiState === 'completed' && renderCompletedView()}
        {uiState === 'failed' && renderFailedView()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  arrowIcon: {
    marginHorizontal: SPACING.s,
  },
  backButton: {
    padding: SPACING.xs,
  },
  centerContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.xl,
  },
  errorCard: {
    backgroundColor: hexToRGBA(COLORS.error, 0.1),
    borderColor: hexToRGBA(COLORS.error, 0.25),
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    marginBottom: SPACING.xl,
    padding: SPACING.m,
    width: '100%',
  },
  errorDescription: {
    color: COLORS.error,
    fontSize: FONT_SIZE.m,
    lineHeight: 22,
    textAlign: 'center',
  },
  estimateContainer: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
  },
  estimateText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    lineHeight: 20,
    textAlign: 'center',
  },
  fileDetails: {
    flex: 1,
    marginRight: SPACING.s,
  },
  fileIconWrapper: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.m,
    height: 48,
    justifyContent: 'center',
    marginRight: SPACING.m,
    width: 48,
  },
  fileMeta: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    marginTop: 2,
  },
  fileName: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: COLORS.surfaceLight,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: SPACING.m,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
  },
  headerTitle: {
    color: COLORS.white,
    flex: 1,
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
  },
  heroIconCircle: {
    alignItems: 'center',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    marginBottom: SPACING.l,
    width: 80,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  heroSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 22,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  heroTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    marginBottom: SPACING.s,
    textAlign: 'center',
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 40,
    height: 80,
    justifyContent: 'center',
    marginBottom: SPACING.l,
    width: 80,
  },
  pickerBox: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: hexToRGBA(COLORS.white, 0.15),
    borderRadius: BORDER_RADIUS.l,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    justifyContent: 'center',
    marginBottom: SPACING.l,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.xl,
  },
  pickerBoxSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  pickerBoxTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  pickerTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.s,
    marginTop: SPACING.m,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.l,
    flexDirection: 'row',
    gap: SPACING.s,
    justifyContent: 'center',
    marginBottom: SPACING.m,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
  },
  progressBarFill: {
    borderRadius: 4,
    height: 8,
  },
  progressBarWrapper: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: 4,
    height: 8,
    marginVertical: SPACING.m,
    overflow: 'hidden',
    width: '100%',
  },
  progressPercentText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  removeFileButton: {
    padding: SPACING.xs,
  },
  scrollContent: {
    padding: SPACING.l,
    paddingBottom: SPACING.xxl,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: hexToRGBA(COLORS.white, 0.2),
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    justifyContent: 'center',
    marginBottom: SPACING.m,
    paddingVertical: SPACING.m,
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  sectionContainer: {
    flex: 1,
  },
  selectedFileCard: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: hexToRGBA(COLORS.white, 0.1),
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: SPACING.l,
    padding: SPACING.m,
  },
  showSeekIcon: {
    height: 93,
    width: 93,
  },
  showSeekIconCircle: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 35,
    height: 70,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 70,
  },
  statTile: {
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    justifyContent: 'center',
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.m,
    width: '48%',
  },
  statTileIconWrapper: {
    marginBottom: SPACING.xs,
  },
  statTileLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
    textAlign: 'center',
  },
  statTileValue: {
    color: COLORS.white,
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
  },
  statsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    marginBottom: SPACING.l,
    padding: SPACING.l,
  },
  statsCardTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    marginBottom: SPACING.m,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
    justifyContent: 'space-between',
  },
  statusSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 22,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  statusTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  syncIconsContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.m,
    justifyContent: 'center',
    marginBottom: SPACING.l,
  },
  syncingSpinner: {
    marginTop: SPACING.xl,
  },
  enrichingBadge: {
    backgroundColor: hexToRGBA(COLORS.white, 0.08),
    borderRadius: BORDER_RADIUS.m,
    marginTop: SPACING.s,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.xs,
  },
  enrichingBadgeText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    fontWeight: '500',
  },
  syncRunningBanner: {
    borderRadius: BORDER_RADIUS.m,
    gap: SPACING.xs,
    marginBottom: SPACING.l,
    padding: SPACING.m,
  },
  syncRunningDescription: {
    fontSize: FONT_SIZE.s,
    lineHeight: 20,
  },
  syncRunningHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.s,
  },
  syncRunningTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
  },
});
