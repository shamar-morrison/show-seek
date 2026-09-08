import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
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
import { useReminderModalStyles } from './reminderModalStyles';

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
export function BaseReminderModal({ visible, onClose, title, children }: BaseReminderModalProps) {
  const { t } = useTranslation();
  const styles = useReminderModalStyles();
  const resolvedTitle = title ?? t('reminder.setReminder');

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
            <Text style={modalHeaderStyles.title}>{resolvedTitle}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
