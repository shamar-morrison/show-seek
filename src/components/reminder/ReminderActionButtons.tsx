import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { reminderModalStyles as styles } from './reminderModalStyles';

interface ReminderActionButtonsProps {
  /** Whether an existing reminder exists */
  hasReminder: boolean;
  /** Whether an action is currently loading */
  isLoading: boolean;
  /** Whether the set/update action can be performed */
  canSet: boolean;
  /** Whether the update button should be disabled (e.g., no changes made) */
  isUpdateDisabled?: boolean;
  /** Callback when set/update is pressed */
  onSet: () => void;
  /** Callback when cancel is pressed */
  onCancel: () => void;
}

/**
 * Shared action buttons for reminder modals.
 * Renders Update/Cancel when hasReminder, or Set when not.
 */
export function ReminderActionButtons({
  hasReminder,
  isLoading,
  canSet,
  isUpdateDisabled = false,
  onSet,
  onCancel,
}: ReminderActionButtonsProps) {
  if (hasReminder) {
    return (
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.updateButton, !canSet && styles.buttonDisabled]}
          onPress={onSet}
          disabled={isLoading || !canSet || isUpdateDisabled}
          activeOpacity={ACTIVE_OPACITY}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={[styles.buttonText, !canSet && styles.buttonTextDisabled]}>
              Update Reminder
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={onCancel}
          disabled={isLoading}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={[styles.buttonText, styles.cancelButtonText]}>Cancel Reminder</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.actions}>
      <TouchableOpacity
        style={[styles.button, styles.setButton, !canSet && styles.buttonDisabled]}
        onPress={onSet}
        disabled={isLoading || !canSet}
        activeOpacity={ACTIVE_OPACITY}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Text style={[styles.buttonText, !canSet && styles.buttonTextDisabled]}>
            Set Reminder
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
