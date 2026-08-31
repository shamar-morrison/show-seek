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
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  FileArchive,
  Film,
  FolderPlus,
  Heart,
  HelpCircle,
  List,
  RefreshCw,
  Star,
  Tv,
  UploadCloud,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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

type ImportUIState = 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';

const TRAKT_BRAND_COLOR = '#ED1C24';

const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes <= 0) {
    return '';
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function TraktZipImportScreen() {
  const router = useRouter();
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
          : 'Unable to select the zip archive. Please try again.';
      Alert.alert('File Selection', msg);
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
              data.error ||
                'Import processing was unable to finish. Please check your zip file and try again.'
            );
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
        },
        (subscriptionError) => {
          console.error('[TraktZipImportScreen] Progress subscription error:', subscriptionError);
        }
      );

      unsubscribeRef.current = unsubscribe;

      // Step 3: Trigger the backend Cloud Function
      await traktZipImportService.startImport(importId);
    } catch (error) {
      console.error('[TraktZipImportScreen] Import error:', error);
      setUiState('failed');

      if (error instanceof TraktZipUploadError) {
        setErrorMessage(
          'Failed to upload the zip archive. Please verify your internet connection and try again.'
        );
      } else {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred while initiating the import.'
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
        return 'Downloading archive on server...';
      case 'parsing':
        return 'Reading movie, show, episode, rating, and list files...';
      case 'syncing':
        return 'Reconciling watch history and saving to your library...';
      case 'pending':
      default:
        return 'Initializing import...';
    }
  };

  const renderIdleView = () => (
    <View style={styles.sectionContainer}>
      <View style={styles.heroCard}>
        <View style={[styles.heroIconCircle, { backgroundColor: hexToRGBA(TRAKT_BRAND_COLOR, 0.15) }]}>
          <FileArchive size={36} color={TRAKT_BRAND_COLOR} />
        </View>
        <Text style={styles.heroTitle}>Trakt Zip Import</Text>
        <Text style={styles.heroSubtitle}>
          Import your complete movie, TV show, episode, rating, and list history directly from a Trakt export archive.
        </Text>
      </View>

      {/* File Picker Box */}
      {selectedFile ? (
        <View style={styles.selectedFileCard}>
          <View style={styles.fileIconWrapper}>
            <FileArchive size={28} color={accentColor} />
          </View>
          <View style={styles.fileDetails}>
            <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">
              {selectedFile.name}
            </Text>
            <Text style={styles.fileMeta}>
              {formatFileSize(selectedFile.size) || 'Zip Archive Ready'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setSelectedFile(null)}
            style={styles.removeFileButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.pickerBox}
          onPress={handlePickFile}
          activeOpacity={ACTIVE_OPACITY}
          disabled={isPickingFile}
        >
          {isPickingFile ? (
            <ActivityIndicator color={accentColor} size="small" />
          ) : (
            <>
              <UploadCloud size={36} color={accentColor} />
              <Text style={styles.pickerBoxTitle}>Select Trakt Export (.zip)</Text>
              <Text style={styles.pickerBoxSubtitle}>
                Tap to browse your device files for your Trakt export zip
              </Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {/* Action Button */}
      <TouchableOpacity
        style={[
          styles.primaryButton,
          {
            backgroundColor: selectedFile ? TRAKT_BRAND_COLOR : hexToRGBA(COLORS.textSecondary, 0.3),
          },
        ]}
        onPress={handleStartImport}
        disabled={!selectedFile}
        activeOpacity={ACTIVE_OPACITY}
      >
        <Text style={styles.primaryButtonText}>Start Import</Text>
      </TouchableOpacity>

      {/* Instructions Accordion / Card */}
      <View style={styles.instructionsCard}>
        <View style={styles.instructionsHeader}>
          <HelpCircle size={18} color={COLORS.textSecondary} />
          <Text style={styles.instructionsTitle}>How to get your Trakt archive</Text>
        </View>
        <View style={styles.instructionStep}>
          <Text style={styles.stepNumber}>1.</Text>
          <Text style={styles.stepText}>Open trakt.tv in your web browser and sign in.</Text>
        </View>
        <View style={styles.instructionStep}>
          <Text style={styles.stepNumber}>2.</Text>
          <Text style={styles.stepText}>Go to Settings, then select Advanced.</Text>
        </View>
        <View style={styles.instructionStep}>
          <Text style={styles.stepNumber}>3.</Text>
          <Text style={styles.stepText}>Click &quot;Export My Data&quot; to download your zip archive.</Text>
        </View>
        <View style={styles.instructionStep}>
          <Text style={styles.stepNumber}>4.</Text>
          <Text style={styles.stepText}>Select the downloaded .zip file above to import.</Text>
        </View>
      </View>

      {/* Supported Items Info */}
      <View style={styles.supportedCard}>
        <Text style={styles.supportedTitle}>What will be imported</Text>
        <View style={styles.supportedGrid}>
          <View style={styles.supportedItem}>
            <CheckCircle2 size={16} color={COLORS.success} />
            <Text style={styles.supportedItemText}>Watched Movies & Shows</Text>
          </View>
          <View style={styles.supportedItem}>
            <CheckCircle2 size={16} color={COLORS.success} />
            <Text style={styles.supportedItemText}>Granular Watch History</Text>
          </View>
          <View style={styles.supportedItem}>
            <CheckCircle2 size={16} color={COLORS.success} />
            <Text style={styles.supportedItemText}>Episode Progress</Text>
          </View>
          <View style={styles.supportedItem}>
            <CheckCircle2 size={16} color={COLORS.success} />
            <Text style={styles.supportedItemText}>Ratings</Text>
          </View>
          <View style={styles.supportedItem}>
            <CheckCircle2 size={16} color={COLORS.success} />
            <Text style={styles.supportedItemText}>Watchlist & Favorites</Text>
          </View>
          <View style={styles.supportedItem}>
            <CheckCircle2 size={16} color={COLORS.success} />
            <Text style={styles.supportedItemText}>Custom Lists</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderUploadingView = () => (
    <View style={styles.centerContainer}>
      <View style={[styles.heroIconCircle, { backgroundColor: hexToRGBA(accentColor, 0.15) }]}>
        <UploadCloud size={40} color={accentColor} />
      </View>
      <Text style={styles.statusTitle}>Uploading Archive</Text>
      <Text style={styles.statusSubtitle}>
        Uploading your Trakt zip file to secure storage. Please keep ShowSeek open.
      </Text>

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
      <View style={[styles.heroIconCircle, { backgroundColor: hexToRGBA(TRAKT_BRAND_COLOR, 0.15) }]}>
        <RefreshCw size={36} color={TRAKT_BRAND_COLOR} />
      </View>
      <Text style={styles.statusTitle}>Importing Your Data</Text>
      <Text style={styles.statusSubtitle}>{getPhaseText(progressDoc?.progress?.phase)}</Text>

      <ActivityIndicator size="large" color={TRAKT_BRAND_COLOR} style={styles.spinner} />

      <View style={styles.tipCard}>
        <Text style={styles.tipText}>
          Processing large watch histories may take a moment. You can stay on this screen to view progress.
        </Text>
      </View>
    </View>
  );

  const renderCompletedView = () => {
    const stats: TraktZipImportStats = progressDoc?.stats || {
      customLists: 0,
      episodes: 0,
      favorites: 0,
      movies: 0,
      movieWatches: 0,
      ratings: 0,
      shows: 0,
      watchlist: 0,
    };

    return (
      <View style={styles.sectionContainer}>
        <View style={styles.successHeader}>
          <View style={[styles.heroIconCircle, { backgroundColor: hexToRGBA(COLORS.success, 0.15) }]}>
            <Check size={36} color={COLORS.success} />
          </View>
          <Text style={styles.statusTitle}>Import Complete</Text>
          <Text style={styles.statusSubtitle}>
            Your Trakt archive has been successfully imported into your ShowSeek library.
          </Text>
        </View>

        {/* Stats Summary Grid */}
        <View style={styles.statsCard}>
          <Text style={styles.statsCardTitle}>Import Summary</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Film size={20} color={accentColor} />
              <Text style={styles.statValue}>{stats.movies}</Text>
              <Text style={styles.statLabel}>Movies</Text>
            </View>
            <View style={styles.statBox}>
              <Tv size={20} color={accentColor} />
              <Text style={styles.statValue}>{stats.shows}</Text>
              <Text style={styles.statLabel}>TV Shows</Text>
            </View>
            <View style={styles.statBox}>
              <CheckCircle2 size={20} color={accentColor} />
              <Text style={styles.statValue}>{stats.episodes}</Text>
              <Text style={styles.statLabel}>Episodes</Text>
            </View>
            <View style={styles.statBox}>
              <Star size={20} color={COLORS.warning} />
              <Text style={styles.statValue}>{stats.ratings}</Text>
              <Text style={styles.statLabel}>Ratings</Text>
            </View>
            <View style={styles.statBox}>
              <List size={20} color={accentColor} />
              <Text style={styles.statValue}>{stats.watchlist}</Text>
              <Text style={styles.statLabel}>Watchlist</Text>
            </View>
            <View style={styles.statBox}>
              <Heart size={20} color={COLORS.error} />
              <Text style={styles.statValue}>{stats.favorites}</Text>
              <Text style={styles.statLabel}>Favorites</Text>
            </View>
            <View style={styles.statBox}>
              <FolderPlus size={20} color={accentColor} />
              <Text style={styles.statValue}>{stats.customLists}</Text>
              <Text style={styles.statLabel}>Custom Lists</Text>
            </View>
            <View style={styles.statBox}>
              <Film size={20} color={COLORS.success} />
              <Text style={styles.statValue}>{stats.movieWatches}</Text>
              <Text style={styles.statLabel}>Logged Watches</Text>
            </View>
          </View>
        </View>

        {/* Navigation Buttons */}
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: accentColor }]}
          onPress={() => router.push('/(tabs)/library')}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={styles.primaryButtonText}>View Library</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.back()}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={styles.secondaryButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderFailedView = () => (
    <View style={styles.centerContainer}>
      <View style={[styles.heroIconCircle, { backgroundColor: hexToRGBA(COLORS.error, 0.15) }]}>
        <AlertCircle size={40} color={COLORS.error} />
      </View>
      <Text style={styles.statusTitle}>Import Failed</Text>
      <Text style={styles.errorDescription}>
        {errorMessage || 'An error occurred while importing your Trakt archive.'}
      </Text>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: TRAKT_BRAND_COLOR, width: '100%' }]}
        onPress={handleReset}
        activeOpacity={ACTIVE_OPACITY}
      >
        <Text style={styles.primaryButtonText}>Try Again</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondaryButton, { width: '100%' }]}
        onPress={() => router.back()}
        activeOpacity={ACTIVE_OPACITY}
      >
        <Text style={styles.secondaryButtonText}>Back to Settings</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={ACTIVE_OPACITY}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trakt Zip Import</Text>
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
  backButton: {
    padding: SPACING.xs,
  },
  centerContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.xl,
  },
  errorDescription: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 22,
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  fileDetails: {
    flex: 1,
    marginRight: SPACING.s,
  },
  fileIconWrapper: {
    marginRight: SPACING.m,
  },
  fileMeta: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
  },
  fileName: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: hexToRGBA(COLORS.white, 0.1),
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
  },
  headerTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.l,
    fontWeight: '700',
    marginLeft: SPACING.s,
  },
  heroCard: {
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  heroIconCircle: {
    alignItems: 'center',
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    marginBottom: SPACING.m,
    width: 72,
  },
  heroSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    lineHeight: 20,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  heroTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  instructionStep: {
    flexDirection: 'row',
    marginBottom: SPACING.xs,
  },
  instructionsCard: {
    backgroundColor: hexToRGBA(COLORS.white, 0.05),
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
    padding: SPACING.m,
  },
  instructionsHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: SPACING.s,
  },
  instructionsTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    marginLeft: SPACING.xs,
  },
  pickerBox: {
    alignItems: 'center',
    borderColor: hexToRGBA(COLORS.white, 0.2),
    borderRadius: BORDER_RADIUS.m,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    justifyContent: 'center',
    marginBottom: SPACING.m,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.xl,
  },
  pickerBoxSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    marginTop: 4,
    textAlign: 'center',
  },
  pickerBoxTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    marginTop: SPACING.s,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.m,
    justifyContent: 'center',
    marginBottom: SPACING.m,
    paddingVertical: SPACING.m,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
  progressBarFill: {
    borderRadius: 4,
    height: 8,
  },
  progressBarWrapper: {
    backgroundColor: hexToRGBA(COLORS.white, 0.1),
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
    padding: SPACING.m,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: hexToRGBA(COLORS.white, 0.2),
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    justifyContent: 'center',
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
    backgroundColor: hexToRGBA(COLORS.white, 0.08),
    borderRadius: BORDER_RADIUS.m,
    flexDirection: 'row',
    marginBottom: SPACING.m,
    padding: SPACING.m,
  },
  spinner: {
    marginVertical: SPACING.l,
  },
  statBox: {
    alignItems: 'center',
    backgroundColor: hexToRGBA(COLORS.white, 0.04),
    borderRadius: BORDER_RADIUS.s,
    justifyContent: 'center',
    padding: SPACING.s,
    width: '48%',
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    marginTop: 2,
  },
  statValue: {
    color: COLORS.white,
    fontSize: FONT_SIZE.l,
    fontWeight: '700',
    marginTop: 4,
  },
  statsCard: {
    backgroundColor: hexToRGBA(COLORS.white, 0.05),
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.l,
    padding: SPACING.m,
  },
  statsCardTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
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
    fontSize: FONT_SIZE.s,
    lineHeight: 20,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  statusTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  stepNumber: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontWeight: '700',
    marginRight: SPACING.xs,
    width: 18,
  },
  stepText: {
    color: COLORS.textSecondary,
    flex: 1,
    fontSize: FONT_SIZE.s,
    lineHeight: 18,
  },
  successHeader: {
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  supportedCard: {
    backgroundColor: hexToRGBA(COLORS.white, 0.03),
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.m,
  },
  supportedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  supportedItem: {
    alignItems: 'center',
    flexDirection: 'row',
    width: '48%',
  },
  supportedItemText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    marginLeft: SPACING.xs,
  },
  supportedTitle: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
  },
  tipCard: {
    backgroundColor: hexToRGBA(COLORS.white, 0.05),
    borderRadius: BORDER_RADIUS.m,
    marginTop: SPACING.l,
    padding: SPACING.m,
    width: '100%',
  },
  tipText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
    textAlign: 'center',
  },
});
