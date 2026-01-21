import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { Check, Eye } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

interface MarkAsWatchedButtonProps {
  /** Number of times the movie has been watched */
  watchCount: number;
  /** Whether the watch data is still loading */
  isLoading: boolean;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Whether the button is disabled (e.g., during save operation) */
  disabled?: boolean;
}

/**
 * Button to mark a movie as watched.
 * Shows different states based on watch count:
 * - Default: Outline button with "Mark as Watched"
 * - Watched: Green outline with checkmark and counter badge
 */
export function MarkAsWatchedButton({
  watchCount,
  isLoading,
  onPress,
  disabled = false,
}: MarkAsWatchedButtonProps) {
  const hasBeenWatched = watchCount > 0;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        hasBeenWatched && styles.watchedButton,
        (disabled || isLoading) && styles.disabledButton,
        pressed && styles.pressedButton,
      ]}
      onPress={onPress}
      disabled={disabled || isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={hasBeenWatched ? COLORS.success : COLORS.white} />
      ) : (
        <>
          {hasBeenWatched ? (
            <Check size={20} color={COLORS.success} />
          ) : (
            <Eye size={20} color={COLORS.white} />
          )}
          <Text style={[styles.buttonText, hasBeenWatched && styles.watchedButtonText]}>
            {hasBeenWatched
              ? `Watched ${watchCount} ${watchCount === 1 ? 'time' : 'times'}`
              : 'Mark as Watched'}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    backgroundColor: COLORS.transparent,
    gap: SPACING.s,
    marginTop: -SPACING.l,
    marginBottom: SPACING.l,
  },
  watchedButton: {
    borderColor: COLORS.success,
  },
  disabledButton: {
    opacity: 0.5,
  },
  pressedButton: {
    opacity: ACTIVE_OPACITY,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  watchedButtonText: {
    color: COLORS.success,
  },
  countBadge: {
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.round,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
  },
  countText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xs,
    fontWeight: 'bold',
  },
});
