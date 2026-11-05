import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { ArrowRight01Icon, CrownIcon, Login01Icon } from '@hugeicons/core-free-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';

export interface AccountPromptProps {
  /** Whether the current user is a guest */
  isGuest: boolean;
  /** Whether the user has premium status */
  isPremium: boolean;
  /** Whether premium status is still resolving */
  isPremiumLoading: boolean;
  /** Whether the guest's session is being ended */
  isSigningOut: boolean;
  /** Handler for the guest prompt; leaves the guest session for the auth screens */
  onSignIn: () => void;
  /** Handler for the free-user prompt */
  onUpgrade: () => void;
  /** Outer spacing; applied to the row so nothing is left behind when it's hidden */
  style?: StyleProp<ViewStyle>;
}

/**
 * The next step for this account: guests are asked to sign in, free users to
 * upgrade, and premium users see nothing.
 *
 * Hidden while premium status resolves: isPremium reads false until then, so
 * premium users would otherwise see an upgrade prompt flash on launch.
 */
export function AccountPrompt({
  isGuest,
  isPremium,
  isPremiumLoading,
  isSigningOut,
  onSignIn,
  onUpgrade,
  style,
}: AccountPromptProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  if (!isGuest && (isPremium || isPremiumLoading)) {
    return null;
  }

  const isBusy = isGuest && isSigningOut;

  return (
    <TouchableOpacity
      style={[styles.row, style]}
      onPress={isBusy ? undefined : isGuest ? onSignIn : onUpgrade}
      disabled={isBusy}
      activeOpacity={ACTIVE_OPACITY}
      accessibilityRole="button"
      testID={isGuest ? 'account-prompt-sign-in' : 'account-prompt-upgrade'}
    >
      <AppIcon
        icon={isGuest ? Login01Icon : CrownIcon}
        size={20}
        color={accentColor}
        fill={isGuest ? undefined : accentColor}
      />
      <Text style={styles.label} numberOfLines={1}>
        {isGuest ? t('profile.guestSignInPrompt') : t('profile.upgradeToPremium')}
      </Text>
      {isBusy ? (
        <ActivityIndicator size="small" color={accentColor} />
      ) : (
        <AppIcon icon={ArrowRight01Icon} size={20} color={COLORS.textSecondary} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
  },
  label: {
    flex: 1,
    color: COLORS.white,
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.semiBold,
  },
});
