import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Calendar, Crown } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

// Import the background image
const CALENDAR_BG = require('@/assets/images/calendar_bg.png');

/**
 * Premium gate component displayed when non-premium users try to access
 * the Release Calendar feature. Shows a visually appealing teaser to
 * encourage upgrades.
 */
export function CalendarPremiumGate() {
  const { t } = useTranslation();
  const router = useRouter();

  const handleUpgrade = () => {
    router.push('/premium');
  };

  return (
    <View style={styles.container}>
      {/* Background Image */}
      <Image source={CALENDAR_BG} style={styles.backgroundImage} contentFit="cover" />

      {/* Blur Overlay - BlurView on iOS, semi-transparent overlay on Android */}
      {Platform.OS === 'ios' ? (
        <BlurView intensity={30} tint="dark" style={styles.blur} />
      ) : (
        <View style={styles.androidBlur} />
      )}

      {/* Top Gradient Overlay - subtle darkening from top */}
      <LinearGradient
        colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.3)', 'transparent']}
        locations={[0, 0.3, 0.5]}
        style={styles.topGradient}
      />

      {/* Bottom Gradient Overlay */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,0.95)']}
        locations={[0, 0.4, 0.8]}
        style={styles.gradient}
      />

      {/* Content */}
      <View style={styles.content}>
        {/* Icon Container */}
        <View style={styles.iconContainer}>
          <Calendar size={48} color="#FFD700" />
        </View>

        {/* Title */}
        <Text style={styles.title}>{t('calendar.premiumTitle')}</Text>

        {/* Description */}
        <Text style={styles.description}>{t('calendar.premiumDescription')}</Text>

        {/* CTA Button */}
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={handleUpgrade}
        >
          <Crown size={20} color="#000" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>{t('calendar.upgradeToPremium')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '40%',
  },
  blur: {
    ...StyleSheet.absoluteFillObject,
  },
  androidBlur: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.xxl * 2,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.l,
    borderWidth: 2,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.m,
  },
  description: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
    maxWidth: 320,
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#FFD700',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.xl,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonIcon: {
    marginRight: SPACING.s,
  },
  buttonText: {
    color: '#000',
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
  },
});
