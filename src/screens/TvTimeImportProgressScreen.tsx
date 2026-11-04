import type {
  TvTimeIgnoredReason,
  TvTimeImportCounts,
  TvTimeImportStats,
  TvTimeSkipReason,
} from '@/functions/src/shared/tvtimeImport';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { LIST_MEMBERSHIP_INDEX_QUERY_KEY } from '@/src/constants/queryKeys';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { TVTIME_IMPORT_ROUTE } from '@/src/constants/tvtimeImportRoutes';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { useTvTimeImportFlow } from '@/src/context/TvTimeImportFlowContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { TvTimeImportRunError, tvTimeImportService } from '@/src/services/TvTimeImportService';
import { screenStyles } from '@/src/styles/screenStyles';
import { getTvTimeErrorCode, getTvTimeRunErrorKey } from '@/src/utils/tvtimeImportError';
import {
  AlertCircleIcon,
  InformationCircleIcon,
  RefreshIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
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

type ImportStatus = 'running' | 'failed' | 'success';

interface SummaryEntry {
  key: string;
  label: string;
  value: number;
}

const IMPORTED_LABEL_KEYS: Record<keyof TvTimeImportCounts, string> = {
  customListsCreated: 'tvtimeImport.imported.customListsCreated',
  listItems: 'tvtimeImport.imported.listItems',
  movies: 'tvtimeImport.imported.movies',
  ratings: 'tvtimeImport.imported.ratings',
  shows: 'tvtimeImport.imported.shows',
  watchedEpisodes: 'tvtimeImport.imported.watchedEpisodes',
  watchedMovies: 'tvtimeImport.imported.watchedMovies',
};

const SKIPPED_LABEL_KEYS: Record<TvTimeSkipReason, string> = {
  already_tracked_episode: 'tvtimeImport.skipped.alreadyTrackedEpisode',
  already_tracked_movie: 'tvtimeImport.skipped.alreadyTrackedMovie',
  ambiguous_title: 'tvtimeImport.skipped.ambiguousTitle',
  existing_rating: 'tvtimeImport.skipped.existingRating',
  invalid_date: 'tvtimeImport.skipped.invalidDate',
  malformed_row: 'tvtimeImport.skipped.malformedRow',
  missing_identifiers: 'tvtimeImport.skipped.missingIdentifiers',
  unmatched_episode: 'tvtimeImport.skipped.unmatchedEpisode',
  unresolved_movie: 'tvtimeImport.skipped.unresolvedMovie',
  unresolved_show: 'tvtimeImport.skipped.unresolvedShow',
};

const IGNORED_LABEL_KEYS: Record<TvTimeIgnoredReason, string> = {
  duplicate_plays: 'tvtimeImport.ignored.duplicatePlays',
  episode_ratings: 'tvtimeImport.ignored.episodeRatings',
  rewatched_episodes: 'tvtimeImport.ignored.rewatchedEpisodes',
};

const MAX_LISTED_TITLES = 50;

export default function TvTimeImportProgressScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const requireAccount = useAccountRequired();
  const { accentColor } = useAccentColor();
  const { preparedImport: sharedPreparedImport, clearPreparedImport } = useTvTimeImportFlow();
  const [preparedImport] = useState(sharedPreparedImport);
  const [status, setStatus] = useState<ImportStatus>('running');
  const [completedChunks, setCompletedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(preparedImport?.chunks.length ?? 0);
  const [stats, setStats] = useState<TvTimeImportStats | null>(preparedImport?.stats ?? null);
  const [failedChunkIndexes, setFailedChunkIndexes] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (requireAccount()) {
      router.back();
    }
  }, [requireAccount, router]);

  useEffect(() => {
    if (!preparedImport || preparedImport.chunks.length === 0) {
      router.replace(TVTIME_IMPORT_ROUTE);
    }
  }, [preparedImport, router]);

  const isRunning = status === 'running';
  const progressPercent =
    totalChunks > 0 ? Math.min(100, Math.round((completedChunks / totalChunks) * 100)) : 0;
  const title =
    status === 'success'
      ? t('tvtimeImport.finalSummaryTitle')
      : status === 'failed'
        ? t('tvtimeImport.errors.importFailedTitle')
        : t('tvtimeImport.importingTitle');

  const importedEntries = useMemo(
    () => toEntries(stats?.imported ?? {}, IMPORTED_LABEL_KEYS, t),
    [stats, t]
  );
  const skippedEntries = useMemo(
    () => toEntries(stats?.skipped ?? {}, SKIPPED_LABEL_KEYS, t),
    [stats, t]
  );
  const ignoredEntries = useMemo(
    () => toEntries(stats?.ignored ?? {}, IGNORED_LABEL_KEYS, t),
    [stats, t]
  );

  useEffect(() => {
    if (!preparedImport) return;
    navigation.setOptions({ gestureEnabled: !isRunning, headerBackVisible: !isRunning, title });
  }, [isRunning, navigation, preparedImport, title]);

  useEffect(() => {
    if (!preparedImport || !isRunning) return;
    return navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
    });
  }, [isRunning, navigation, preparedImport]);

  const runImport = useCallback(
    async (onlyChunkIndexes?: number[]) => {
      if (!preparedImport || preparedImport.chunks.length === 0 || !user?.uid) {
        router.replace(TVTIME_IMPORT_ROUTE);
        return;
      }

      setStatus('running');
      setErrorMessage(null);
      setCompletedChunks(0);

      try {
        const result = await tvTimeImportService.runPreparedImport(
          preparedImport,
          user.uid,
          (progress) => {
            setCompletedChunks(progress.completedChunks);
            setTotalChunks(progress.totalChunks);
            // A retry pass reports only its own chunks; keep earlier totals.
            if (!onlyChunkIndexes) setStats(progress.stats);
          },
          onlyChunkIndexes
        );

        setStats((previous) =>
          onlyChunkIndexes && previous
            ? mergeRetry(previous, result.stats, preparedImport.stats)
            : result.stats
        );
        setFailedChunkIndexes(result.failedChunkIndexes);
        setStatus('success');
        if (result.failedChunkIndexes.length === 0) clearPreparedImport();

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['lists', user.uid] }),
          queryClient.invalidateQueries({ queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, user.uid] }),
          queryClient.invalidateQueries({ queryKey: ['ratings', user.uid] }),
          queryClient.invalidateQueries({ queryKey: ['episodeTracking'] }),
          queryClient.invalidateQueries({ queryKey: ['watchedMovies', user.uid] }),
        ]);
      } catch (error) {
        const code = error instanceof TvTimeImportRunError ? error.code : getTvTimeErrorCode(error);
        const details = error instanceof TvTimeImportRunError ? error.details : null;
        console.error('[TvTimeImportProgressScreen] Import stopped:', { code, details, error });

        const time = details?.nextAllowedImportAt
          ? new Date(details.nextAllowedImportAt).toLocaleString(i18n.language)
          : undefined;
        setErrorMessage(t(getTvTimeRunErrorKey(code, details), { time }));
        setStatus('failed');
      }
    },
    [clearPreparedImport, i18n.language, preparedImport, queryClient, router, t, user?.uid]
  );

  useEffect(() => {
    if (!preparedImport || hasStartedRef.current) return;
    hasStartedRef.current = true;
    void runImport();
  }, [preparedImport, runImport]);

  if (!preparedImport || preparedImport.chunks.length === 0) {
    return null;
  }

  const unresolvedTitles = stats?.unresolvedTitles ?? [];

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.stageCard}>
          <Text style={styles.stageTitle}>{title}</Text>
          <Text style={styles.stageDescription}>
            {status === 'success'
              ? t(
                  importedEntries.length > 0
                    ? 'tvtimeImport.completeBody'
                    : 'tvtimeImport.completeBodyNothingNew'
                )
              : status === 'failed'
                ? (errorMessage ?? t('tvtimeImport.errors.importFailedFallback'))
                : t('tvtimeImport.progressBody')}
          </Text>

          <View style={styles.stageContent}>
            {status !== 'success' ? (
              <>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressPercent}>{`${progressPercent}%`}</Text>
                  <Text style={styles.progressChunks}>
                    {t('tvtimeImport.progressChunks', {
                      completed: completedChunks,
                      total: totalChunks,
                    })}
                  </Text>
                </View>
                <View style={styles.progressTrack} testID="tvtime-import-progress-bar">
                  <View
                    style={[
                      styles.progressFill,
                      { backgroundColor: accentColor, width: `${progressPercent}%` },
                    ]}
                  />
                </View>
                {status === 'running' ? (
                  <View style={styles.runningRow}>
                    <ActivityIndicator color={accentColor} />
                    <Text style={styles.runningText}>{t('tvtimeImport.keepAppOpen')}</Text>
                  </View>
                ) : (
                  <View style={styles.actionRow}>
                    <ActionButton
                      label={t('common.retry')}
                      color={accentColor}
                      icon
                      onPress={() => void runImport()}
                    />
                    <ActionButton
                      label={t('tvtimeImport.backToFile')}
                      onPress={() => router.back()}
                    />
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={[styles.completeBadge, { backgroundColor: COLORS.success }]}>
                  <AppIcon icon={Tick02Icon} size={20} color={COLORS.white} />
                </View>

                {failedChunkIndexes.length > 0 ? (
                  <View
                    style={[
                      styles.resultCard,
                      { backgroundColor: hexToRGBA(COLORS.warning, 0.14) },
                    ]}
                  >
                    <Text style={styles.resultTitle}>
                      {t('tvtimeImport.failedChunksTitle', { count: failedChunkIndexes.length })}
                    </Text>
                    <Text style={styles.resultLabel}>{t('tvtimeImport.failedChunksBody')}</Text>
                    <ActionButton
                      label={t('tvtimeImport.retryFailed')}
                      color={accentColor}
                      icon
                      onPress={() => void runImport(failedChunkIndexes)}
                    />
                  </View>
                ) : null}

                <ResultGroup
                  title={t('tvtimeImport.importedTitle')}
                  entries={importedEntries}
                  color={COLORS.success}
                  icon={<AppIcon icon={Tick02Icon} size={18} color={COLORS.success} />}
                />
                <ResultGroup
                  title={t('tvtimeImport.skippedTitle')}
                  entries={skippedEntries}
                  color={COLORS.warning}
                  icon={<AppIcon icon={AlertCircleIcon} size={18} color={COLORS.warning} />}
                />
                <ResultGroup
                  title={t('tvtimeImport.ignoredTitle')}
                  entries={ignoredEntries}
                  color={accentColor}
                  icon={<AppIcon icon={InformationCircleIcon} size={18} color={accentColor} />}
                />

                {unresolvedTitles.length > 0 ? (
                  <View
                    style={[styles.resultCard, { backgroundColor: COLORS.surfaceLight }]}
                    testID="tvtime-import-unresolved"
                  >
                    <Text style={styles.resultTitle}>
                      {t('tvtimeImport.unresolvedTitlesTitle')}
                    </Text>
                    <Text style={styles.resultLabel}>{t('tvtimeImport.unresolvedTitlesBody')}</Text>
                    {unresolvedTitles.slice(0, MAX_LISTED_TITLES).map((name) => (
                      <Text key={name} style={styles.unresolvedTitle}>
                        • {name}
                      </Text>
                    ))}
                    {unresolvedTitles.length > MAX_LISTED_TITLES ? (
                      <Text style={styles.resultLabel}>
                        {t('tvtimeImport.andMore', {
                          count: unresolvedTitles.length - MAX_LISTED_TITLES,
                        })}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({
  color,
  icon = false,
  label,
  onPress,
}: {
  color?: string;
  icon?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionButton, { backgroundColor: color ?? COLORS.surfaceLight }]}
      onPress={onPress}
      activeOpacity={ACTIVE_OPACITY}
    >
      {icon ? <AppIcon icon={RefreshIcon} size={18} color={COLORS.white} /> : null}
      <Text style={[styles.actionButtonText, { color: color ? COLORS.white : COLORS.text }]}>
        {label}
      </Text>
    </TouchableOpacity>
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
  if (entries.length === 0) return null;

  return (
    <View style={[styles.resultCard, { backgroundColor: hexToRGBA(color, 0.12) }]}>
      <View style={styles.resultTitleRow}>
        {icon}
        <Text style={styles.resultTitle}>{title}</Text>
      </View>
      {entries.map((entry) => (
        <View key={entry.key} style={styles.resultRow}>
          <Text style={styles.resultLabel}>{entry.label}</Text>
          <Text style={styles.resultValue}>{entry.value.toLocaleString()}</Text>
        </View>
      ))}
    </View>
  );
}

function toEntries(
  values: object,
  labels: Record<string, string>,
  t: (key: string) => string
): SummaryEntry[] {
  return Object.entries(values as Record<string, number | undefined>)
    .filter(([key, value]) => (value ?? 0) > 0 && labels[key])
    .map(([key, value]) => ({ key, label: t(labels[key]), value: value ?? 0 }))
    .sort((a, b) => b.value - a.value);
}

/** A retry pass starts from the client-side stats again; add only its server-side results. */
function mergeRetry(
  previous: TvTimeImportStats,
  retry: TvTimeImportStats,
  clientStats: TvTimeImportStats
): TvTimeImportStats {
  const subtract = <T extends string>(
    a: Partial<Record<T, number>>,
    b: Partial<Record<T, number>>
  ) =>
    Object.fromEntries(
      Object.entries(a).map(([key, value]) => [
        key,
        (value as number) - ((b as Record<string, number>)[key] ?? 0),
      ])
    ) as Partial<Record<T, number>>;
  const add = <T extends string>(a: Partial<Record<T, number>>, b: Partial<Record<T, number>>) => {
    const out: Record<string, number> = { ...(a as Record<string, number>) };
    for (const [key, value] of Object.entries(b)) out[key] = (out[key] ?? 0) + (value as number);
    return out as Partial<Record<T, number>>;
  };
  const imported = { ...previous.imported };
  (Object.keys(imported) as (keyof TvTimeImportCounts)[]).forEach((key) => {
    imported[key] += retry.imported[key];
  });
  return {
    ignored: add(previous.ignored, subtract(retry.ignored, clientStats.ignored)),
    imported,
    processedEntities: previous.processedEntities + retry.processedEntities,
    skipped: add(previous.skipped, subtract(retry.skipped, clientStats.skipped)),
    unresolvedTitles: Array.from(
      new Set([...previous.unresolvedTitles, ...retry.unresolvedTitles])
    ),
  };
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
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
  },
  actionRow: {
    gap: SPACING.s,
  },
  completeBadge: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
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
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressPercent: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xl,
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
  resultLabel: {
    color: COLORS.textSecondary,
    flex: 1,
    fontSize: FONT_SIZE.s,
    lineHeight: 18,
  },
  resultRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.s,
  },
  resultTitle: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
  },
  resultTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.s,
  },
  resultValue: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
  },
  runningRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.s,
  },
  runningText: {
    color: COLORS.textSecondary,
    flex: 1,
    fontSize: FONT_SIZE.s,
  },
  scrollContent: {
    gap: SPACING.l,
    padding: SPACING.l,
    paddingBottom: SPACING.xxl,
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
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.l,
  },
  unresolvedTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
  },
});
