import { COLORS, FONT_FAMILY } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { getInitials } from '@/src/utils/userUtils';
import { Image } from 'expo-image';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { CrownIcon, UserIcon } from '@hugeicons/core-free-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface UserAvatarProps {
  /** User's photo URL */
  photoURL?: string | null;
  /** User's display name (for initials fallback) */
  displayName?: string | null;
  /** User's email (for initials fallback if no display name) */
  email?: string | null;
  /** Avatar size in pixels (default: 80) */
  size?: number;
  /** Show premium crown badge */
  showPremiumBadge?: boolean;
  /** Show a gold ring outside the avatar bounds, along with the crown badge */
  showPremiumRing?: boolean;
  /** Show a generic person icon instead of a photo or initials */
  isGuest?: boolean;
  /** Background color for initials avatar */
  backgroundColor?: string;
}

/**
 * Reusable user avatar component that displays:
 * - User photo if available
 * - Initials fallback when no photo
 * - Generic person icon for guests
 * - Optional premium crown badge and gold ring
 *
 * The ring is drawn outside `size`, so a premium avatar keeps the same photo
 * size and layout as a regular one.
 */
export function UserAvatar({
  photoURL,
  displayName,
  email,
  size = 80,
  showPremiumBadge = false,
  showPremiumRing = false,
  isGuest = false,
  backgroundColor,
}: UserAvatarProps) {
  const { accentColor } = useAccentColor();
  const resolvedBackground = backgroundColor ?? accentColor;
  const initials = getInitials(displayName ?? null, email ?? null);
  const borderRadius = size / 2;
  const fontSize = size * 0.4; // Scale font size relative to avatar size
  const badgeSize = Math.max(14, size * 0.3);
  const crownSize = Math.round(badgeSize * 0.6);
  const badgeOffset = Math.max(-4, -(size * 0.05));
  const ringWidth = Math.max(2, size * 0.03);
  const ringOffset = ringWidth + Math.max(1, size * 0.02);

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius }]}>
      {isGuest ? (
        <View
          style={[styles.guestContainer, { width: size, height: size, borderRadius }]}
          testID="user-avatar-guest"
        >
          <AppIcon icon={UserIcon} size={size * 0.55} color={COLORS.textSecondary} />
        </View>
      ) : photoURL ? (
        <Image
          source={{ uri: photoURL }}
          style={[styles.image, { width: size, height: size, borderRadius }]}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View
          style={[
            styles.initialsContainer,
            { width: size, height: size, borderRadius, backgroundColor: resolvedBackground },
          ]}
        >
          <Text style={[styles.initialsText, { fontSize }]}>{initials}</Text>
        </View>
      )}
      {showPremiumRing && (
        <View
          pointerEvents="none"
          testID="user-avatar-premium-ring"
          style={[
            styles.premiumRing,
            {
              top: -ringOffset,
              left: -ringOffset,
              right: -ringOffset,
              bottom: -ringOffset,
              borderRadius: borderRadius + ringOffset,
              borderWidth: ringWidth,
            },
          ]}
        />
      )}
      {(showPremiumBadge || showPremiumRing) && (
        <View
          testID="user-avatar-premium-badge"
          style={[
            styles.premiumBadge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              bottom: badgeOffset,
              right: badgeOffset,
            },
          ]}
        >
          {/* Filled: the outline's fine detail blurs together at small badge sizes. */}
          <AppIcon icon={CrownIcon} size={crownSize} color={COLORS.black} fill={COLORS.black} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    backgroundColor: COLORS.surfaceLight,
  },
  initialsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initialsText: {
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.white,
  },
  guestContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
  },
  premiumRing: {
    position: 'absolute',
    borderColor: COLORS.premiumGold,
  },
  premiumBadge: {
    position: 'absolute',
    backgroundColor: COLORS.premiumGold,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.background,
  },
});
