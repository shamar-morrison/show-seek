import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
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

  const displayMessage = message ?? t('auth.featureRequiresAccount');

  const handleSignIn = () => {
    onClose();
    router.push('/(auth)/sign-in');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <ModalBackground />
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={styles.content}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <LogIn size={32} color={COLORS.primary} />
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

          <Text style={styles.title}>{t('errors.unauthorized')}</Text>
          <Text style={styles.message}>{displayMessage}</Text>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.signInButton}
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
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.l,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  content: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
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
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
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
    backgroundColor: COLORS.primary,
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
