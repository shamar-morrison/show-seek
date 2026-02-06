import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { modalLayoutStyles } from '@/src/styles/modalStyles';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, Text, View } from 'react-native';

interface BulkRemoveProgressModalProps {
  visible: boolean;
  current: number;
  total: number;
}

export function BulkRemoveProgressModal({ visible, current, total }: BulkRemoveProgressModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={() => {}}
    >
      <View style={modalLayoutStyles.container} testID="bulk-remove-progress-modal">
        <ModalBackground />
        <View style={styles.content}>
          <Text style={styles.title}>{t('library.removingItemsTitle')}</Text>
          <Text style={styles.progressText} testID="bulk-remove-progress-text">
            {t('library.removingItemsProgress', { current, total })}
          </Text>
          <ProgressBar current={current} total={total} height={8} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    gap: SPACING.m,
  },
  title: {
    fontSize: FONT_SIZE.l,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  progressText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
