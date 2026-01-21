import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export interface ReauthViewProps {
  /** Current password input value */
  password: string;
  /** Handler for password input changes */
  onPasswordChange: (value: string) => void;
  /** Whether the reauth/delete operation is loading */
  loading: boolean;
  /** Handler for cancel button */
  onCancel: () => void;
  /** Handler for confirm (delete) button */
  onConfirm: () => void;
}

/**
 * Inline password confirmation section for account deletion.
 * Displays password input and cancel/confirm buttons.
 */
export function ReauthView({
  password,
  onPasswordChange,
  loading,
  onCancel,
  onConfirm,
}: ReauthViewProps) {
  return (
    <View style={styles.reauthSection}>
      <Text style={styles.sectionTitle}>CONFIRM IDENTITY</Text>
      <Text style={styles.reauthDescription}>
        For security, please enter your password to delete your account.
      </Text>
      <TextInput
        style={styles.reauthInput}
        placeholder="Enter your password"
        placeholderTextColor={COLORS.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={onPasswordChange}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus
        testID="reauth-password-input"
      />
      <View style={styles.reauthButtons}>
        <TouchableOpacity
          style={[styles.reauthButton, styles.reauthCancelButton]}
          onPress={onCancel}
          activeOpacity={ACTIVE_OPACITY}
          testID="reauth-cancel-button"
        >
          <Text style={styles.reauthCancelText}>Cancel</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.reauthButton, styles.reauthConfirmButton]}
          onPress={onConfirm}
          disabled={loading}
          activeOpacity={ACTIVE_OPACITY}
          testID="reauth-confirm-button"
        >
          {loading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.reauthConfirmText}>Delete Account</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  reauthSection: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.l,
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.l,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.m,
  },
  reauthDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: SPACING.m,
  },
  reauthInput: {
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    marginBottom: SPACING.m,
  },
  reauthButtons: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  reauthButton: {
    flex: 1,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reauthCancelButton: {
    backgroundColor: COLORS.surfaceLight,
  },
  reauthConfirmButton: {
    backgroundColor: COLORS.error,
  },
  reauthCancelText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: FONT_SIZE.m,
  },
  reauthConfirmText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: FONT_SIZE.m,
    textAlign: 'center',
  },
});
