import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import { useRouter } from 'expo-router';
import { LogIn, X } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface AuthGuardModalProps {
  visible: boolean;
  onClose: () => void;
  message?: string;
}

/**
 * Modal that prompts guest/unauthenticated users to sign in
 * when they attempt a protected action.
 *
 * @example
 * <AuthGuardModal
 *   visible={showAuthModal}
 *   onClose={() => setShowAuthModal(false)}
 *   message="Sign in to add items to your lists"
 * />
 */
export default function AuthGuardModal({ visible, onClose, message }: AuthGuardModalProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  const displayMessage = message ?? t('auth.featureRequiresAccount');

  const handleSignIn = () => {
    onClose();
    router.push('/(auth)/sign-in');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalLayoutStyles.container}>
        <ModalBackground />
        <TouchableOpacity
          style={modalLayoutStyles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <View style={[modalLayoutStyles.card, styles.content]}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <LogIn size={32} color={accentColor} />
            </View>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={ACTIVE_OPACITY}
              style={styles.closeButton}
              accessibilityLabel={t('common.close')}
              accessibilityRole="button"
            >
              <X size={24} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[modalHeaderStyles.title, styles.title]}>{t('errors.unauthorized')}</Text>
          <Text style={styles.message}>{displayMessage}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.signInButton, { backgroundColor: accentColor }]}
              onPress={handleSignIn}
              activeOpacity={ACTIVE_OPACITY}
              accessibilityLabel={t('auth.signIn')}
              accessibilityRole="button"
            >
              <Text style={styles.signInButtonText}>{t('auth.signIn')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.laterButton}
              onPress={onClose}
              activeOpacity={ACTIVE_OPACITY}
              accessibilityLabel={t('common.cancel')}
              accessibilityRole="button"
            >
              <Text style={styles.laterButtonText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    maxWidth: 340,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.m,
    position: 'relative',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: SPACING.xs,
  },
  title: {
    marginBottom: SPACING.s,
    textAlign: 'center',
  },
  message: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.l,
    lineHeight: 22,
  },
  actions: {
    width: '100%',
    gap: SPACING.m,
  },
  signInButton: {
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
  },
  signInButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
  laterButton: {
    paddingVertical: SPACING.m,
    alignItems: 'center',
  },
  laterButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
  },
});
