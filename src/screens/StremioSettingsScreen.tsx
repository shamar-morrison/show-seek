import { AppIcon } from '@/src/components/ui/AppIcon';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
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
import { markStremioConnected, useStremioConnection } from '@/src/hooks/useStremioConnection';
import {
  StremioAccountRequiredError,
  stremioAddonService,
  StremioRateLimitedError,
} from '@/src/services/StremioAddonService';
import { screenStyles } from '@/src/styles/screenStyles';
import {
  ArrowLeft01Icon,
  Copy01Icon,
  InformationCircleIcon,
  Link02Icon,
  PlayCircle02Icon,
  Share02Icon,
  Unlink01Icon,
} from '@hugeicons/core-free-icons';
import { formatDistanceToNow } from 'date-fns';
import { enUS, es, fr, pt, ptBR, tr } from 'date-fns/locale';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type BusyAction = 'create' | 'revoke' | null;

const getDistanceLocale = (language: string) => {
  if (language.startsWith('es')) return es;
  if (language.startsWith('fr')) return fr;
  if (language === 'pt-BR') return ptBR;
  if (language.startsWith('pt')) return pt;
  if (language.startsWith('tr')) return tr;
  return enUS;
};

/**
 * Create, share and revoke the personal Stremio addon install link.
 * The link is returned once by the server and lives only in this screen's state:
 * it is never logged or persisted, and it is gone once the screen unmounts.
 */
export default function StremioSettingsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { accentColor } = useAccentColor();
  const { user } = useAuth();
  const uid = user && !user.isAnonymous ? user.uid : null;
  const { isConnected, refresh } = useStremioConnection({ enabled: false });
  const toastRef = useRef<ToastRef>(null);

  const [isChecking, setIsChecking] = useState(true);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    void refresh().finally(() => {
      if (isActive) setIsChecking(false);
    });
    return () => {
      isActive = false;
    };
  }, [refresh]);

  const showError = useCallback(
    (error: unknown) => {
      if (error instanceof StremioRateLimitedError && error.nextAllowedAt) {
        const time = formatDistanceToNow(new Date(error.nextAllowedAt), {
          addSuffix: true,
          locale: getDistanceLocale(i18n.language),
        });
        Alert.alert(t('stremio.errorTitle'), t('stremio.rateLimited', { time }));
        return;
      }
      if (error instanceof StremioAccountRequiredError) {
        Alert.alert(t('stremio.errorTitle'), t('guestAccess.body'));
        return;
      }
      Alert.alert(t('stremio.errorTitle'), t('stremio.errorMessage'));
    },
    [i18n.language, t]
  );

  const createLink = useCallback(async () => {
    if (!uid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusyAction('create');
    try {
      const url = await stremioAddonService.createInstallLink();
      setInstallUrl(url);
      markStremioConnected(uid, true);
    } catch (error) {
      showError(error);
    } finally {
      setBusyAction(null);
    }
  }, [showError, uid]);

  const handleCreatePress = useCallback(() => {
    // An unknown state may hide an active link, so confirm the replacement too.
    if (isConnected === false && !installUrl) {
      void createLink();
      return;
    }
    Alert.alert(t('stremio.replaceTitle'), t('stremio.replaceMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('stremio.createNewLink'), onPress: () => void createLink() },
    ]);
  }, [createLink, installUrl, isConnected, t]);

  const handleDisconnectPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(t('stremio.disconnectTitle'), t('stremio.disconnectMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('stremio.disconnect'),
        style: 'destructive',
        onPress: async () => {
          if (!uid) return;
          setBusyAction('revoke');
          try {
            await stremioAddonService.revokeLink();
            setInstallUrl(null);
            markStremioConnected(uid, false);
          } catch (error) {
            showError(error);
          } finally {
            setBusyAction(null);
          }
        },
      },
    ]);
  }, [showError, t, uid]);

  const handleShare = useCallback(async () => {
    if (!installUrl) return;
    try {
      await Share.share({ message: installUrl });
    } catch {
      Alert.alert(t('stremio.errorTitle'), t('stremio.errorMessage'));
    }
  }, [installUrl, t]);

  const handleCopy = useCallback(async () => {
    if (!installUrl) return;
    try {
      await Clipboard.setStringAsync(installUrl);
      toastRef.current?.show(t('stremio.copied'));
    } catch {
      Alert.alert(t('stremio.errorTitle'), t('stremio.errorMessage'));
    }
  }, [installUrl, t]);

  const isBusy = busyAction !== null;
  const hasActiveLink = installUrl !== null || isConnected === true;

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => router.back()}
        activeOpacity={ACTIVE_OPACITY}
        style={styles.backButton}
        testID="stremio-back-button"
      >
        <AppIcon icon={ArrowLeft01Icon} size={24} color={COLORS.white} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{t('stremio.header')}</Text>
    </View>
  );

  if (isChecking) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
        {header}
        <FullScreenLoading />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
      {header}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.heroSection}>
          <View style={[styles.iconCircle, { backgroundColor: hexToRGBA(accentColor, 0.15) }]}>
            <AppIcon icon={PlayCircle02Icon} size={36} color={accentColor} />
          </View>
          <Text style={styles.heroSubtitle}>{t('stremio.intro')}</Text>
          {hasActiveLink && (
            <Text style={styles.statusText} testID="stremio-status-active">
              {t('stremio.connected')}
            </Text>
          )}
        </View>

        {installUrl ? (
          <View testID="stremio-link-section">
            <View style={styles.linkBox}>
              <Text selectable style={styles.linkText} testID="stremio-install-url">
                {installUrl}
              </Text>
            </View>
            <Text style={styles.warningText}>{t('stremio.shownOnce')}</Text>
            <Text style={styles.warningText}>{t('stremio.private')}</Text>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: accentColor }]}
              onPress={handleShare}
              activeOpacity={ACTIVE_OPACITY}
              disabled={isBusy}
              testID="stremio-share-button"
            >
              <AppIcon icon={Share02Icon} size={20} color={COLORS.white} />
              <Text style={styles.primaryButtonText}>{t('stremio.share')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleCopy}
              activeOpacity={ACTIVE_OPACITY}
              disabled={isBusy}
              testID="stremio-copy-button"
            >
              <AppIcon icon={Copy01Icon} size={18} color={COLORS.text} />
              <Text style={styles.secondaryButtonText}>{t('stremio.copy')}</Text>
            </TouchableOpacity>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('stremio.stepsTitle')}</Text>
              {(['step1', 'step2', 'step3'] as const).map((step, index) => (
                <Text key={step} style={styles.cardText}>
                  {`${index + 1}. ${t(`stremio.${step}`)}`}
                </Text>
              ))}
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: accentColor }]}
            onPress={handleCreatePress}
            activeOpacity={ACTIVE_OPACITY}
            disabled={isBusy}
            testID={hasActiveLink ? 'stremio-create-new-button' : 'stremio-create-button'}
          >
            {busyAction === 'create' ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <AppIcon icon={Link02Icon} size={20} color={COLORS.white} />
                <Text style={styles.primaryButtonText}>
                  {hasActiveLink ? t('stremio.createNewLink') : t('stremio.createLink')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        <View style={styles.card}>
          {(['whatSyncs', 'platforms', 'animeNote'] as const).map((key) => (
            <View key={key} style={styles.noteRow}>
              <AppIcon icon={InformationCircleIcon} size={16} color={COLORS.textSecondary} />
              <Text style={styles.noteText}>{t(`stremio.${key}`)}</Text>
            </View>
          ))}
        </View>

        {hasActiveLink && (
          <TouchableOpacity
            style={styles.disconnectButton}
            onPress={handleDisconnectPress}
            activeOpacity={ACTIVE_OPACITY}
            disabled={isBusy}
            testID="stremio-disconnect-button"
          >
            {busyAction === 'revoke' ? (
              <ActivityIndicator color={COLORS.error} />
            ) : (
              <>
                <AppIcon icon={Unlink01Icon} size={18} color={COLORS.error} />
                <Text style={styles.disconnectButtonText}>{t('stremio.disconnect')}</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
      <Toast ref={toastRef} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
    gap: SPACING.m,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZE.l,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.l,
    paddingBottom: SPACING.xxl,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.m,
  },
  heroSubtitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  statusText: {
    marginTop: SPACING.s,
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.success,
  },
  linkBox: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    padding: SPACING.m,
    marginBottom: SPACING.s,
  },
  linkText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.text,
  },
  warningText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.l,
    gap: SPACING.s,
    marginTop: SPACING.m,
    marginBottom: SPACING.s,
  },
  primaryButtonText: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    gap: SPACING.s,
  },
  secondaryButtonText: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.medium,
    color: COLORS.text,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.m,
    marginTop: SPACING.l,
    gap: SPACING.s,
  },
  cardTitle: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
  },
  cardText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.s,
  },
  noteText: {
    flex: 1,
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.m,
    gap: SPACING.s,
    marginTop: SPACING.l,
  },
  disconnectButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.error,
    fontFamily: FONT_FAMILY.medium,
  },
});
