import { COLORS, FONT_SIZE, SPACING } from '@/constants/theme';
import React, { memo } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

interface ProgressBarProps {
  /** Current progress value */
  current: number;
  /** Total/maximum value */
  total: number;
  /** Height of the progress bar in pixels (default: 6) */
  height?: number;
  /** Show label with current/total text (default: false) */
  showLabel?: boolean;
  /** Color when progress is 100% (default: COLORS.success) */
  completedColor?: string;
  /** Color when progress is 1-99% (default: COLORS.primary) */
  inProgressColor?: string;
  /** Background color of unfilled portion (default: COLORS.surfaceLight) */
  backgroundColor?: string;
  /** Additional styles for container */
  style?: ViewStyle;
}

export const ProgressBar = memo<ProgressBarProps>(
  ({
    current,
    total,
    height = 6,
    showLabel = false,
    completedColor = COLORS.success,
    inProgressColor = COLORS.primary,
    backgroundColor = COLORS.surfaceLight,
    style,
  }) => {
    // Calculate percentage (0-100)
    const percentage = total > 0 ? (current / total) * 100 : 0;
    const isComplete = percentage >= 100;

    // Determine progress bar color
    const progressColor = isComplete ? completedColor : inProgressColor;

    return (
      <View style={[styles.container, style]}>
        {showLabel && (
          <Text style={styles.label}>
            {current}/{total}
          </Text>
        )}
        <View
          style={[
            styles.track,
            {
              height,
              backgroundColor,
              borderRadius: height / 2, // Make ends rounded
            },
          ]}
        >
          <View
            style={[
              styles.fill,
              {
                width: `${Math.min(percentage, 100)}%`,
                backgroundColor: progressColor,
                borderRadius: height / 2,
              },
            ]}
          />
        </View>
      </View>
    );
  }
);

ProgressBar.displayName = 'ProgressBar';

const styles = StyleSheet.create({
  container: {
    gap: SPACING.xs,
  },
  label: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
