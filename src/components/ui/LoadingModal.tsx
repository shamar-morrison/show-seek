import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { modalLayoutStyles } from '@/src/styles/modalStyles';
import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';

interface LoadingModalProps {
  visible: boolean;
  message: string;
}

/**
 * A simple loading modal with an ActivityIndicator and a message.
 * Used for actions that take time and should block user interaction.
 */
export default function LoadingModal({ visible, message }: LoadingModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={modalLayoutStyles.container}>
        <ModalBackground />
        <View style={styles.content}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.message}>{message}</Text>
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
});
