import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Globe, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const WEB_PROMO_STORAGE_KEY = 'showseek_web_promo_last_shown';
const SHOW_DELAY_MS = 1000;
const RESET_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const WEBSITE_URL = 'https://show-seek-web.vercel.app';

export default function WebPromoModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    checkAndShowModal();
  }, []);

  const checkAndShowModal = async () => {
    try {
      const lastShown = await AsyncStorage.getItem(WEB_PROMO_STORAGE_KEY);
      const now = Date.now();

      if (!lastShown || now - parseInt(lastShown, 10) > RESET_INTERVAL_MS) {
        // Wait 1 second before showing
        setTimeout(() => {
          setVisible(true);
          AsyncStorage.setItem(WEB_PROMO_STORAGE_KEY, now.toString());
        }, SHOW_DELAY_MS);
      }
    } catch (error) {
      console.error('Failed to check web promo modal status:', error);
    }
  };

  const handleClose = () => {
    setVisible(false);
  };

  const handleVisitWebsite = async () => {
    try {
      const canOpen = await Linking.canOpenURL(WEBSITE_URL);
      if (canOpen) {
        await Linking.openURL(WEBSITE_URL);
        handleClose();
      }
    } catch (error) {
      console.error('Failed to open website:', error);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.container}>
        <ModalBackground />
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleContainer}>
              <Globe size={24} color={COLORS.primary} />
              <Text style={styles.title}>ShowSeek Web</Text>
            </View>
            <TouchableOpacity onPress={handleClose} activeOpacity={ACTIVE_OPACITY}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Description */}
          <Text style={styles.description}>
            There is now a web based version of the app! You can access all your favorite features
            directly from your browser.
          </Text>

          {/* Action Button */}
          <TouchableOpacity
            style={styles.button}
            activeOpacity={ACTIVE_OPACITY}
            onPress={handleVisitWebsite}
          >
            <Text style={styles.buttonText}>Visit Website</Text>
          </TouchableOpacity>
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
    backgroundColor: COLORS.overlay,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    gap: SPACING.m,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  title: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  description: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  button: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.s,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
  },
});
