import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import { X } from 'lucide-react-native';
import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { reminderModalStyles as styles } from './reminderModalStyles';

interface BaseReminderModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback when the modal should close */
  onClose: () => void;
  /** Modal title (defaults to "Set Reminder") */
  title?: string;
  /** Modal content */
  children: React.ReactNode;
}

/**
 * Base wrapper component for reminder modals.
 * Provides the modal chrome: backdrop, container, header with title and close button.
 */
export function BaseReminderModal({
  visible,
  onClose,
  title = 'Set Reminder',
  children,
}: BaseReminderModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={modalLayoutStyles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ModalBackground />
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={ACTIVE_OPACITY}
          onPress={onClose}
        />
        <View style={styles.content}>
          {/* Header */}
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
