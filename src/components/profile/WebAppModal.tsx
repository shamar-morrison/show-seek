import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { Globe } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface WebAppModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Handler for closing the modal */
  onClose: () => void;
  /** Handler for confirming navigation to web app */
  onConfirm: () => void;
}

/**
 * Modal confirming navigation to the ShowSeek web app.
 */
export function WebAppModal({ visible, onClose, onConfirm }: WebAppModalProps) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.webAppModalOverlay}>
        <View style={styles.webAppModalContent}>
          <View style={styles.webAppModalHeader}>
            <Globe size={24} color={COLORS.primary} />
            <Text style={styles.webAppModalTitle}>{t('profile.webAppModal.title')}</Text>
          </View>
          <Text style={styles.webAppModalDescription}>
            {t('profile.webAppModal.description')}
          </Text>
          <View style={styles.webAppModalButtons}>
            <TouchableOpacity
              style={[styles.webAppModalButton, styles.webAppModalCancelButton]}
              onPress={onClose}
              activeOpacity={ACTIVE_OPACITY}
              testID="webapp-modal-cancel"
            >
              <Text style={styles.webAppModalCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.webAppModalButton, styles.webAppModalConfirmButton]}
              onPress={onConfirm}
              activeOpacity={ACTIVE_OPACITY}
              testID="webapp-modal-confirm"
            >
              <Text style={styles.webAppModalConfirmText}>{t('common.continue')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  webAppModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.overlay,
    padding: SPACING.l,
  },
  webAppModalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    gap: SPACING.m,
  },
  webAppModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  webAppModalTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  webAppModalDescription: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  webAppModalButtons: {
    flexDirection: 'row',
    gap: SPACING.m,
    marginTop: SPACING.s,
  },
  webAppModalButton: {
    flex: 1,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webAppModalCancelButton: {
    backgroundColor: COLORS.surfaceLight,
  },
  webAppModalConfirmButton: {
    backgroundColor: COLORS.primary,
  },
  webAppModalCancelText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: FONT_SIZE.m,
  },
  webAppModalConfirmText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: FONT_SIZE.m,
  },
});
