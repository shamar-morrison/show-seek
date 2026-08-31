import { TraktLogo } from '@/src/components/icons/TraktLogo';
import {
  CollapsibleCategory,
  CollapsibleFeatureItem,
} from '@/src/components/ui/CollapsibleCategory';
import { PremiumBadge } from '@/src/components/ui/PremiumBadge';
import { LIST_MEMBERSHIP_INDEX_QUERY_KEY } from '@/src/constants/queryKeys';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  SPACING,
  hexToRGBA,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import {
  generateImportId,
  SelectedZipFile,
  traktZipImportService,
  TraktZipImportProgressDoc,
  TraktZipImportStats,
  TraktZipUploadError,
} from '@/src/services/TraktZipImportService';
import { screenStyles } from '@/src/styles/screenStyles';
import { useQueryClient } from '@tanstack/react-query';
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
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

type ImportUIState = 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';

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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const requireAccount = useAccountRequired();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const { accentColor } = useAccentColor();

  const [uiState, setUiState] = useState<ImportUIState>('idle');
  const [selectedFile, setSelectedFile] = useState<SelectedZipFile | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressDoc, setProgressDoc] = useState<TraktZipImportProgressDoc | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPickingFile, setIsPickingFile] = useState(false);

  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (requireAccount()) {
      router.back();
    }
  }, [requireAccount, router]);

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  const handlePickFile = async () => {
    if (isPickingFile || isPremiumLoading) {
      return;
    }

    if (!isPremium) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/premium');
      return;
    }

    setIsPickingFile(true);
    setErrorMessage(null);

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

  const invalidateUserLibraryQueries = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['lists', user.uid] }),
      queryClient.invalidateQueries({
        queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, user.uid],
      }),
      queryClient.invalidateQueries({ queryKey: ['ratings', user.uid] }),
      queryClient.invalidateQueries({ queryKey: ['episodeTracking'] }),
      queryClient.invalidateQueries({ queryKey: ['watchedMovies', user.uid] }),
    ]);
  }, [queryClient, user?.uid]);

  const handleStartImport = async () => {
    if (!selectedFile || !user?.uid) {
      return;
    }

    if (!isPremium) {
      router.push('/premium');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUiState('uploading');
    setUploadProgress(0);
    setErrorMessage(null);

    const importId = generateImportId();

    try {
      // Step 1: Upload zip archive directly to Firebase Storage
      await traktZipImportService.uploadZipFile(
        user.uid,
        importId,
        selectedFile.uri,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      // Step 2: Switch to processing state and subscribe to Firestore progress doc
      setUiState('processing');

      const unsubscribe = traktZipImportService.subscribeToProgress(
        user.uid,
        importId,
        (data) => {
          setProgressDoc(data);

          if (data.status === 'completed') {
            setUiState('completed');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            void invalidateUserLibraryQueries();
          } else if (data.status === 'failed') {
            setUiState('failed');
            setErrorMessage(
              data.error || t('trakt.zipImport.failedFallback')
            );
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
        },
        (subscriptionError) => {
          console.error('[TraktZipImportScreen] Progress subscription error:', subscriptionError);
          setUiState('failed');
          setErrorMessage(
            subscriptionError instanceof Error && subscriptionError.message
              ? subscriptionError.message
              : t('trakt.zipImport.failedFallback')
          );
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      );

      unsubscribeRef.current = unsubscribe;

      // Step 3: Trigger the backend Cloud Function
      await traktZipImportService.startImport(importId);
    } catch (error) {
      console.error('[TraktZipImportScreen] Import error:', error);
      setUiState('failed');

      if (error instanceof TraktZipUploadError) {
        setErrorMessage(t('trakt.zipImport.uploadFailed'));
      } else {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : t('trakt.zipImport.failedFallback')
        );
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleReset = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setUiState('idle');
    setSelectedFile(null);
    setUploadProgress(0);
    setProgressDoc(null);
    setErrorMessage(null);
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
          >
            <X size={20} color={COLORS.textSecondary} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.pickerBox,
            pressed && { borderColor: accentColor, opacity: ACTIVE_OPACITY },
          ]}
          onPress={handlePickFile}
          disabled={isPickingFile || isPremiumLoading}
        >
          {isPickingFile ? (
            <ActivityIndicator color={accentColor} size="small" />
          ) : (
            <>
              <UploadCloud size={40} color={accentColor} />
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
            backgroundColor: selectedFile ? COLORS.trakt : COLORS.surfaceLight,
          },
          pressed && selectedFile ? { opacity: ACTIVE_OPACITY } : null,
        ]}
        onPress={handleStartImport}
        disabled={!selectedFile}
      >
        <Upload size={20} color={selectedFile ? COLORS.white : COLORS.textSecondary} />
        <Text
          style={[
            styles.primaryButtonText,
            !selectedFile && { color: COLORS.textSecondary },
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
          onPress={() => router.push('/(tabs)/library')}
        >
          <Text style={styles.primaryButtonText}>{t('trakt.zipImport.viewLibrary')}</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { opacity: ACTIVE_OPACITY },
          ]}
          onPress={() => router.back()}
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
        onPress={() => router.back()}
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
});
