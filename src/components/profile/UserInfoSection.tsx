import { UserAvatar } from '@/src/components/ui/UserAvatar';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { User } from 'firebase/auth';
import { Crown } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface UserInfoSectionProps {
  /** Firebase user object */
  user: User | null;
  /** Whether the user has premium status */
  isPremium: boolean;
  /** Handler for upgrade button press */
  onUpgradePress: () => void;
}

/**
 * Displays user avatar, display name, email, and premium status.
 * Compact horizontal layout with avatar on left, info on right.
 */
export function UserInfoSection({
  user,
  isPremium,
  onUpgradePress,
}: UserInfoSectionProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const displayName = user?.displayName || t('profile.user');
  const email = user?.email || t('profile.noEmail');

  return (
    <View style={styles.userSection}>
      <View style={styles.avatarContainer}>
        <UserAvatar
          photoURL={user?.photoURL}
          displayName={user?.displayName}
          email={user?.email}
          size={65}
          showPremiumBadge={isPremium}
        />
      </View>
      <View style={styles.userInfo}>
        <Text style={styles.displayName} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.email} numberOfLines={1}>
          {email}
        </Text>
        {!isPremium && (
          <TouchableOpacity
            style={[styles.upgradeButton, { backgroundColor: accentColor }]}
            onPress={onUpgradePress}
          >
            <Crown size={12} color={COLORS.white} style={{ marginRight: 6 }} />
            <Text style={styles.upgradeButtonText}>{t('profile.upgradeToPremium')}</Text>
          </TouchableOpacity>
        )}
        {isPremium && (
          <View style={styles.premiumStatusContainer}>
            <Text style={styles.premiumStatusText}>{t('profile.premiumMember')}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
  },
  avatarContainer: {
    marginRight: SPACING.m,
  },
  userInfo: {
    flex: 1,
  },
  displayName: {
    fontSize: FONT_SIZE.l,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 2,
  },
  email: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.s,
    marginTop: SPACING.s,
  },
  upgradeButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.s,
  },
  premiumStatusContainer: {
    alignSelf: 'flex-start',
    marginTop: SPACING.s,
    paddingHorizontal: SPACING.s,
    paddingVertical: 2,
    backgroundColor: 'rgba(245, 124, 0, 0.2)',
    borderRadius: BORDER_RADIUS.s,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  premiumStatusText: {
    color: COLORS.warning,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
});
