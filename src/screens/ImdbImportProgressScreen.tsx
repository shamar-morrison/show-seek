import type {
  ImdbImportIgnoredMetadataKey,
  ImdbImportSkipReason,
  ImdbImportStats,
} from '@/functions/src/shared/imdbImport';
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
import { useImdbImportFlow } from '@/src/context/ImdbImportFlowContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { imdbImportService } from '@/src/services/ImdbImportService';
import { screenStyles } from '@/src/styles/screenStyles';
import { getTechnicalErrorMessage } from '@/src/utils/errorPresentation';
import { getImdbImportErrorCode, getImdbImportErrorMessageKey } from '@/src/utils/imdbImportError';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { AlertCircle, Check, Info, RefreshCw } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SummaryEntry = {
  key: string;
  label: string;
  value: number;
};

type ImportStatus = 'running' | 'failed' | 'success';

const IMPORTED_LABEL_KEYS = {
  customListsCreated: 'imdbImport.imported.customListsCreated',
  listItems: 'imdbImport.imported.listItems',
  ratings: 'imdbImport.imported.ratings',
  watchedEpisodes: 'imdbImport.imported.watchedEpisodes',
  watchedMovies: 'imdbImport.imported.watchedMovies',
  watchedShows: 'imdbImport.imported.watchedShows',
} as const;

const SKIPPED_REASON_LABEL_KEYS: Record<ImdbImportSkipReason, string> = {
  invalid_date: 'imdbImport.skipped.invalidDate',
  invalid_rating: 'imdbImport.skipped.invalidRating',
  malformed_row: 'imdbImport.skipped.malformedRow',
  unresolved_imdb_id: 'imdbImport.skipped.unresolvedImdbId',
  unsupported_file: 'imdbImport.skipped.unsupportedFile',
  unsupported_list_episode: 'imdbImport.skipped.unsupportedListEpisode',
  unsupported_non_title_row: 'imdbImport.skipped.unsupportedNonTitleRow',
  unsupported_tmdb_result: 'imdbImport.skipped.unsupportedTmdbResult',
};

const IGNORED_METADATA_LABEL_KEYS: Record<ImdbImportIgnoredMetadataKey, string> = {
  item_notes: 'imdbImport.ignored.itemNotes',
};

export default function ImdbImportProgressScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const requireAccount = useAccountRequired();
  const { accentColor } = useAccentColor();
  const { preparedImport: sharedPreparedImport, clearPreparedImport } = useImdbImportFlow();
  const [preparedImport] = useState(sharedPreparedImport);
  const [status, setStatus] = useState<ImportStatus>('running');
  const [completedChunks, setCompletedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(preparedImport?.chunks.length ?? 0);
  const [progressStats, setProgressStats] = useState<ImdbImportStats | null>(
    preparedImport?.stats ?? null
  );
  const [finalStats, setFinalStats] = useState<ImdbImportStats | null>(null);
  const [errorMessageKey, setErrorMessageKey] = useState<string | null>(null);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (requireAccount()) {
      router.back();
    }
  }, [requireAccount, router]);

  useEffect(() => {
    if (!preparedImport || preparedImport.chunks.length === 0) {
      router.replace('/(tabs)/profile/imdb-import' as any);
    }
  }, [preparedImport, router]);

  const isRunning = status === 'running';
  const runtimeStats = finalStats ?? progressStats;
  const progressPercent =
    totalChunks > 0 ? Math.min(100, Math.round((completedChunks / totalChunks) * 100)) : 0;
  const finalSummaryDescriptionKey =
    runtimeStats && hasImportedEntries(runtimeStats)
      ? 'imdbImport.completeBodyWithImported'
      : 'imdbImport.completeBodyIssuesOnly';

  const importedEntries = useMemo(
    () => createSummaryEntries(runtimeStats?.imported ?? {}, IMPORTED_LABEL_KEYS, t),
    [runtimeStats, t]
  );
  const skippedEntries = useMemo(
    () => createSummaryEntries(runtimeStats?.skipped ?? {}, SKIPPED_REASON_LABEL_KEYS, t),
    [runtimeStats, t]
  );
  const ignoredEntries = useMemo(
    () => createSummaryEntries(runtimeStats?.ignored ?? {}, IGNORED_METADATA_LABEL_KEYS, t),
    [runtimeStats, t]
  );

  useEffect(() => {
    if (!preparedImport) {
      return;
    }

    navigation.setOptions({
      gestureEnabled: !isRunning,
      headerBackVisible: !isRunning,
      title:
        status === 'success'
          ? t('imdbImport.finalSummaryTitle')
          : status === 'failed'
            ? t('imdbImport.errors.importFailedTitle')
            : t('imdbImport.importingTitle'),
    });
  }, [isRunning, navigation, preparedImport, status, t]);

  useEffect(() => {
    if (!preparedImport || !isRunning) {
      return;
    }

    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
    });

    return unsubscribe;
  }, [isRunning, navigation, preparedImport]);

  const runImport = useCallback(async () => {
    if (!preparedImport || preparedImport.chunks.length === 0) {
      router.replace('/(tabs)/profile/imdb-import' as any);
      return;
    }

    setStatus('running');
    setErrorMessageKey(null);
    setFinalStats(null);
    setCompletedChunks(0);
    setTotalChunks(preparedImport.chunks.length);
    setProgressStats(preparedImport.stats);

    try {
      const stats = await imdbImportService.runPreparedImport(preparedImport, (progress) => {
        setCompletedChunks(progress.completedChunks);
        setTotalChunks(progress.totalChunks);
        setProgressStats(progress.stats);
      });

      setFinalStats(stats);
      setProgressStats(stats);
      setStatus('success');
      clearPreparedImport();

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['lists', user?.uid] }),
        queryClient.invalidateQueries({
          queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, user?.uid],
        }),
        queryClient.invalidateQueries({ queryKey: ['ratings', user?.uid] }),
        queryClient.invalidateQueries({ queryKey: ['episodeTracking'] }),
        queryClient.invalidateQueries({ queryKey: ['watchedMovies', user?.uid] }),
      ]);
    } catch (error) {
      const errorCode = getImdbImportErrorCode(error);
      const technicalMessage = getTechnicalErrorMessage(error);

      console.error('[ImdbImportProgressScreen] Import failed:', {
        error,
        errorCode,
        technicalMessage,
      });

      setErrorMessageKey(getImdbImportErrorMessageKey(error));
      setStatus('failed');
    }
  }, [clearPreparedImport, preparedImport, queryClient, router, user?.uid]);

  useEffect(() => {
    if (!preparedImport || hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    void runImport();
  }, [preparedImport, runImport]);

  const handleRetry = () => {
    void runImport();
  };

  const handleBackToFiles = () => {
    router.back();
  };

  if (!preparedImport || preparedImport.chunks.length === 0) {
    return null;
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <StageCard
          title={
            status === 'success'
              ? t('imdbImport.finalSummaryTitle')
              : status === 'failed'
                ? t('imdbImport.errors.importFailedTitle')
                : t('imdbImport.importingTitle')
          }
          description={
            status === 'success'
              ? t(finalSummaryDescriptionKey)
              : status === 'failed'
                ? t(errorMessageKey ?? 'imdbImport.errors.importFailedFallback')
                : t('imdbImport.progressBody', {
                    completed: completedChunks,
                    total: totalChunks,
                  })
          }
        >
          {status !== 'success' ? (
            <>
              <View style={styles.progressHeader}>
                <Text style={styles.progressPercent}>
                  {t('imdbImport.progressPercent', { percent: progressPercent })}
                </Text>
                <Text style={styles.progressChunks}>
                  {t('imdbImport.progressChunks', {
                    completed: completedChunks,
                    total: totalChunks,
                  })}
                </Text>
              </View>
              <View style={styles.progressTrack} testID="imdb-import-progress-bar">
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progressPercent}%`, backgroundColor: accentColor },
                  ]}
                />
              </View>
              {status === 'running' ? (
                <View style={styles.runningRow}>
                  <ActivityIndicator color={accentColor} />
                  <Text style={styles.runningText}>{t('common.loading')}</Text>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: accentColor }]}
                    onPress={handleRetry}
                    activeOpacity={ACTIVE_OPACITY}
                  >
                    <RefreshCw size={18} color={COLORS.white} />
                    <Text style={styles.actionButtonText}>{t('common.retry')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.secondaryActionButton]}
                    onPress={handleBackToFiles}
                    activeOpacity={ACTIVE_OPACITY}
                  >
                    <Text style={styles.secondaryActionButtonText}>{t('imdbImport.backToFiles')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : (
            <>
              <View style={styles.completeBadge}>
                <Check size={20} color={COLORS.white} />
              </View>
              <ResultGroup
                title={t('imdbImport.importedTitle')}
                entries={importedEntries}
                color={COLORS.success}
                icon={<Check size={18} color={COLORS.success} />}
              />
              <ResultGroup
                title={t('imdbImport.skippedTitle')}
                entries={skippedEntries}
                color={COLORS.warning}
                icon={<AlertCircle size={18} color={COLORS.warning} />}
              />
              <ResultGroup
                title={t('imdbImport.ignoredTitle')}
                entries={ignoredEntries}
                color={accentColor}
                icon={<Info size={18} color={accentColor} />}
              />
            </>
          )}
        </StageCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function StageCard({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <View style={styles.stageCard}>
      <Text style={styles.stageTitle}>{title}</Text>
      <Text style={styles.stageDescription}>{description}</Text>
      <View style={styles.stageContent}>{children}</View>
    </View>
  );
}

function ResultGroup({
  color,
  entries,
  icon,
  title,
}: {
  color: string;
  entries: SummaryEntry[];
  icon: React.ReactNode;
  title: string;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <View style={[styles.resultCard, { backgroundColor: hexToRGBA(color, 0.12) }]}>
      <View style={styles.resultHeader}>
        <View style={styles.resultTitleRow}>
          {icon}
          <Text style={styles.resultTitle}>{title}</Text>
        </View>
      </View>
      {entries.map((entry) => (
        <View key={entry.key} style={styles.resultRow}>
          <Text style={styles.resultLabel}>{entry.label}</Text>
          <Text style={styles.resultValue}>{entry.value}</Text>
        </View>
      ))}
    </View>
  );
}

function createSummaryEntries(
  stats: object,
  labelMap: Record<string, string>,
  t: (key: string, options?: Record<string, unknown>) => string
): SummaryEntry[] {
  return Object.entries(stats as Record<string, number>)
    .filter(([, value]) => (value ?? 0) > 0)
    .map(([key, value]) => ({
      key,
      label: t(labelMap[key]),
      value: value ?? 0,
    }))
    .sort((left, right) => right.value - left.value);
}

function hasImportedEntries(stats: ImdbImportStats) {
  return Object.values(stats.imported).some((value) => value > 0);
}

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.l,
    flexDirection: 'row',
    gap: SPACING.s,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: SPACING.m,
    width: '100%',
  },
  actionButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '800',
  },
  actionRow: {
    gap: SPACING.s,
  },
  completeBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.round,
    height: 44,
    justifyContent: 'center',
    marginBottom: SPACING.s,
    width: 44,
  },
  progressChunks: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
  },
  progressFill: {
    borderRadius: BORDER_RADIUS.round,
    height: '100%',
  },
  progressHeader: {
    gap: SPACING.xs,
  },
  progressPercent: {
    color: COLORS.text,
    fontSize: FONT_SIZE.l,
    fontWeight: '800',
  },
  progressTrack: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.round,
    height: 10,
    overflow: 'hidden',
  },
  resultCard: {
    borderRadius: BORDER_RADIUS.l,
    gap: SPACING.s,
    padding: SPACING.m,
  },
  resultHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultLabel: {
    color: COLORS.textSecondary,
    flex: 1,
    fontSize: FONT_SIZE.s,
    marginRight: SPACING.m,
  },
  resultRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
  resultTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.s,
  },
  resultValue: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '800',
  },
  runningRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.s,
  },
  runningText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  scrollContent: {
    gap: SPACING.l,
    padding: SPACING.l,
    paddingBottom: SPACING.xxl,
  },
  secondaryActionButton: {
    backgroundColor: COLORS.surfaceLight,
  },
  secondaryActionButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
  stageCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    gap: SPACING.m,
    padding: SPACING.l,
  },
  stageContent: {
    gap: SPACING.m,
  },
  stageDescription: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 22,
  },
  stageTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.l,
    fontWeight: '800',
  },
});
