import { formatDateTime } from '@/src/utils/timeFormat';
import type {
  FileImportCounts,
  FileImportIgnoredReason,
  FileImportSkipReason,
  FileImportStats,
} from '@/functions/src/shared/fileImport';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { LIST_MEMBERSHIP_INDEX_QUERY_KEY } from '@/src/constants/queryKeys';
import { SHOWLY_IMPORT_ROUTE } from '@/src/constants/showlyImportRoutes';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { useShowlyImportFlow } from '@/src/context/ShowlyImportFlowContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { ShowlyImportRunError, showlyImportService } from '@/src/services/ShowlyImportService';
import { screenStyles } from '@/src/styles/screenStyles';
import { getShowlyErrorCode, getShowlyRunErrorKey } from '@/src/utils/showlyImportError';
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

const IMPORTED_LABEL_KEYS: Record<keyof FileImportCounts, string> = {
  customListsCreated: 'showlyImport.imported.customListsCreated',
  listItems: 'showlyImport.imported.listItems',
  movies: 'showlyImport.imported.movies',
  ratings: 'showlyImport.imported.ratings',
  shows: 'showlyImport.imported.shows',
  watchedEpisodes: 'showlyImport.imported.watchedEpisodes',
  watchedMovies: 'showlyImport.imported.watchedMovies',
};

const SKIPPED_LABEL_KEYS: Record<
  Exclude<FileImportSkipReason, 'unmatched_anime_episode'>,
  string
> = {
  already_tracked_episode: 'showlyImport.skipped.alreadyTrackedEpisode',
  already_tracked_movie: 'showlyImport.skipped.alreadyTrackedMovie',
  ambiguous_title: 'showlyImport.skipped.ambiguousTitle',
  existing_rating: 'showlyImport.skipped.existingRating',
  invalid_date: 'showlyImport.skipped.invalidDate',
  malformed_row: 'showlyImport.skipped.malformedRow',
  missing_identifiers: 'showlyImport.skipped.missingIdentifiers',
  unmatched_episode: 'showlyImport.skipped.unmatchedEpisode',
  unresolved_movie: 'showlyImport.skipped.unresolvedMovie',
  unresolved_show: 'showlyImport.skipped.unresolvedShow',
};

const IGNORED_LABEL_KEYS: Record<
  Exclude<
    FileImportIgnoredReason,
    'anime_extras' | 'dropped_movies' | 'summary_only_episodes' | 'unsupported_episodes'
  >,
  string
> = {
  duplicate_plays: 'showlyImport.ignored.duplicatePlays',
  episode_ratings: 'showlyImport.ignored.episodeRatings',
  hidden_movies: 'showlyImport.ignored.hiddenMovies',
  non_media_list_items: 'showlyImport.ignored.nonMediaListItems',
  pinned_items: 'showlyImport.ignored.pinnedItems',
  rewatched_episodes: 'showlyImport.ignored.rewatchedEpisodes',
  season_ratings: 'showlyImport.ignored.seasonRatings',
};

const MAX_LISTED_TITLES = 50;

export default function ShowlyImportProgressScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const requireAccount = useAccountRequired();
  const { accentColor } = useAccentColor();
  const { preparedImport: sharedPreparedImport, clearPreparedImport } = useShowlyImportFlow();
  const [preparedImport] = useState(sharedPreparedImport);
  const [status, setStatus] = useState<ImportStatus>('running');
  const [completedChunks, setCompletedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(preparedImport?.chunks.length ?? 0);
  const [stats, setStats] = useState<FileImportStats | null>(preparedImport?.stats ?? null);
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
      router.replace(SHOWLY_IMPORT_ROUTE);
    }
  }, [preparedImport, router]);

  const isRunning = status === 'running';
  const progressPercent =
    totalChunks > 0 ? Math.min(100, Math.round((completedChunks / totalChunks) * 100)) : 0;
  const isPartial = status === 'success' && failedChunkIndexes.length > 0;
  const title =
    status === 'success'
      ? t(isPartial ? 'showlyImport.partialSummaryTitle' : 'showlyImport.finalSummaryTitle')
      : status === 'failed'
        ? t('showlyImport.errors.importFailedTitle')
        : t('showlyImport.importingTitle');

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
        router.replace(SHOWLY_IMPORT_ROUTE);
        return;
      }

      setStatus('running');
      setErrorMessage(null);
      setCompletedChunks(0);

      try {
        const result = await showlyImportService.runPreparedImport(
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
        const code = error instanceof ShowlyImportRunError ? error.code : getShowlyErrorCode(error);
        const details = error instanceof ShowlyImportRunError ? error.details : null;
        console.error('[ShowlyImportProgressScreen] Import stopped:', { code, details, error });

        const time = details?.nextAllowedImportAt
          ? formatDateTime(details.nextAllowedImportAt, i18n.language)
          : undefined;
        setErrorMessage(t(getShowlyRunErrorKey(code, details), { time }));
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
  const unmatchedEpisodeTitles = stats?.unmatchedEpisodeTitles ?? [];

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.stageCard}>
          <Text style={styles.stageTitle}>{title}</Text>
          <Text style={styles.stageDescription}>
            {isPartial
              ? t('showlyImport.partialBody')
              : status === 'success'
                ? t(
                    importedEntries.length > 0
                      ? 'showlyImport.completeBody'
                      : 'showlyImport.completeBodyNothingNew'
                  )
                : status === 'failed'
                  ? (errorMessage ?? t('showlyImport.errors.importFailedFallback'))
                  : t('showlyImport.progressBody')}
          </Text>

          <View style={styles.stageContent}>
            {status !== 'success' ? (
              <>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressPercent}>{`${progressPercent}%`}</Text>
                  <Text style={styles.progressChunks}>
                    {t('showlyImport.progressChunks', {
                      completed: completedChunks,
                      total: totalChunks,
                    })}
                  </Text>
                </View>
                <View style={styles.progressTrack} testID="showly-import-progress-bar">
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
                    <Text style={styles.runningText}>{t('showlyImport.keepAppOpen')}</Text>
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
                      label={t('showlyImport.backToFile')}
                      onPress={() => router.back()}
                    />
                  </View>
                )}
              </>
            ) : (
              <>
                <View
                  style={[
                    styles.completeBadge,
                    { backgroundColor: isPartial ? COLORS.warning : COLORS.success },
                  ]}
                >
                  <AppIcon
                    icon={isPartial ? AlertCircleIcon : Tick02Icon}
                    size={20}
                    color={COLORS.white}
                  />
                </View>

                {failedChunkIndexes.length > 0 ? (
                  <View
                    style={[
                      styles.resultCard,
                      { backgroundColor: hexToRGBA(COLORS.warning, 0.14) },
                    ]}
                  >
                    <Text style={styles.resultTitle}>
                      {t('showlyImport.failedChunksTitle', { count: failedChunkIndexes.length })}
                    </Text>
                    <Text style={styles.resultLabel}>{t('showlyImport.failedChunksBody')}</Text>
                    <ActionButton
                      label={t('showlyImport.retryFailed')}
                      color={accentColor}
                      icon
                      onPress={() => void runImport(failedChunkIndexes)}
                    />
                  </View>
                ) : null}

                <ResultGroup
                  title={t('showlyImport.importedTitle')}
                  entries={importedEntries}
                  color={COLORS.success}
                  icon={<AppIcon icon={Tick02Icon} size={18} color={COLORS.success} />}
                />
                <ResultGroup
                  title={t('showlyImport.skippedTitle')}
                  entries={skippedEntries}
                  color={COLORS.warning}
                  icon={<AppIcon icon={AlertCircleIcon} size={18} color={COLORS.warning} />}
                />
                <ResultGroup
                  title={t('showlyImport.ignoredTitle')}
                  entries={ignoredEntries}
                  color={accentColor}
                  icon={<AppIcon icon={InformationCircleIcon} size={18} color={accentColor} />}
                />

                <TitleList
                  testID="showly-import-unresolved"
                  title={t('showlyImport.unresolvedTitlesTitle')}
                  body={t('showlyImport.unresolvedTitlesBody')}
                  titles={unresolvedTitles}
                  moreLabel={(count) => t('showlyImport.andMore', { count })}
                />
                <TitleList
                  testID="showly-import-unmatched-episodes"
                  title={t('showlyImport.unmatchedEpisodeTitlesTitle')}
                  body={t('showlyImport.unmatchedEpisodeTitlesBody')}
                  titles={unmatchedEpisodeTitles}
                  moreLabel={(count) => t('showlyImport.andMore', { count })}
                />
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

function TitleList({
  body,
  moreLabel,
  testID,
  title,
  titles,
}: {
  body: string;
  moreLabel: (count: number) => string;
  testID: string;
  title: string;
  titles: string[];
}) {
  if (titles.length === 0) return null;

  return (
    <View style={[styles.resultCard, { backgroundColor: COLORS.surfaceLight }]} testID={testID}>
      <Text style={styles.resultTitle}>{title}</Text>
      <Text style={styles.resultLabel}>{body}</Text>
      {titles.slice(0, MAX_LISTED_TITLES).map((name) => (
        <Text key={name} style={styles.listedTitle}>
          • {name}
        </Text>
      ))}
      {titles.length > MAX_LISTED_TITLES ? (
        <Text style={styles.resultLabel}>{moreLabel(titles.length - MAX_LISTED_TITLES)}</Text>
      ) : null}
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
export function mergeRetry(
  previous: FileImportStats,
  retry: FileImportStats,
  clientStats: FileImportStats
): FileImportStats {
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
  (Object.keys(imported) as (keyof FileImportCounts)[]).forEach((key) => {
    imported[key] += retry.imported[key];
  });
  const merged: FileImportStats = {
    ignored: add(previous.ignored, subtract(retry.ignored, clientStats.ignored)),
    imported,
    processedEntities: previous.processedEntities + retry.processedEntities,
    skipped: add(previous.skipped, subtract(retry.skipped, clientStats.skipped)),
    unresolvedTitles: Array.from(
      new Set([...previous.unresolvedTitles, ...retry.unresolvedTitles])
    ),
  };
  if (previous.unmatchedEpisodeTitles || retry.unmatchedEpisodeTitles) {
    merged.unmatchedEpisodeTitles = Array.from(
      new Set([...(previous.unmatchedEpisodeTitles ?? []), ...(retry.unmatchedEpisodeTitles ?? [])])
    );
  }
  return merged;
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
  listedTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
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
});
