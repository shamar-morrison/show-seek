import { PremiumBadge } from '@/src/components/ui/PremiumBadge';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  SPACING,
  hexToRGBA,
} from '@/src/constants/theme';
import { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface ActionButtonProps {
  /** Lucide icon component to render */
  icon?: LucideIcon;
  /** Custom icon component to render instead of the standard Lucide icon */
  customIcon?: React.ReactNode;
  /** Button label text */
  label: string;
  /** Press handler */
  onPress: () => void;
  /** Button variant - 'danger' shows red styling */
  variant?: 'default' | 'danger';
  /** Show loading spinner and disable button */
  loading?: boolean;
  /** Mark this button as a premium-only feature */
  isPremiumFeature?: boolean;
  /** Whether the user has premium access (only applies when isPremiumFeature is true) */
  isPremium?: boolean;
  /** Optional badge to show (e.g., for Trakt connected indicator) */
  badge?: React.ReactNode;
  /** Optional testID for testing - defaults to 'action-button-{label-slug}' */
  testID?: string;
}

/**
 * Action button for profile settings. Supports premium feature gating:
 * - Set isPremiumFeature={true} and isPremium={false} to show a locked/dimmed appearance with "Premium" badge
 * - Button remains clickable (for navigating to upgrade screen)
 */
export function ActionButton({
  icon: Icon,
  customIcon,
  label,
  onPress,
  variant = 'default',
  loading,
  isPremiumFeature = false,
  isPremium = true,
  badge,
  testID,
}: ActionButtonProps) {
  const isDanger = variant === 'danger';
  const isLocked = isPremiumFeature && !isPremium;

  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        isDanger && styles.actionButtonDanger,
        isLocked && styles.actionButtonLocked,
      ]}
      onPress={loading ? () => {} : onPress}
      activeOpacity={ACTIVE_OPACITY}
      disabled={loading}
      testID={testID || `action-button-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={isDanger ? COLORS.error : COLORS.text}
          testID="action-button-spinner"
        />
      ) : customIcon ? (
        customIcon
      ) : Icon ? (
        <Icon
          size={20}
          color={isLocked ? COLORS.textSecondary : isDanger ? COLORS.error : COLORS.text}
        />
      ) : null}
      <View style={styles.actionButtonLabelContainer}>
        <Text
          style={[
            styles.actionButtonText,
            isDanger && styles.actionButtonTextDanger,
            isLocked && styles.actionButtonTextLocked,
          ]}
        >
          {label}
        </Text>
        {isPremiumFeature && !isPremium && <PremiumBadge />}
        {badge}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
    gap: SPACING.m,
  },
  actionButtonDanger: {
    backgroundColor: hexToRGBA(COLORS.error, 0.1),
  },
  actionButtonLocked: {
    opacity: 0.6,
  },
  actionButtonLabelContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  actionButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '500',
  },
  actionButtonTextDanger: {
    color: COLORS.error,
  },
  actionButtonTextLocked: {
    color: COLORS.textSecondary,
  },
});
