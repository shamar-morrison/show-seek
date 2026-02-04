import { COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { getInitials } from '@/src/utils/userUtils';
import { Image } from 'expo-image';
import { Crown } from 'lucide-react-native';
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
  /** Background color for initials avatar */
  backgroundColor?: string;
}

/**
 * Reusable user avatar component that displays:
 * - User photo if available
 * - Initials fallback when no photo
 * - Optional premium crown badge
 */
export function UserAvatar({
  photoURL,
  displayName,
  email,
  size = 80,
  showPremiumBadge = false,
  backgroundColor,
}: UserAvatarProps) {
  const { accentColor } = useAccentColor();
  const resolvedBackground = backgroundColor ?? accentColor;
  const initials = getInitials(displayName ?? null, email ?? null);
  const borderRadius = size / 2;
  const fontSize = size * 0.4; // Scale font size relative to avatar size
  const crownSize = Math.max(12, size * 0.15);
  const badgeSize = Math.max(20, size * 0.25);
  const badgeOffset = Math.max(-4, -(size * 0.05));

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius }]}>
      {photoURL ? (
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
      {showPremiumBadge && (
        <View
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
          <Crown size={crownSize} color={COLORS.white} />
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
    fontWeight: 'bold',
    color: COLORS.white,
  },
  premiumBadge: {
    position: 'absolute',
    backgroundColor: COLORS.warning,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.background,
  },
});
