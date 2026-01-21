import { UserAvatar } from '@/src/components/ui/UserAvatar';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
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
  /** Whether the user is a guest (anonymous) */
  isGuest: boolean;
  /** Handler for upgrade button press */
  onUpgradePress: () => void;
}

/**
 * Displays user avatar, display name, email, and premium status.
 * Shows upgrade button for non-premium registered users.
 */
export function UserInfoSection({
  user,
  isPremium,
  isGuest,
  onUpgradePress,
}: UserInfoSectionProps) {
  const { t } = useTranslation();
  const displayName = user?.displayName || (isGuest ? 'Guest' : 'User');
  const email = user?.email || (isGuest ? 'Not signed in' : 'No email');

  return (
    <View style={styles.userSection}>
      <View style={styles.avatarContainer}>
        <UserAvatar
          photoURL={user?.photoURL}
          displayName={user?.displayName}
          email={user?.email}
          size={80}
          showPremiumBadge={isPremium}
        />
      </View>
      <Text style={styles.displayName}>{displayName}</Text>
      <Text style={styles.email}>{email}</Text>
      {!isPremium && !isGuest && (
        <TouchableOpacity style={styles.upgradeButton} onPress={onUpgradePress}>
          <Crown size={16} color={COLORS.white} style={{ marginRight: 8 }} />
          <Text style={styles.upgradeButtonText}>{t('profile.upgradeToPremium')}</Text>
        </TouchableOpacity>
      )}
      {isPremium && (
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
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.l,
  },
  avatarContainer: {
    marginBottom: SPACING.m,
  },
  displayName: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  email: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
  },
  upgradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    marginTop: SPACING.m,
  },
  upgradeButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
  premiumStatusContainer: {
    marginTop: SPACING.m,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.xs,
    backgroundColor: 'rgba(245, 124, 0, 0.2)',
    borderRadius: BORDER_RADIUS.s,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  premiumStatusText: {
    color: COLORS.warning,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
});
