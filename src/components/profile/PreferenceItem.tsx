import { PremiumBadge } from '@/src/components/ui/PremiumBadge';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

export interface PreferenceItemProps {
  /** Label text for the preference */
  label: string;
  /** Subtitle/description text */
  subtitle: string;
  /** Current toggle value */
  value: boolean;
  /** Callback when value changes */
  onValueChange: (value: boolean) => void;
  /** Show loading indicator instead of switch */
  loading?: boolean;
  /** Disable the toggle */
  disabled?: boolean;
  /** Mark as premium-locked (shows premium badge, no switch) */
  isLocked?: boolean;
  /** Callback when locked item is pressed (usually navigates to premium) */
  onLockPress?: () => void;
}

/**
 * Reusable preference toggle item with support for:
 * - Toggle on/off with haptic feedback
 * - Loading state
 * - Premium-locked state
 */
export function PreferenceItem({
  label,
  subtitle,
  value,
  onValueChange,
  loading = false,
  disabled = false,
  isLocked = false,
  onLockPress,
}: PreferenceItemProps) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLocked) {
      // If locked, only call onLockPress if provided, otherwise do nothing
      if (onLockPress) {
        onLockPress();
      }
      return;
    }
    if (!loading && !disabled) {
      onValueChange(!value);
    }
  };

  const handleValueChange = (newValue: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(newValue);
  };

  return (
    <TouchableOpacity
      style={[styles.preferenceItem, isLocked && styles.preferenceItemLocked]}
      activeOpacity={ACTIVE_OPACITY}
      disabled={!isLocked && (loading || disabled)}
      onPress={handlePress}
      testID="preference-item"
    >
      <View style={styles.preferenceInfo}>
        <View style={styles.preferenceLabelRow}>
          <Text style={[styles.preferenceLabel, isLocked && styles.preferenceLabelLocked]}>
            {label}
          </Text>
          {isLocked && <PremiumBadge />}
        </View>
        <Text style={[styles.preferenceSubtitle, isLocked && styles.preferenceSubtitleLocked]}>
          {subtitle}
        </Text>
      </View>
      {!isLocked && (
        <>
          {loading ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Switch
              value={value}
              onValueChange={handleValueChange}
              disabled={loading || disabled}
              trackColor={{ false: COLORS.surfaceLight, true: COLORS.primary }}
              thumbColor={COLORS.white}
              testID="preference-switch"
            />
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
    gap: SPACING.m,
  },
  preferenceItemLocked: {
    opacity: 0.6,
  },
  preferenceInfo: {
    flex: 1,
  },
  preferenceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    marginBottom: SPACING.xs,
  },
  preferenceLabel: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '500',
  },
  preferenceLabelLocked: {
    color: COLORS.textSecondary,
    marginBottom: 0,
  },
  preferenceSubtitle: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  preferenceSubtitleLocked: {
    color: COLORS.textSecondary,
  },
});
