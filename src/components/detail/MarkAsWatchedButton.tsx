import { COLORS } from '@/src/constants/theme';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Tick02Icon, ViewIcon } from '@hugeicons/core-free-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { markAsWatchedButtonStyles as styles } from './markAsWatchedButtonStyles';

interface MarkAsWatchedButtonProps {
  /** Number of times the movie has been watched */
  watchCount: number;
  /** Whether the watch data is still loading */
  isLoading: boolean;
  /** Callback when button is pressed */
  onPress: () => void;
  /** Callback when button is long-pressed (for watch history actions) */
  onLongPress?: () => void;
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
  onLongPress,
  disabled = false,
}: MarkAsWatchedButtonProps) {
  const { t } = useTranslation();
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
      onLongPress={onLongPress}
      disabled={disabled || isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={hasBeenWatched ? COLORS.success : COLORS.white} />
      ) : (
        <>
          {hasBeenWatched ? (
            <AppIcon icon={Tick02Icon} size={20} color={COLORS.success} />
          ) : (
            <AppIcon icon={ViewIcon} size={20} color={COLORS.white} />
          )}
          <Text style={[styles.buttonText, hasBeenWatched && styles.watchedButtonText]}>
            {hasBeenWatched
              ? t('watched.watchedTimes', { count: watchCount })
              : t('media.markAsWatched')}
          </Text>
        </>
      )}
    </Pressable>
  );
}
