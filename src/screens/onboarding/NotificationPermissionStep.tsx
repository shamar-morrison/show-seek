import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useNotificationPermissions } from '@/src/hooks/useNotificationPermissions';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Bell } from 'lucide-react-native';

interface NotificationPermissionStepProps {
  onPermissionGranted: () => void;
  accentColor: string;
}

export default function NotificationPermissionStep({
  onPermissionGranted,
  accentColor,
}: NotificationPermissionStepProps) {
  const { t } = useTranslation();
  const { requestPermission } = useNotificationPermissions();
  const [isRequesting, setIsRequesting] = useState(false);

  const handleEnable = useCallback(async () => {
    if (isRequesting) return;
    setIsRequesting(true);

    try {
      await requestPermission();
    } catch (error) {
      console.error('[NotificationPermissionStep] Permission request failed:', error);
    } finally {
      setIsRequesting(false);
      // Always advance — we don't block onboarding on permission result
      onPermissionGranted();
    }
  }, [isRequesting, onPermissionGranted, requestPermission]);

  return (
    <View style={styles.container}>
      <Animated.View style={styles.content} entering={FadeInDown.duration(400).delay(100)}>
        <View style={[styles.iconContainer, { backgroundColor: `${accentColor}20` }]}>
          <Bell size={48} color={accentColor} />
        </View>

        <Text style={styles.title}>{t('personalOnboarding.notificationsTitle')}</Text>
        <Text style={styles.subtitle}>{t('personalOnboarding.notificationsSubtitle')}</Text>

        <Pressable
          style={[styles.enableButton, { backgroundColor: accentColor }]}
          onPress={handleEnable}
          disabled={isRequesting}
        >
          <Bell size={18} color={COLORS.white} />
          <Text style={styles.enableButtonText}>
            {t('personalOnboarding.notificationsEnable')}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: SPACING.l,
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: SPACING.m,
  },
  enableButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.m,
    gap: SPACING.s,
    width: '100%',
  },
  enableButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
});
