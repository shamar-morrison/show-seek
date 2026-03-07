import { LIST_MEMBERSHIP_INDEX_QUERY_KEY } from '@/src/constants/queryKeys';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { imdbImportService } from '@/src/services/ImdbImportService';
import { screenStyles } from '@/src/styles/screenStyles';
import { getTechnicalErrorMessage } from '@/src/utils/errorPresentation';
import { getImdbImportErrorCode, getImdbImportErrorMessageKey } from '@/src/utils/imdbImportError';
import { type PreparedImdbImport } from '@/src/utils/imdbImport';
import { useQueryClient } from '@tanstack/react-query';
import type {
  ImdbImportFileKind,
  ImdbImportIgnoredMetadataKey,
  ImdbImportSkipReason,
  ImdbImportStats,
} from '@/functions/src/shared/imdbImport';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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

const FILE_KIND_LABEL_KEYS: Record<ImdbImportFileKind, string> = {
  checkins: 'imdbImport.fileKinds.checkins',
  list: 'imdbImport.fileKinds.list',
  ratings: 'imdbImport.fileKinds.ratings',
  watchlist: 'imdbImport.fileKinds.watchlist',
};

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

const IMPORTED_LABEL_KEYS = {
  customListsCreated: 'imdbImport.imported.customListsCreated',
  listItems: 'imdbImport.imported.listItems',
  ratings: 'imdbImport.imported.ratings',
  watchedEpisodes: 'imdbImport.imported.watchedEpisodes',
  watchedMovies: 'imdbImport.imported.watchedMovies',
  watchedShows: 'imdbImport.imported.watchedShows',
} as const;

export default function ImdbImportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const requireAccount = useAccountRequired();
  const { isLoading: isPremiumLoading, isPremium } = usePremium();
  const { accentColor } = useAccentColor();
  const [preparedImport, setPreparedImport] = useState<PreparedImdbImport | null>(null);
  const [isPickingFiles, setIsPickingFiles] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [completedChunks, setCompletedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [finalStats, setFinalStats] = useState<ImdbImportStats | null>(null);

  useEffect(() => {
    if (requireAccount()) {
      router.back();
      return;
    }

    if (isPremiumLoading) {
      return;
    }

    if (!isPremium) {
      router.replace('/premium');
    }
  }, [isPremium, isPremiumLoading, requireAccount, router]);

  const summaryStats = finalStats ?? preparedImport?.stats ?? null;

  const importedEntries = useMemo(() => {
    if (!summaryStats) {
      return [];
    }

    return Object.entries(summaryStats.imported)
      .filter(([, value]) => value > 0)
      .map(([key, value]) => ({
        key,
        label: t(IMPORTED_LABEL_KEYS[key as keyof typeof IMPORTED_LABEL_KEYS]),
        value,
      }));
  }, [summaryStats, t]);

  const skippedEntries = useMemo(() => {
    if (!summaryStats) {
      return [];
    }

    return Object.entries(summaryStats.skipped)
      .filter(([, value]) => (value ?? 0) > 0)
      .map(([key, value]) => ({
        key,
        label: t(SKIPPED_REASON_LABEL_KEYS[key as ImdbImportSkipReason]),
        value: value ?? 0,
      }));
  }, [summaryStats, t]);

  const ignoredEntries = useMemo(() => {
    if (!summaryStats) {
      return [];
    }

    return Object.entries(summaryStats.ignored)
      .filter(([, value]) => (value ?? 0) > 0)
      .map(([key, value]) => ({
        key,
        label: t(IGNORED_METADATA_LABEL_KEYS[key as ImdbImportIgnoredMetadataKey]),
        value: value ?? 0,
      }));
  }, [summaryStats, t]);

  const handlePickFiles = async () => {
    if (isPickingFiles) {
      return;
    }

    setIsPickingFiles(true);
    try {
      const rawFiles = await imdbImportService.pickRawFiles();
      if (rawFiles.length === 0) {
        return;
      }

      setPreparedImport(imdbImportService.prepareFiles(rawFiles));
      setFinalStats(null);
      setCompletedChunks(0);
      setTotalChunks(0);
    } catch (error) {
      console.error('[ImdbImportScreen] Failed to pick files:', error);
      Alert.alert(t('common.errorTitle'), t('imdbImport.errors.pickFailed'));
    } finally {
      setIsPickingFiles(false);
    }
  };

  const handleStartImport = async () => {
    if (!preparedImport || isImporting) {
      return;
    }

    if (preparedImport.chunks.length === 0) {
      Alert.alert(t('imdbImport.nothingToImportTitle'), t('imdbImport.nothingToImportMessage'));
      return;
    }

    setIsImporting(true);
    try {
      const stats = await imdbImportService.runPreparedImport(preparedImport, (progress) => {
        setCompletedChunks(progress.completedChunks);
        setTotalChunks(progress.totalChunks);
      });
      setFinalStats(stats);
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

      console.error('[ImdbImportScreen] Import failed:', {
        error,
        errorCode,
        technicalMessage,
      });

      Alert.alert(
        t('imdbImport.errors.importFailedTitle'),
        t(getImdbImportErrorMessageKey(error))
      );
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('imdbImport.title')}</Text>
        <Text style={styles.description}>{t('imdbImport.description')}</Text>

        <View style={styles.noticeCard}>
          <Text style={styles.cardTitle}>{t('imdbImport.supportedTitle')}</Text>
          <Text style={styles.cardBody}>{t('imdbImport.supportedBody')}</Text>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: accentColor }]}
            onPress={handlePickFiles}
            activeOpacity={ACTIVE_OPACITY}
            disabled={isPickingFiles || isImporting}
          >
            {isPickingFiles ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={styles.primaryButtonText}>
                {preparedImport ? t('imdbImport.replaceFiles') : t('imdbImport.selectFiles')}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              preparedImport?.chunks?.length
                ? styles.secondaryButtonEnabled
                : styles.secondaryButtonDisabled,
            ]}
            onPress={handleStartImport}
            activeOpacity={ACTIVE_OPACITY}
            disabled={!preparedImport?.chunks?.length || isImporting}
          >
            {isImporting ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <Text style={styles.secondaryButtonText}>{t('imdbImport.startImport')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {preparedImport ? (
          <>
            <Section title={t('imdbImport.recognizedFilesTitle')}>
              {preparedImport.files.map((file) => (
                <View key={file.fileName} style={styles.fileRow}>
                  <View style={styles.fileRowText}>
                    <Text style={styles.fileName}>{file.fileName}</Text>
                    <Text style={styles.fileMeta}>
                      {t(FILE_KIND_LABEL_KEYS[file.kind])} ·{' '}
                      {t('imdbImport.rowsCount', { count: file.totalRows })}
                    </Text>
                  </View>
                </View>
              ))}
            </Section>

            {preparedImport.unsupportedFiles.length > 0 ? (
              <Section title={t('imdbImport.unsupportedFilesTitle')}>
                {preparedImport.unsupportedFiles.map((fileName) => (
                  <Text key={fileName} style={styles.detailText}>
                    {fileName}
                  </Text>
                ))}
              </Section>
            ) : null}

            <Section
              title={finalStats ? t('imdbImport.finalSummaryTitle') : t('imdbImport.preflightTitle')}
            >
              <StatsBlock title={t('imdbImport.importedTitle')} entries={importedEntries} />
              <StatsBlock title={t('imdbImport.skippedTitle')} entries={skippedEntries} />
              <StatsBlock title={t('imdbImport.ignoredTitle')} entries={ignoredEntries} />
            </Section>
          </>
        ) : (
          <Text style={styles.emptyState}>{t('imdbImport.emptyState')}</Text>
        )}

        {isImporting || totalChunks > 0 ? (
          <View style={styles.progressCard}>
            <Text style={styles.cardTitle}>{t('imdbImport.progressTitle')}</Text>
            <Text style={styles.cardBody}>
              {t('imdbImport.progressBody', {
                completed: completedChunks,
                total: totalChunks,
              })}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function StatsBlock({
  entries,
  title,
}: {
  entries: Array<{ key: string; label: string; value: number }>;
  title: string;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <View style={styles.statsBlock}>
      <Text style={styles.statsTitle}>{title}</Text>
      {entries.map((entry) => (
        <View key={entry.key} style={styles.statsRow}>
          <Text style={styles.detailText}>{entry.label}</Text>
          <Text style={styles.statsValue}>{entry.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.s,
  },
  cardBody: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    lineHeight: 20,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  content: {
    gap: SPACING.l,
    padding: SPACING.l,
  },
  description: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 22,
  },
  detailText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
  },
  emptyState: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
  },
  fileMeta: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
  },
  fileName: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  fileRow: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.m,
  },
  fileRowText: {
    gap: SPACING.xs,
  },
  noticeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.l,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: SPACING.m,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
  progressCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.l,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: SPACING.m,
  },
  secondaryButtonDisabled: {
    backgroundColor: COLORS.surfaceLight,
    opacity: 0.5,
  },
  secondaryButtonEnabled: {
    backgroundColor: COLORS.surface,
  },
  secondaryButtonText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
  section: {
    gap: SPACING.s,
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    gap: SPACING.m,
    padding: SPACING.l,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
  statsBlock: {
    gap: SPACING.s,
  },
  statsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statsTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statsValue: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '700',
  },
  title: {
    color: COLORS.text,
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
  },
});
