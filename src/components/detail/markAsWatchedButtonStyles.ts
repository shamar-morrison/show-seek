import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { StyleSheet } from 'react-native';

/**
 * Shared Mark as Watched button visuals, used by the movie detail screen's
 * MarkAsWatchedButton and the TV detail screen's TVShowWatchButton.
 *
 * Outline button with transparent fill; the "watched" variant switches the
 * border and text to the success color. Includes the top margin that separates
 * the button from the action-buttons row above it.
 */
export const markAsWatchedButtonStyles = StyleSheet.create({
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
    marginTop: SPACING.s,
    marginBottom: 0,
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
    fontFamily: FONT_FAMILY.semiBold,
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
    fontFamily: FONT_FAMILY.bold,
  },
});
