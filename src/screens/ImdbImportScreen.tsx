import type {
  ImdbImportFileKind,
  ImdbImportIgnoredMetadataKey,
  ImdbImportSkipReason,
  ImdbImportStats,
} from '@/functions/src/shared/imdbImport';
import {
  CollapsibleCategory,
  CollapsibleFeatureItem,
} from '@/src/components/ui/CollapsibleCategory';
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
import { imdbImportService } from '@/src/services/ImdbImportService';
import { screenStyles } from '@/src/styles/screenStyles';
import { getTechnicalErrorMessage } from '@/src/utils/errorPresentation';
import { type PreparedImdbImport } from '@/src/utils/imdbImport';
import { getImdbImportErrorCode, getImdbImportErrorMessageKey } from '@/src/utils/imdbImportError';
import { useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { AlertCircle, ArrowRight, Check, Info, Upload } from 'lucide-react-native';
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

const IMDB_BRAND_COLOR = '#F5C518';

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

type SummaryEntry = {
  key: string;
  label: string;
  value: number;
};

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
  const [progressStats, setProgressStats] = useState<ImdbImportStats | null>(null);
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

  const runtimeStats = finalStats ?? progressStats;
  const progressPercent =
    totalChunks > 0 ? Math.min(100, Math.round((completedChunks / totalChunks) * 100)) : 0;

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

  const supportedRowCount = preparedImport?.stats.processedActions ?? 0;
  const selectedFileCount =
    (preparedImport?.files.length ?? 0) + (preparedImport?.unsupportedFiles.length ?? 0);
  const selectedChunkCount = preparedImport?.chunks.length ?? 0;
  const hasImportableChunks = selectedChunkCount > 0;
  const finalSummaryDescriptionKey =
    importedEntries.length > 0
      ? 'imdbImport.completeBodyWithImported'
      : 'imdbImport.completeBodyIssuesOnly';

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
      setProgressStats(null);
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
    setFinalStats(null);
    setProgressStats(preparedImport.stats);
    setCompletedChunks(0);
    setTotalChunks(preparedImport.chunks.length);

    try {
      const stats = await imdbImportService.runPreparedImport(preparedImport, (progress) => {
        setCompletedChunks(progress.completedChunks);
        setTotalChunks(progress.totalChunks);
        setProgressStats(progress.stats);
      });
      setFinalStats(stats);
      setProgressStats(stats);
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

      Alert.alert(t('imdbImport.errors.importFailedTitle'), t(getImdbImportErrorMessageKey(error)));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          <View style={styles.syncIconsContainer}>
            <View style={styles.imdbHeroCircle}>
              <Image
                source={require('@/assets/images/imdb.png')}
                contentFit="contain"
                style={styles.imdbHeroLogo}
              />
            </View>
            <ArrowRight size={24} color={COLORS.textSecondary} style={styles.arrowIcon} />
            <View style={styles.showSeekIconCircle}>
              <Image
                source={require('@/assets/images/icon.png')}
                contentFit="contain"
                style={styles.showSeekIcon}
              />
            </View>
          </View>
          <Text style={styles.heroTitle}>{t('imdbImport.title')}</Text>
          <Text style={styles.heroSubtitle}>{t('imdbImport.description')}</Text>
        </View>

        <StageCard
          title={t('imdbImport.selectStageTitle')}
          description={t('imdbImport.selectStageBody')}
        >
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryButton, styles.imdbButton]}
              onPress={handlePickFiles}
              activeOpacity={ACTIVE_OPACITY}
              disabled={isPickingFiles || isImporting}
            >
              {isPickingFiles ? (
                <ActivityIndicator color={COLORS.black} />
              ) : (
                <>
                  <Text style={styles.imdbButtonText}>
                    {preparedImport ? t('imdbImport.replaceFiles') : t('imdbImport.selectFiles')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.startButton,
                {
                  backgroundColor:
                    hasImportableChunks && !isImporting ? accentColor : COLORS.surfaceLight,
                },
              ]}
              onPress={handleStartImport}
              activeOpacity={ACTIVE_OPACITY}
              disabled={!hasImportableChunks || isImporting}
            >
              {isImporting ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <>
                  <Upload size={18} color={COLORS.white} />
                  <Text style={styles.startButtonText}>{t('imdbImport.startImport')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {preparedImport ? (
            <>
              <View style={styles.metaGrid}>
                <MetaPill
                  label={t('imdbImport.meta.filesSelected')}
                  value={t('imdbImport.meta.filesValue', { count: selectedFileCount })}
                />
                <MetaPill
                  label={t('imdbImport.meta.supportedRows')}
                  value={t('imdbImport.meta.rowsValue', { count: supportedRowCount })}
                />
                <MetaPill
                  label={t('imdbImport.meta.uploadBatches')}
                  value={t('imdbImport.meta.batchesValue', { count: selectedChunkCount })}
                />
              </View>

              <View style={styles.fileSection}>
                <Text style={styles.sectionLabel}>{t('imdbImport.recognizedFilesTitle')}</Text>
                <View style={styles.fileList}>
                  {preparedImport.files.map((file) => (
                    <View key={file.fileName} style={styles.fileRow}>
                      <View style={styles.fileRowHeader}>
                        <Text style={styles.fileName}>{file.fileName}</Text>
                        <View style={styles.kindBadge}>
                          <Text style={styles.kindBadgeText}>
                            {t(FILE_KIND_LABEL_KEYS[file.kind])}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.fileMeta}>
                        {t('imdbImport.rowsCount', { count: file.totalRows })}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>

              {preparedImport.unsupportedFiles.length > 0 ? (
                <View style={styles.warningPanel}>
                  <Text style={styles.warningTitle}>{t('imdbImport.unsupportedFilesTitle')}</Text>
                  {preparedImport.unsupportedFiles.map((fileName) => (
                    <Text key={fileName} style={styles.warningText}>
                      • {fileName}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </StageCard>

        {preparedImport && hasImportableChunks && !isImporting && !finalStats ? (
          <StageCard title={t('imdbImport.readyTitle')} description={t('imdbImport.readyBody')}>
            <View style={styles.inlineNote}>
              <Info size={16} color={COLORS.textSecondary} />
              <Text style={styles.inlineNoteText}>{t('imdbImport.readyNote')}</Text>
            </View>
          </StageCard>
        ) : null}

        {preparedImport && !hasImportableChunks && !isImporting && !finalStats ? (
          <StageCard
            title={t('imdbImport.nothingToImportTitle')}
            description={t('imdbImport.nothingToImportMessage')}
          >
            {null}
          </StageCard>
        ) : null}

        {isImporting ? (
          <StageCard
            title={t('imdbImport.importingTitle')}
            description={t('imdbImport.progressBody', {
              completed: completedChunks,
              total: totalChunks,
            })}
          >
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
          </StageCard>
        ) : null}

        {finalStats ? (
          <StageCard
            title={t('imdbImport.finalSummaryTitle')}
            description={t(finalSummaryDescriptionKey)}
          >
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
          </StageCard>
        ) : null}

        <CollapsibleCategory title={t('imdbImport.whatWillBeImportedTitle')} defaultExpanded>
          <CollapsibleFeatureItem
            text={t('imdbImport.features.ratingsTitle')}
            description={t('imdbImport.features.ratingsDescription')}
            icon="star-outline"
          />
          <CollapsibleFeatureItem
            text={t('imdbImport.features.listsTitle')}
            description={t('imdbImport.features.listsDescription')}
            icon="bookmark-outline"
          />
          <CollapsibleFeatureItem
            text={t('imdbImport.features.checkinsTitle')}
            description={t('imdbImport.features.checkinsDescription')}
            icon="checkmark-done-outline"
          />
          <CollapsibleFeatureItem
            text={t('imdbImport.features.skipsTitle')}
            description={t('imdbImport.features.skipsDescription')}
            icon="information-circle-outline"
          />
        </CollapsibleCategory>

        <CollapsibleCategory title={t('imdbImport.howItWorksTitle')}>
          <CollapsibleFeatureItem
            text={t('imdbImport.howItWorks.selectTitle')}
            description={t('imdbImport.howItWorks.selectDescription')}
            icon="document-text-outline"
          />
          <CollapsibleFeatureItem
            text={t('imdbImport.howItWorks.matchTitle')}
            description={t('imdbImport.howItWorks.matchDescription')}
            icon="swap-horizontal-outline"
          />
          <CollapsibleFeatureItem
            text={t('imdbImport.howItWorks.mergeTitle')}
            description={t('imdbImport.howItWorks.mergeDescription')}
            icon="shield-checkmark-outline"
          />
          <CollapsibleFeatureItem
            text={t('imdbImport.howItWorks.summaryTitle')}
            description={t('imdbImport.howItWorks.summaryDescription')}
            icon="analytics-outline"
          />
        </CollapsibleCategory>
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

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
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

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'column',
    gap: SPACING.s,
  },
  arrowIcon: {
    marginHorizontal: SPACING.s,
    marginLeft: SPACING.l,
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
  fileList: {
    gap: SPACING.s,
  },
  fileMeta: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
  },
  fileName: {
    color: COLORS.text,
    flex: 1,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
    marginRight: SPACING.s,
  },
  fileRow: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.l,
    gap: SPACING.xs,
    padding: SPACING.m,
  },
  fileRowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  fileSection: {
    gap: SPACING.s,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: SPACING.s,
  },
  heroSubtitle: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 22,
    textAlign: 'center',
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    marginBottom: SPACING.s,
    textAlign: 'center',
  },
  imdbButton: {
    backgroundColor: IMDB_BRAND_COLOR,
  },
  imdbButtonText: {
    color: COLORS.black,
    fontSize: FONT_SIZE.m,
    fontWeight: '800',
  },
  imdbHeroLogo: {
    height: 28,
    width: 54,
  },
  inlineNote: {
    alignItems: 'flex-start',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    flexDirection: 'row',
    gap: SPACING.s,
    padding: SPACING.m,
  },
  inlineNoteText: {
    color: COLORS.textSecondary,
    flex: 1,
    fontSize: FONT_SIZE.s,
    lineHeight: 18,
  },
  kindBadge: {
    backgroundColor: IMDB_BRAND_COLOR,
    borderRadius: BORDER_RADIUS.round,
    paddingHorizontal: SPACING.s,
    paddingVertical: 4,
  },
  kindBadgeText: {
    color: COLORS.black,
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
  },
  metaLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  metaPill: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.l,
    flexGrow: 1,
    gap: 2,
    minWidth: 96,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
  },
  metaValue: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '700',
  },
  privacyNote: {
    alignItems: 'flex-start',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.l,
    flexDirection: 'row',
    gap: SPACING.s,
    padding: SPACING.m,
  },
  privacyNoteText: {
    color: COLORS.textSecondary,
    flex: 1,
    fontSize: FONT_SIZE.s,
    lineHeight: 18,
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
  scrollContent: {
    gap: SPACING.l,
    padding: SPACING.l,
    paddingBottom: SPACING.xxl,
  },
  sectionLabel: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  showSeekIcon: {
    height: 92,
    width: 92,
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
  startButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.s,
    justifyContent: 'center',
  },
  startButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '800',
  },
  syncIconsContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: SPACING.l,
  },
  warningPanel: {
    backgroundColor: hexToRGBA(COLORS.warning, 0.14),
    borderRadius: BORDER_RADIUS.l,
    gap: SPACING.xs,
    padding: SPACING.m,
  },
  warningText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
  },
  warningTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '700',
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.l,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: SPACING.m,
    width: '100%',
  },
});
