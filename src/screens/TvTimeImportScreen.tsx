import {
  CollapsibleCategory,
  CollapsibleFeatureItem,
} from '@/src/components/ui/CollapsibleCategory';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { PremiumBadge } from '@/src/components/ui/PremiumBadge';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { TVTIME_IMPORT_PROGRESS_ROUTE } from '@/src/constants/tvtimeImportRoutes';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import { useTvTimeImportFlow } from '@/src/context/TvTimeImportFlowContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { fingerprintOf, tvTimeImportService } from '@/src/services/TvTimeImportService';
import { screenStyles } from '@/src/styles/screenStyles';
import type { TvTimeExportFormat } from '@/src/utils/tvtimeImport/prepare';
import { getTvTimeParseErrorKey } from '@/src/utils/tvtimeImportError';
import {
  ArrowRight01Icon,
  Bookmark02Icon,
  Clock01Icon,
  File01Icon,
  InformationCircleIcon,
  StarIcon,
  TickDouble01Icon,
  Upload01Icon,
} from '@hugeicons/core-free-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
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

const FORMAT_LABEL_KEYS: Record<TvTimeExportFormat, string> = {
  extractor: 'tvtimeImport.formats.extractor',
  gdpr: 'tvtimeImport.formats.gdpr',
  liberator: 'tvtimeImport.formats.liberator',
  refract: 'tvtimeImport.formats.refract',
};

interface LimitState {
  /** Another import's cooldown is running and this device has no unfinished run to resume. */
  blockedUntil: number | null;
  /** Fingerprint of this device's unfinished run, if it got at least one chunk through. */
  unfinishedRunFingerprint: string | null;
}

export default function TvTimeImportScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const requireAccount = useAccountRequired();
  const { isLoading: isPremiumLoading, isPremium } = usePremium();
  const { accentColor } = useAccentColor();
  const { preparedImport, setPreparedImport } = useTvTimeImportFlow();
  const [isPicking, setIsPicking] = useState(false);
  const [limitState, setLimitState] = useState<LimitState>({
    blockedUntil: null,
    unfinishedRunFingerprint: null,
  });

  useEffect(() => {
    if (requireAccount()) {
      router.back();
    }
  }, [requireAccount, router]);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    void (async () => {
      try {
        const [limits, storedRun] = await Promise.all([
          tvTimeImportService.getLimitState(user.uid),
          tvTimeImportService.getStoredRun(user.uid),
        ]);
        if (cancelled) return;
        const resumable = storedRun !== null && storedRun.importId === limits.activeImportId;
        setLimitState({
          blockedUntil:
            !resumable && limits.nextAllowedImportAt && limits.nextAllowedImportAt > Date.now()
              ? limits.nextAllowedImportAt
              : null,
          unfinishedRunFingerprint:
            storedRun && storedRun.completed.length > 0 ? storedRun.fingerprint : null,
        });
      } catch (error) {
        // The server enforces the limit regardless; this is only an early hint.
        console.warn('[TvTimeImportScreen] Could not load import limits:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // Lift the cooldown notice as soon as it runs out.
  useEffect(() => {
    const until = limitState.blockedUntil;
    if (until === null) return;
    const timer = setTimeout(
      () => setLimitState((state) => ({ ...state, blockedUntil: null })),
      Math.max(0, until - Date.now())
    );
    return () => clearTimeout(timer);
  }, [limitState.blockedUntil]);

  // Hashes every chunk, so compute it once per picked export.
  const preparedFingerprint = useMemo(
    () => (preparedImport ? fingerprintOf(preparedImport) : null),
    [preparedImport]
  );

  const summary = preparedImport?.summary;
  const hasChunks = (preparedImport?.chunks.length ?? 0) > 0;
  const isBlocked = limitState.blockedUntil !== null;
  const canStart = hasChunks && !isPicking && !isBlocked;
  // Only the same export can resume; the run's progress is tied to its chunks.
  const isResuming =
    preparedFingerprint !== null && limitState.unfinishedRunFingerprint === preparedFingerprint;
  const skippedCount = Object.values(preparedImport?.stats.skipped ?? {}).reduce(
    (total, value) => total + (value ?? 0),
    0
  );

  const handlePickFiles = async () => {
    if (isPicking || isPremiumLoading) return;

    if (!isPremium) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/premium');
      return;
    }

    setIsPicking(true);
    try {
      const files = await tvTimeImportService.pickFiles();
      if (files.length === 0) return;
      setPreparedImport(tvTimeImportService.prepare(files));
    } catch (error) {
      console.error('[TvTimeImportScreen] Failed to read export:', error);
      setPreparedImport(null);
      Alert.alert(t('tvtimeImport.errors.parseTitle'), t(getTvTimeParseErrorKey(error)));
    } finally {
      setIsPicking(false);
    }
  };

  const handleStartImport = () => {
    if (!preparedImport || !canStart) return;
    router.push(TVTIME_IMPORT_PROGRESS_ROUTE);
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          <View style={styles.syncIconsContainer}>
            <Image
              source={require('@/assets/images/tvtime.png')}
              contentFit="cover"
              style={styles.tvTimeIcon}
              testID="tvtime-import-hero-icon"
            />
            <AppIcon
              icon={ArrowRight01Icon}
              size={24}
              color={COLORS.textSecondary}
              style={styles.arrowIcon}
            />
            <View style={styles.showSeekIconCircle}>
              <Image
                source={require('@/assets/images/icon.png')}
                contentFit="contain"
                style={styles.showSeekIcon}
              />
            </View>
          </View>
          <Text style={styles.heroTitle}>{t('tvtimeImport.title')}</Text>
        </View>

        {isBlocked ? (
          <View style={styles.warningPanel} testID="tvtime-import-cooldown">
            <AppIcon icon={Clock01Icon} size={18} color={COLORS.warning} />
            <Text style={styles.warningText}>
              {t('tvtimeImport.cooldownNotice', {
                time: new Date(limitState.blockedUntil!).toLocaleString(i18n.language),
              })}
            </Text>
          </View>
        ) : null}

        <StageCard description={t('tvtimeImport.selectStageBody')}>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: COLORS.surfaceLight }]}
              onPress={handlePickFiles}
              activeOpacity={ACTIVE_OPACITY}
              disabled={isPicking || isPremiumLoading}
              testID="tvtime-import-pick"
            >
              {isPicking ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <View style={styles.buttonContent}>
                  <AppIcon icon={File01Icon} size={18} color={COLORS.text} />
                  <Text style={styles.pickButtonText}>
                    {preparedImport ? t('tvtimeImport.replaceFile') : t('tvtimeImport.selectFile')}
                  </Text>
                  {!isPremium ? <PremiumBadge /> : null}
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.startButton,
                canStart ? { backgroundColor: accentColor } : styles.startButtonDisabled,
              ]}
              onPress={handleStartImport}
              activeOpacity={ACTIVE_OPACITY}
              disabled={!canStart}
              accessibilityState={{ disabled: !canStart }}
              testID="tvtime-import-start"
            >
              <AppIcon
                icon={Upload01Icon}
                size={18}
                color={canStart ? COLORS.white : COLORS.textSecondary}
              />
              <Text style={[styles.startButtonText, !canStart && styles.startButtonTextDisabled]}>
                {isResuming ? t('tvtimeImport.resumeImport') : t('tvtimeImport.startImport')}
              </Text>
            </TouchableOpacity>
          </View>

          {preparedImport && summary ? (
            <>
              <View style={styles.formatRow}>
                <Text style={styles.sectionLabel}>{t('tvtimeImport.detectedFormat')}</Text>
                <View style={[styles.formatBadge, { backgroundColor: accentColor }]}>
                  <Text style={styles.formatBadgeText}>
                    {t(FORMAT_LABEL_KEYS[preparedImport.format])}
                  </Text>
                </View>
              </View>
              <View style={styles.metaGrid}>
                <MetaPill label={t('tvtimeImport.meta.shows')} value={summary.shows} />
                <MetaPill label={t('tvtimeImport.meta.episodes')} value={summary.episodes} />
                <MetaPill label={t('tvtimeImport.meta.movies')} value={summary.movies} />
                <MetaPill label={t('tvtimeImport.meta.watchlist')} value={summary.watchlist} />
                <MetaPill label={t('tvtimeImport.meta.lists')} value={summary.lists} />
                <MetaPill label={t('tvtimeImport.meta.ratings')} value={summary.ratings} />
              </View>
              {skippedCount > 0 ? (
                <View style={styles.inlineNote}>
                  <AppIcon icon={InformationCircleIcon} size={16} color={COLORS.textSecondary} />
                  <Text style={styles.inlineNoteText}>
                    {t('tvtimeImport.skippedRowsNote', { count: skippedCount })}
                  </Text>
                </View>
              ) : null}
              <View style={styles.inlineNote}>
                <AppIcon icon={InformationCircleIcon} size={16} color={COLORS.textSecondary} />
                <Text style={styles.inlineNoteText}>
                  {isResuming ? t('tvtimeImport.resumeNote') : t('tvtimeImport.readyNote')}
                </Text>
              </View>
            </>
          ) : null}
        </StageCard>

        <View style={{ gap: 1 }}>
          <CollapsibleCategory
            title={t('tvtimeImport.whichFileTitle')}
            defaultExpanded={!preparedImport}
          >
            <CollapsibleFeatureItem
              text={t('tvtimeImport.formats.gdpr')}
              description={t('tvtimeImport.formatHelp.gdpr')}
              icon={File01Icon}
            />
            <CollapsibleFeatureItem
              text={t('tvtimeImport.formats.refract')}
              description={t('tvtimeImport.formatHelp.refract')}
              icon={File01Icon}
            />
            <CollapsibleFeatureItem
              text={t('tvtimeImport.formats.liberator')}
              description={t('tvtimeImport.formatHelp.liberator')}
              icon={File01Icon}
            />
            <CollapsibleFeatureItem
              text={t('tvtimeImport.formats.extractor')}
              description={t('tvtimeImport.formatHelp.extractor')}
              icon={File01Icon}
            />
          </CollapsibleCategory>

          <CollapsibleCategory title={t('tvtimeImport.whatWillBeImportedTitle')}>
            <CollapsibleFeatureItem
              text={t('tvtimeImport.features.historyTitle')}
              description={t('tvtimeImport.features.historyDescription')}
              icon={TickDouble01Icon}
            />
            <CollapsibleFeatureItem
              text={t('tvtimeImport.features.listsTitle')}
              description={t('tvtimeImport.features.listsDescription')}
              icon={Bookmark02Icon}
            />
            <CollapsibleFeatureItem
              text={t('tvtimeImport.features.ratingsTitle')}
              description={t('tvtimeImport.features.ratingsDescription')}
              icon={StarIcon}
            />
            <CollapsibleFeatureItem
              text={t('tvtimeImport.features.safeTitle')}
              description={t('tvtimeImport.features.safeDescription')}
              icon={InformationCircleIcon}
            />
          </CollapsibleCategory>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StageCard({ children, description }: { children: React.ReactNode; description: string }) {
  return (
    <View style={styles.stageCard}>
      <Text style={styles.stageDescription}>{description}</Text>
      <View style={styles.stageContent}>{children}</View>
    </View>
  );
}

function MetaPill({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metaPill}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value.toLocaleString()}</Text>
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
  buttonContent: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
    justifyContent: 'center',
  },
  formatBadge: {
    borderRadius: BORDER_RADIUS.round,
    paddingHorizontal: SPACING.s,
    paddingVertical: 4,
  },
  formatBadgeText: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
  },
  formatRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.s,
    justifyContent: 'space-between',
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: SPACING.s,
  },
  heroTitle: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xl,
    textAlign: 'center',
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
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
  },
  metaLabel: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.xs,
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
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.s,
  },
  pickButtonText: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
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
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.s,
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
  // No flexWrap here: a wrapping row pins its line to the top of the 52px
  // minimum height, which left empty space under the label.
  startButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACING.s,
    justifyContent: 'center',
  },
  // Dimmed so it can't be mistaken for the Select file button above it.
  startButtonDisabled: {
    backgroundColor: COLORS.surfaceLight,
    opacity: 0.5,
  },
  startButtonText: {
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
  },
  startButtonTextDisabled: {
    color: COLORS.textSecondary,
  },
  tvTimeIcon: {
    borderRadius: 16,
    height: 70,
    width: 70,
  },
  syncIconsContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: SPACING.l,
  },
  warningPanel: {
    alignItems: 'flex-start',
    backgroundColor: hexToRGBA(COLORS.warning, 0.14),
    borderRadius: BORDER_RADIUS.l,
    flexDirection: 'row',
    gap: SPACING.s,
    padding: SPACING.m,
  },
  warningText: {
    color: COLORS.text,
    flex: 1,
    fontSize: FONT_SIZE.s,
    lineHeight: 18,
  },
});
