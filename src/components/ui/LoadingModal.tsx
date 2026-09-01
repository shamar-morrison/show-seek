import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { modalLayoutStyles } from '@/src/styles/modalStyles';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

interface LoadingModalProps {
  visible: boolean;
  message: string;
  progressText?: string;
  onCancel?: () => void;
  cancelText?: string;
  isCancelling?: boolean;
}

/**
 * A loading modal with an ActivityIndicator, message, optional progress text, and optional cancel button.
 * Used for actions that take time and should block user interaction.
 */
export default function LoadingModal({
  visible,
  message,
  progressText,
  onCancel,
  cancelText = 'Cancel',
  isCancelling = false,
}: LoadingModalProps) {
  const { accentColor } = useAccentColor();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={() => {}}
    >
      <View style={modalLayoutStyles.container} testID="loading-modal-container">
        <ModalBackground />
        <View style={styles.content}>
          <ActivityIndicator size="large" color={accentColor} />
          <Text style={styles.message} testID="loading-modal-message">
            {message}
          </Text>
          {progressText ? (
            <Text style={styles.progressText} testID="loading-modal-progress">
              {progressText}
            </Text>
          ) : null}
          {onCancel ? (
            <Pressable
              style={({ pressed }) => [
                styles.cancelButton,
                isCancelling && styles.cancelButtonDisabled,
                pressed && !isCancelling && styles.cancelButtonPressed,
              ]}
              onPress={onCancel}
              disabled={isCancelling}
              testID="loading-modal-cancel-button"
            >
              <Text
                style={[
                  styles.cancelButtonText,
                  isCancelling && styles.cancelButtonTextDisabled,
                ]}
              >
                {isCancelling ? `${cancelText}...` : cancelText}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  message: {
    marginTop: SPACING.l,
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    textAlign: 'center',
    fontWeight: '600',
  },
  progressText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
  },
  cancelButton: {
    marginTop: SPACING.l,
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  cancelButtonPressed: {
    opacity: 0.8,
  },
  cancelButtonDisabled: {
    opacity: 0.5,
  },
  cancelButtonText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  cancelButtonTextDisabled: {
    color: COLORS.textSecondary,
  },
});

