import { ProfileBackgroundImage } from '@/src/components/profile/ProfileBackgroundImage';
import { UserAvatar } from '@/src/components/ui/UserAvatar';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import type { ProfileBackground } from '@/src/utils/profileBackground';
import { resolvePreferredDisplayName } from '@/src/utils/userUtils';
import { User } from 'firebase/auth';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

export interface UserInfoSectionProps {
  /** Firebase user object */
  user: User | null;
  /** Whether the current user is a guest */
  isGuest: boolean;
  /** Whether the user has premium status */
  isPremium: boolean;
  /** Their chosen poster or backdrop, shown behind this block and fading into the screen. */
  background?: ProfileBackground | null;
}

/**
 * Account screen identity block: avatar, display name, email, and premium status.
 */
export function UserInfoSection({ user, isGuest, isPremium, background }: UserInfoSectionProps) {
  const { t } = useTranslation();
  const displayName = isGuest
    ? t('profile.guestUser')
    : resolvePreferredDisplayName(user?.displayName, null, user?.email) || t('profile.user');
  const email = user?.email || t('profile.noEmail');

  return (
    <View style={[styles.userSection, background && styles.userSectionWithBackground]}>
      {background ? (
        <ProfileBackgroundImage background={background} fadeTo={COLORS.background} />
      ) : null}
      <UserAvatar
        photoURL={user?.photoURL}
        displayName={user?.displayName}
        email={user?.email}
        size={96}
        isGuest={isGuest}
        showPremiumRing={isPremium}
      />
      <Text style={styles.displayName} numberOfLines={1}>
        {displayName}
      </Text>
      {!isGuest && (
        <Text style={styles.email} numberOfLines={1}>
          {email}
        </Text>
      )}
      {!isGuest && isPremium && (
        <View style={styles.premiumStatusContainer}>
          <Text style={styles.premiumStatusText}>{t('profile.premiumMember')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  userSection: {
    alignItems: 'center',
    paddingVertical: SPACING.l,
  },
  // Room above the avatar so the image shows, and full width past the screen's side padding.
  userSectionWithBackground: {
    marginHorizontal: -SPACING.l,
    paddingTop: SPACING.xxl + SPACING.l,
    position: 'relative',
  },
  displayName: {
    fontSize: FONT_SIZE.xl,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.white,
    marginTop: SPACING.m,
  },
  email: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  premiumStatusContainer: {
    marginTop: SPACING.s,
    paddingHorizontal: SPACING.s,
    paddingVertical: 2,
    backgroundColor: hexToRGBA(COLORS.premiumGold, 0.15),
    borderRadius: BORDER_RADIUS.s,
    borderWidth: 1,
    borderColor: COLORS.premiumGold,
  },
  premiumStatusText: {
    color: COLORS.premiumGold,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.semiBold,
  },
});
