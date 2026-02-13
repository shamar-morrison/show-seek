import { legal } from '@/app/(auth)/legal';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { screenStyles } from '@/src/styles/screenStyles';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const APP_VERSION = '1.0.0';

export default function AboutScreen() {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  const handleOpenUrl = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.error'), t('errors.generic'));
    }
  };

  return (
    <SafeAreaView style={screenStyles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.logoContainer}>
            <Image source={require('@/assets/images/icon.png')} style={styles.logoImage} />
          </View>
          <Text style={styles.appName}>ShowSeek</Text>
          <Text style={styles.versionText}>{`${t('settings.version')} ${APP_VERSION}`}</Text>
        </View>

        <View style={styles.separator} />

        <View style={styles.attributionCard}>
          <Text style={styles.attributionText}>{t('settings.tmdbAttribution')}</Text>

          <View style={styles.linksRow}>
            <TouchableOpacity
              onPress={() => handleOpenUrl(legal.privacy)}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={[styles.linkText, { color: accentColor }]}>{t('settings.privacy')}</Text>
            </TouchableOpacity>
            <Text style={styles.linksDot}>•</Text>
            <TouchableOpacity
              onPress={() => handleOpenUrl(legal.tos)}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={[styles.linkText, { color: accentColor }]}>{t('settings.terms')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: SPACING.l,
    gap: SPACING.l,
  },
  card: {
    paddingVertical: SPACING.l,
    alignItems: 'center',
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.m,
  },
  logoImage: {
    width: 136,
    height: 136,
    marginTop: -20,
    marginLeft: -20,
  },
  appName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  versionText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
    marginHorizontal: SPACING.l,
  },
  attributionCard: {
    paddingVertical: SPACING.l,
    gap: SPACING.m,
  },
  attributionText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    lineHeight: 22,
    textAlign: 'center',
  },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: SPACING.s,
  },
  linksDot: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
  },
  linkText: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
});
