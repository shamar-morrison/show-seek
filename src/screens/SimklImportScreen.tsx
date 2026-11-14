import { formatDateTime } from '@/src/utils/timeFormat';
import {
  CollapsibleCategory,
  CollapsibleFeatureItem,
} from '@/src/components/ui/CollapsibleCategory';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { PremiumBadge } from '@/src/components/ui/PremiumBadge';
import { SIMKL_BACKUP_URL, SIMKL_IMPORT_PROGRESS_ROUTE } from '@/src/constants/simklImportRoutes';
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
import { usePremium } from '@/src/context/PremiumContext';
import { useSimklImportFlow } from '@/src/context/SimklImportFlowContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { fingerprintOf, simklImportService } from '@/src/services/SimklImportService';
import { screenStyles } from '@/src/styles/screenStyles';
import { getSimklParseErrorKey } from '@/src/utils/simklImportError';
import {
  ArrowRight02Icon,
  Bookmark02Icon,
  Clock01Icon,
  ComputerIcon,
  Download01Icon,
  File01Icon,
  Globe02Icon,
  InformationCircleIcon,
  StarIcon,
  TickDouble01Icon,
  Tv01Icon,
  Upload01Icon,
} from '@hugeicons/core-free-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface LimitState {
  /** Another import's cooldown is running and this device has no unfinished run to resume. */
  blockedUntil: number | null;
  /** Fingerprint of this device's unfinished run, if it got at least one chunk through. */
  unfinishedRunFingerprint: string | null;
}

export default function SimklImportScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const requireAccount = useAccountRequired();
  const { isLoading: isPremiumLoading, isPremium } = usePremium();
  const { accentColor } = useAccentColor();
  const { preparedImport, setPreparedImport } = useSimklImportFlow();
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

  // On every focus, not just mount: coming back from a finished or refused run must
  // show the new cooldown and resumable state.
  useFocusEffect(
    useCallback(() => {
      if (!user?.uid) return;
      let cancelled = false;

      void (async () => {
        try {
          const [limits, storedRun] = await Promise.all([
            simklImportService.getLimitState(user.uid),
            simklImportService.getStoredRun(user.uid),
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
          console.warn('[SimklImportScreen] Could not load import limits:', error);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [user?.uid])
  );

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

  // Hashes every chunk, so compute it once per picked backup.
  const preparedFingerprint = useMemo(
    () => (preparedImport ? fingerprintOf(preparedImport) : null),
    [preparedImport]
  );

  const summary = preparedImport?.summary;
  const hasChunks = (preparedImport?.chunks.length ?? 0) > 0;
  const isBlocked = limitState.blockedUntil !== null;
  const canStart = hasChunks && !isPicking && !isBlocked;
  // Only the same backup can resume; the run's progress is tied to its chunks.
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
      const files = await simklImportService.pickFiles();
      if (files.length === 0) return;
      setPreparedImport(simklImportService.prepare(files));
    } catch (error) {
      console.error('[SimklImportScreen] Failed to read backup:', error);
      setPreparedImport(null);
      Alert.alert(t('simklImport.errors.parseTitle'), t(getSimklParseErrorKey(error)));
    } finally {
      setIsPicking(false);
    }
  };

  const handleStartImport = () => {
    if (!preparedImport || !canStart) return;
    router.push(SIMKL_IMPORT_PROGRESS_ROUTE);
  };

  const handleOpenSimkl = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Linking.openURL(SIMKL_BACKUP_URL);
    } catch (error) {
      console.error('[SimklImportScreen] Could not open Simkl:', error);
    }
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          <View style={styles.syncIconsContainer}>
            <Image
              source={require('@/assets/images/simkl.png')}
              contentFit="cover"
              style={styles.simklIcon}
              testID="simkl-import-hero-icon"
            />
            <AppIcon
              icon={ArrowRight02Icon}
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
          <Text style={styles.heroTitle}>{t('simklImport.title')}</Text>
        </View>

        {isBlocked ? (
          <View style={styles.warningPanel} testID="simkl-import-cooldown">
            <AppIcon icon={Clock01Icon} size={18} color={COLORS.warning} />
            <Text style={styles.warningText}>
              {t('simklImport.cooldownNotice', {
                time: formatDateTime(limitState.blockedUntil!, i18n.language),
              })}
            </Text>
          </View>
        ) : null}

        <StageCard description={t('simklImport.selectStageBody')}>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: COLORS.surfaceLight }]}
              onPress={handlePickFiles}
              activeOpacity={ACTIVE_OPACITY}
              disabled={isPicking || isPremiumLoading}
              testID="simkl-import-pick"
            >
              {isPicking ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <View style={styles.buttonContent}>
                  <AppIcon icon={File01Icon} size={18} color={COLORS.text} />
                  <Text style={styles.pickButtonText}>
                    {preparedImport ? t('simklImport.replaceFile') : t('simklImport.selectFile')}
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
              testID="simkl-import-start"
            >
              <AppIcon
                icon={Upload01Icon}
                size={18}
                color={canStart ? COLORS.white : COLORS.textSecondary}
              />
              <Text style={[styles.startButtonText, !canStart && styles.startButtonTextDisabled]}>
                {isResuming ? t('simklImport.resumeImport') : t('simklImport.startImport')}
              </Text>
            </TouchableOpacity>
          </View>

          {preparedImport && summary ? (
            <>
              <View style={styles.metaGrid} testID="simkl-import-summary">
                <MetaPill
                  label={t('simklImport.meta.shows')}
                  value={summary.shows - summary.anime}
                />
                <MetaPill label={t('simklImport.meta.anime')} value={summary.anime} />
                <MetaPill label={t('simklImport.meta.episodes')} value={summary.episodes} />
                <MetaPill label={t('simklImport.meta.movies')} value={summary.movies} />
                <MetaPill label={t('simklImport.meta.watchlist')} value={summary.watchlist} />
                <MetaPill label={t('simklImport.meta.ratings')} value={summary.ratings} />
              </View>
              {summary.summaryOnlyShows > 0 ? (
                <View style={styles.inlineNote}>
                  <AppIcon icon={TickDouble01Icon} size={16} color={COLORS.textSecondary} />
                  <Text style={styles.inlineNoteText}>
                    {t('simklImport.summaryOnlyNote', { count: summary.summaryOnlyShows })}
                  </Text>
                </View>
              ) : null}
              {skippedCount > 0 ? (
                <View style={styles.inlineNote}>
                  <AppIcon icon={InformationCircleIcon} size={16} color={COLORS.textSecondary} />
                  <Text style={styles.inlineNoteText}>
                    {t('simklImport.skippedRowsNote', { count: skippedCount })}
                  </Text>
                </View>
              ) : null}
              <View style={styles.inlineNote}>
                <AppIcon icon={InformationCircleIcon} size={16} color={COLORS.textSecondary} />
                <Text style={styles.inlineNoteText}>
                  {isResuming ? t('simklImport.resumeNote') : t('simklImport.readyNote')}
                </Text>
              </View>
            </>
          ) : null}
        </StageCard>

        <View style={{ gap: 1 }}>
          <CollapsibleCategory
            title={t('simklImport.howToTitle')}
            defaultExpanded={!preparedImport}
            testID="simkl-import-how-to"
          >
            <CollapsibleFeatureItem
              text={t('simklImport.howTo.computerTitle')}
              description={t('simklImport.howTo.computerDescription')}
              icon={ComputerIcon}
            />
            <CollapsibleFeatureItem
              text={t('simklImport.howTo.exportTitle')}
              description={t('simklImport.howTo.exportDescription')}
              icon={Globe02Icon}
            />
            <CollapsibleFeatureItem
              text={t('simklImport.howTo.downloadTitle')}
              description={t('simklImport.howTo.downloadDescription')}
              icon={Download01Icon}
            />
            <CollapsibleFeatureItem
              text={t('simklImport.howTo.chooseTitle')}
              description={t('simklImport.howTo.chooseDescription')}
              icon={File01Icon}
            />
            <TouchableOpacity
              style={[styles.linkButton, { borderColor: accentColor }]}
              onPress={() => void handleOpenSimkl()}
              activeOpacity={ACTIVE_OPACITY}
              testID="simkl-import-open-simkl"
            >
              <AppIcon icon={Globe02Icon} size={18} color={accentColor} />
              <Text style={[styles.linkButtonText, { color: accentColor }]}>
                {t('simklImport.openSimkl')}
              </Text>
            </TouchableOpacity>
          </CollapsibleCategory>

          <CollapsibleCategory title={t('simklImport.whatWillBeImportedTitle')}>
            <CollapsibleFeatureItem
              text={t('simklImport.features.historyTitle')}
              description={t('simklImport.features.historyDescription')}
              icon={TickDouble01Icon}
            />
            <CollapsibleFeatureItem
              text={t('simklImport.features.listsTitle')}
              description={t('simklImport.features.listsDescription')}
              icon={Bookmark02Icon}
            />
            <CollapsibleFeatureItem
              text={t('simklImport.features.ratingsTitle')}
              description={t('simklImport.features.ratingsDescription')}
              icon={StarIcon}
            />
            <CollapsibleFeatureItem
              text={t('simklImport.features.animeTitle')}
              description={t('simklImport.features.animeDescription')}
              icon={Tv01Icon}
            />
            <CollapsibleFeatureItem
              text={t('simklImport.features.safeTitle')}
              description={t('simklImport.features.safeDescription')}
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
  linkButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACING.s,
    justifyContent: 'center',
    marginTop: SPACING.s,
    minHeight: 44,
    paddingHorizontal: SPACING.m,
  },
  linkButtonText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.m,
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
    flexShrink: 1, // wrap within its row instead of pushing siblings off
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
  simklIcon: {
    borderRadius: 12,
    height: 52,
    width: 52,
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
