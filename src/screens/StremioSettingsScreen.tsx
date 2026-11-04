import {
  type StremioBusyAction,
  StremioSetupGuide,
} from '@/src/components/stremio/StremioSetupGuide';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { markStremioConnected, useStremioConnection } from '@/src/hooks/useStremioConnection';
import {
  StremioAccountRequiredError,
  stremioAddonService,
  StremioRateLimitedError,
} from '@/src/services/StremioAddonService';
import { screenStyles } from '@/src/styles/screenStyles';
import { ArrowLeft01Icon, InformationCircleIcon } from '@hugeicons/core-free-icons';
import { formatDistanceToNow } from 'date-fns';
import { enUS, es, fr, pt, ptBR, tr } from 'date-fns/locale';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const { user } = useAuth();
  const uid = user && !user.isAnonymous ? user.uid : null;
  const { isConnected, refresh } = useStremioConnection({ enabled: false });
  const toastRef = useRef<ToastRef>(null);

  const [isChecking, setIsChecking] = useState(true);
  const [busyAction, setBusyAction] = useState<StremioBusyAction>(null);
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

  const hasActiveLink = installUrl !== null || isConnected === true;

  // Pushed on top of this screen, so an unsaved install link survives the round trip.
  const openHowItWorks = useCallback(() => {
    router.push('/(tabs)/profile/stremio-how-it-works' as any);
  }, [router]);

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
      <HeaderIconButton
        onPress={openHowItWorks}
        accessibilityLabel={t('stremio.how.title')}
        testID="stremio-info-button"
      >
        <AppIcon icon={InformationCircleIcon} size={24} color={COLORS.white} />
      </HeaderIconButton>
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
          <Image
            source={require('@/assets/images/stremio.png')}
            contentFit="contain"
            style={styles.stremioLogo}
            testID="stremio-logo"
          />
          <Text style={styles.heroSubtitle}>{t('stremio.intro')}</Text>
          {hasActiveLink && (
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText} testID="stremio-status-active">
                {t('stremio.connected')}
              </Text>
            </View>
          )}
        </View>

        <StremioSetupGuide
          installUrl={installUrl}
          hasActiveLink={hasActiveLink}
          busyAction={busyAction}
          onCreatePress={handleCreatePress}
          onSharePress={handleShare}
          onCopyPress={handleCopy}
          onDisconnectPress={handleDisconnectPress}
        />
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
  stremioLogo: {
    width: 64,
    height: 64,
    marginBottom: SPACING.m,
  },
  heroSubtitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.m,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: `${COLORS.success}26`,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  statusText: {
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.success,
  },
});
