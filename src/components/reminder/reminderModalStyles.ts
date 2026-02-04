import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { StyleSheet } from 'react-native';

/**
 * Shared styles for ReminderModal and TVReminderModal
 */
export const reminderModalStyles = StyleSheet.create({
  content: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
  },

  closeButton: {
    padding: SPACING.xs,
  },

  // Sections
  section: {
    marginBottom: SPACING.l,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.m,
  },

  // Media title display
  mediaTitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    marginBottom: SPACING.m,
    fontWeight: '600',
  },

  // Date display
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    marginBottom: SPACING.l,
  },
  dateText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },

  // Action buttons
  actions: {
    gap: SPACING.m,
  },
  button: {
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  setButton: {
    backgroundColor: COLORS.primary,
  },
  updateButton: {
    backgroundColor: COLORS.primary,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  buttonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.white,
  },
  cancelButtonText: {
    color: COLORS.error,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonTextDisabled: {
    color: COLORS.textSecondary,
  },

  // Text helpers
  disabledText: {
    color: COLORS.textSecondary,
  },
  warningText: {
    color: COLORS.warning,
  },
});
