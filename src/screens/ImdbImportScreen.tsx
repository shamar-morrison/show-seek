import type { ImdbImportFileKind } from '@/functions/src/shared/imdbImport';
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
import { IMDB_IMPORT_PROGRESS_ROUTE } from '@/src/constants/imdbImportRoutes';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useImdbImportFlow } from '@/src/context/ImdbImportFlowContext';
import { usePremium } from '@/src/context/PremiumContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { imdbImportService } from '@/src/services/ImdbImportService';
import { screenStyles } from '@/src/styles/screenStyles';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ArrowRight, Info, Upload } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
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

export default function ImdbImportScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const requireAccount = useAccountRequired();
  const { isLoading: isPremiumLoading, isPremium } = usePremium();
  const { accentColor } = useAccentColor();
  const { preparedImport, setPreparedImport } = useImdbImportFlow();
  const [isPickingFiles, setIsPickingFiles] = useState(false);

  useEffect(() => {
    if (requireAccount()) {
      router.back();
    }
  }, [requireAccount, router]);

  const supportedRowCount = preparedImport?.stats.processedActions ?? 0;
  const selectedFileCount =
    (preparedImport?.files.length ?? 0) + (preparedImport?.unsupportedFiles.length ?? 0);
  const selectedChunkCount = preparedImport?.chunks.length ?? 0;
  const hasImportableChunks = selectedChunkCount > 0;

  const handlePickFiles = async () => {
    if (isPickingFiles || isPremiumLoading) {
      return;
    }

    if (!isPremium) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/premium');
      return;
    }

    setIsPickingFiles(true);
    try {
      const rawFiles = await imdbImportService.pickRawFiles();
      if (rawFiles.length === 0) {
        return;
      }

      setPreparedImport(imdbImportService.prepareFiles(rawFiles));
    } catch (error) {
      console.error('[ImdbImportScreen] Failed to pick files:', error);
      Alert.alert(t('common.errorTitle'), t('imdbImport.errors.pickFailed'));
    } finally {
      setIsPickingFiles(false);
    }
  };

  const handleStartImport = () => {
    if (!preparedImport) {
      return;
    }

    if (preparedImport.chunks.length === 0) {
      Alert.alert(t('imdbImport.nothingToImportTitle'), t('imdbImport.nothingToImportMessage'));
      return;
    }

    router.push(IMDB_IMPORT_PROGRESS_ROUTE);
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          <View style={styles.syncIconsContainer}>
            <View>
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
              disabled={isPickingFiles || isPremiumLoading}
            >
              {isPickingFiles ? (
                <ActivityIndicator color={COLORS.black} />
              ) : (
                <View style={styles.imdbButtonContent}>
                  <Text style={styles.imdbButtonText}>
                    {preparedImport ? t('imdbImport.replaceFiles') : t('imdbImport.selectFiles')}
                  </Text>
                  {!isPremium ? <PremiumBadge /> : null}
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.startButton,
                {
                  backgroundColor:
                    hasImportableChunks && !isPickingFiles ? accentColor : COLORS.surfaceLight,
                },
              ]}
              onPress={handleStartImport}
              activeOpacity={ACTIVE_OPACITY}
              disabled={!hasImportableChunks || isPickingFiles}
            >
              <Upload size={18} color={COLORS.white} />
              <Text style={styles.startButtonText}>{t('imdbImport.startImport')}</Text>
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

        {preparedImport && hasImportableChunks ? (
          <StageCard title={t('imdbImport.readyTitle')} description={t('imdbImport.readyBody')}>
            <View style={styles.inlineNote}>
              <Info size={16} color={COLORS.textSecondary} />
              <Text style={styles.inlineNoteText}>{t('imdbImport.readyNote')}</Text>
            </View>
          </StageCard>
        ) : null}

        {preparedImport && !hasImportableChunks ? (
          <StageCard
            title={t('imdbImport.nothingToImportTitle')}
            description={t('imdbImport.nothingToImportMessage')}
          >
            {null}
          </StageCard>
        ) : null}

        <View style={{ gap: 1 }}>
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
        </View>
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

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'column',
    gap: SPACING.s,
  },
  arrowIcon: {
    marginHorizontal: SPACING.s,
    marginLeft: SPACING.l,
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
  imdbButtonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
    justifyContent: 'center',
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
  primaryButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.l,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: SPACING.m,
    width: '100%',
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
});
