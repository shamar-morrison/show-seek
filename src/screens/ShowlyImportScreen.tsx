import { formatDateTime } from '@/src/utils/timeFormat';
import {
  CollapsibleCategory,
  CollapsibleFeatureItem,
} from '@/src/components/ui/CollapsibleCategory';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { PremiumBadge } from '@/src/components/ui/PremiumBadge';
import { SHOWLY_IMPORT_PROGRESS_ROUTE } from '@/src/constants/showlyImportRoutes';
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
import { useShowlyImportFlow } from '@/src/context/ShowlyImportFlowContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { fingerprintOf, showlyImportService } from '@/src/services/ShowlyImportService';
import { screenStyles } from '@/src/styles/screenStyles';
import { getShowlyParseErrorKey } from '@/src/utils/showlyImportError';
import {
  ArrowRight02Icon,
  Bookmark02Icon,
  Clock01Icon,
  Download01Icon,
  File01Icon,
  InformationCircleIcon,
  Settings02Icon,
  SmartPhone01Icon,
  StarIcon,
  TickDouble01Icon,
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

export default function ShowlyImportScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const requireAccount = useAccountRequired();
  const { isLoading: isPremiumLoading, isPremium } = usePremium();
  const { accentColor } = useAccentColor();
  const { preparedImport, setPreparedImport } = useShowlyImportFlow();
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
            showlyImportService.getLimitState(user.uid),
            showlyImportService.getStoredRun(user.uid),
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
          console.warn('[ShowlyImportScreen] Could not load import limits:', error);
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
  // Things Showly has that ShowSeek can't store (duplicates aren't worth mentioning).
  const notImportedCount = Object.entries(preparedImport?.stats.ignored ?? {}).reduce(
    (total, [key, value]) => (key === 'duplicate_plays' ? total : total + (value ?? 0)),
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
      const files = await showlyImportService.pickFiles();
      if (files.length === 0) return;
      setPreparedImport(showlyImportService.prepare(files));
    } catch (error) {
      console.error('[ShowlyImportScreen] Failed to read backup:', error);
      setPreparedImport(null);
      Alert.alert(t('showlyImport.errors.parseTitle'), t(getShowlyParseErrorKey(error)));
    } finally {
      setIsPicking(false);
    }
  };

  const handleStartImport = () => {
    if (!preparedImport || !canStart) return;
    router.push(SHOWLY_IMPORT_PROGRESS_ROUTE);
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          <View style={styles.syncIconsContainer}>
            <Image
              source={require('@/assets/images/showly.png')}
              contentFit="cover"
              style={styles.showlyIcon}
              testID="showly-import-hero-icon"
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
          <Text style={styles.heroTitle}>{t('showlyImport.title')}</Text>
        </View>

        {isBlocked ? (
          <View style={styles.warningPanel} testID="showly-import-cooldown">
            <AppIcon icon={Clock01Icon} size={18} color={COLORS.warning} />
            <Text style={styles.warningText}>
              {t('showlyImport.cooldownNotice', {
                time: formatDateTime(limitState.blockedUntil!, i18n.language),
              })}
            </Text>
          </View>
        ) : null}

        <StageCard description={t('showlyImport.selectStageBody')}>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: COLORS.surfaceLight }]}
              onPress={handlePickFiles}
              activeOpacity={ACTIVE_OPACITY}
              disabled={isPicking || isPremiumLoading}
              testID="showly-import-pick"
            >
              {isPicking ? (
                <ActivityIndicator color={COLORS.text} />
              ) : (
                <View style={styles.buttonContent}>
                  <AppIcon icon={File01Icon} size={18} color={COLORS.text} />
                  <Text style={styles.pickButtonText}>
                    {preparedImport ? t('showlyImport.replaceFile') : t('showlyImport.selectFile')}
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
              testID="showly-import-start"
            >
              <AppIcon
                icon={Upload01Icon}
                size={18}
                color={canStart ? COLORS.white : COLORS.textSecondary}
              />
              <Text style={[styles.startButtonText, !canStart && styles.startButtonTextDisabled]}>
                {isResuming ? t('showlyImport.resumeImport') : t('showlyImport.startImport')}
              </Text>
            </TouchableOpacity>
          </View>

          {preparedImport && summary ? (
            <>
              <View style={styles.metaGrid} testID="showly-import-summary">
                <MetaPill label={t('showlyImport.meta.myShows')} value={summary.following} />
                <MetaPill label={t('showlyImport.meta.episodes')} value={summary.episodes} />
                <MetaPill label={t('showlyImport.meta.movies')} value={summary.watchedMovies} />
                <MetaPill
                  label={t('showlyImport.meta.watchlist')}
                  value={summary.showWatchlist + summary.movieWatchlist}
                />
                <MetaPill label={t('showlyImport.meta.hidden')} value={summary.dropped} />
                <MetaPill label={t('showlyImport.meta.ratings')} value={summary.ratings} />
                <MetaPill label={t('showlyImport.meta.lists')} value={summary.customLists} />
              </View>
              {notImportedCount > 0 ? (
                <View style={styles.inlineNote}>
                  <AppIcon icon={InformationCircleIcon} size={16} color={COLORS.textSecondary} />
                  <Text style={styles.inlineNoteText}>
                    {t('showlyImport.notImportedNote', { count: notImportedCount })}
                  </Text>
                </View>
              ) : null}
              {summary.emptyLists > 0 ? (
                <View style={styles.inlineNote}>
                  <AppIcon icon={Bookmark02Icon} size={16} color={COLORS.textSecondary} />
                  <Text style={styles.inlineNoteText}>
                    {t('showlyImport.emptyListsNote', { count: summary.emptyLists })}
                  </Text>
                </View>
              ) : null}
              {skippedCount > 0 ? (
                <View style={styles.inlineNote}>
                  <AppIcon icon={InformationCircleIcon} size={16} color={COLORS.textSecondary} />
                  <Text style={styles.inlineNoteText}>
                    {t('showlyImport.skippedRowsNote', { count: skippedCount })}
                  </Text>
                </View>
              ) : null}
              <View style={styles.inlineNote}>
                <AppIcon icon={InformationCircleIcon} size={16} color={COLORS.textSecondary} />
                <Text style={styles.inlineNoteText}>
                  {isResuming ? t('showlyImport.resumeNote') : t('showlyImport.readyNote')}
                </Text>
              </View>
            </>
          ) : null}
        </StageCard>

        <View style={{ gap: 1 }}>
          <CollapsibleCategory
            title={t('showlyImport.howToTitle')}
            defaultExpanded={!preparedImport}
            testID="showly-import-how-to"
          >
            <CollapsibleFeatureItem
              text={t('showlyImport.howTo.openTitle')}
              description={t('showlyImport.howTo.openDescription')}
              icon={SmartPhone01Icon}
            />
            <CollapsibleFeatureItem
              text={t('showlyImport.howTo.exportTitle')}
              description={t('showlyImport.howTo.exportDescription')}
              icon={Settings02Icon}
            />
            <CollapsibleFeatureItem
              text={t('showlyImport.howTo.saveTitle')}
              description={t('showlyImport.howTo.saveDescription')}
              icon={Download01Icon}
            />
            <CollapsibleFeatureItem
              text={t('showlyImport.howTo.chooseTitle')}
              description={t('showlyImport.howTo.chooseDescription')}
              icon={File01Icon}
            />
          </CollapsibleCategory>

          <CollapsibleCategory title={t('showlyImport.whatWillBeImportedTitle')}>
            <CollapsibleFeatureItem
              text={t('showlyImport.features.historyTitle')}
              description={t('showlyImport.features.historyDescription')}
              icon={TickDouble01Icon}
            />
            <CollapsibleFeatureItem
              text={t('showlyImport.features.listsTitle')}
              description={t('showlyImport.features.listsDescription')}
              icon={Bookmark02Icon}
            />
            <CollapsibleFeatureItem
              text={t('showlyImport.features.ratingsTitle')}
              description={t('showlyImport.features.ratingsDescription')}
              icon={StarIcon}
            />
            <CollapsibleFeatureItem
              text={t('showlyImport.features.safeTitle')}
              description={t('showlyImport.features.safeDescription')}
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
  showlyIcon: {
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
