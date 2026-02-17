import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { modalLayoutStyles } from '@/src/styles/modalStyles';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

interface GuestAccessContextValue {
  isGuest: boolean;
  requireAccount: () => boolean;
  showGuestAccessModal: () => void;
}

const defaultGuestAccessContextValue: GuestAccessContextValue = {
  isGuest: false,
  requireAccount: () => false,
  showGuestAccessModal: () => {},
};

const GuestAccessContext = createContext<GuestAccessContextValue>(defaultGuestAccessContextValue);

interface GuestAccessProviderProps {
  children: React.ReactNode;
}

export function GuestAccessProvider({ children }: GuestAccessProviderProps) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const isGuest = !!user?.isAnonymous;

  const showGuestAccessModal = useCallback(() => {
    setIsVisible(true);
  }, []);

  const requireAccount = useCallback(() => {
    if (!user || user.isAnonymous) {
      setIsVisible(true);
      return false;
    }
    return true;
  }, [user]);

  const handlePrimaryAction = useCallback(async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      setIsVisible(false);
    } catch (error) {
      console.error('[GuestAccessContext] Failed to sign out guest user:', error);
      Alert.alert(t('common.errorTitle'), t('auth.signOutFailed'));
    } finally {
      setIsSigningOut(false);
    }
  }, [signOut, t]);

  const handleSecondaryAction = useCallback(() => {
    if (isSigningOut) return;
    setIsVisible(false);
  }, [isSigningOut]);

  const value = useMemo<GuestAccessContextValue>(
    () => ({
      isGuest,
      requireAccount,
      showGuestAccessModal,
    }),
    [isGuest, requireAccount, showGuestAccessModal]
  );

  return (
    <GuestAccessContext.Provider value={value}>
      {children}

      <Modal
        visible={isVisible}
        transparent
        animationType="fade"
        onRequestClose={handleSecondaryAction}
      >
        <View style={modalLayoutStyles.container}>
          <View style={modalLayoutStyles.backdrop} />

          <View style={modalLayoutStyles.card}>
            <Text style={styles.message}>{t('guestAccess.body')}</Text>

            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                (pressed || isSigningOut) && styles.primaryButtonPressed,
              ]}
              onPress={handlePrimaryAction}
              disabled={isSigningOut}
            >
              {isSigningOut ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.primaryButtonText}>{t('guestAccess.okLetsGo')}</Text>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && !isSigningOut && styles.secondaryButtonPressed,
              ]}
              onPress={handleSecondaryAction}
              disabled={isSigningOut}
            >
              <Text style={styles.secondaryButtonText}>{t('guestAccess.notNowKeepLooking')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </GuestAccessContext.Provider>
  );
}

export function useGuestAccess() {
  return useContext(GuestAccessContext);
}

const styles = StyleSheet.create({
  message: {
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.l,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: SPACING.m,
    marginBottom: SPACING.s,
  },
  primaryButtonPressed: {
    opacity: ACTIVE_OPACITY,
  },
  primaryButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: FONT_SIZE.m,
  },
  secondaryButton: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: SPACING.m,
  },
  secondaryButtonPressed: {
    opacity: ACTIVE_OPACITY,
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontWeight: '600',
    fontSize: FONT_SIZE.m,
  },
});
