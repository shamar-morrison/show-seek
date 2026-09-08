import {
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import { listCardStyles } from '@/src/styles/listCardStyles';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

interface NotificationsDisabledBannerProps {
  onEnable: () => void;
  isRequesting?: boolean;
}

export const NotificationsDisabledBanner = memo<NotificationsDisabledBannerProps>(
  ({ onEnable, isRequesting = false }) => {
    const { t } = useTranslation();

    return (
      <View
        style={[listCardStyles.container, styles.container]}
        accessibilityRole="alert"
        testID="notifications-disabled-banner"
      >
        <View style={styles.badge} accessible={false}>
          <Text style={styles.badgeText}>!</Text>
        </View>
        <View style={listCardStyles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {t('reminder.notificationsDisabled')}
          </Text>
          <Text style={styles.subtitle}>{t('notifications.permissionDeniedMessage')}</Text>
          <Pressable
            onPress={onEnable}
            disabled={isRequesting}
            hitSlop={HIT_SLOP.m}
            accessibilityRole="button"
            accessibilityLabel={t('reminder.enableNotifications')}
            testID="notifications-enable-button"
            style={({ pressed }) => [styles.cta, pressed && !isRequesting && styles.ctaPressed]}
          >
            {isRequesting ? (
              <ActivityIndicator size="small" color={COLORS.warning} />
            ) : (
              <Text style={styles.ctaText}>{t('reminder.enableNotifications')}</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  }
);

NotificationsDisabledBanner.displayName = 'NotificationsDisabledBanner';

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.background,
  },
  title: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  cta: {
    alignSelf: 'flex-start',
    paddingVertical: SPACING.xs,
  },
  ctaPressed: {
    opacity: 0.6,
  },
  ctaText: {
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.warning,
  },
});
