import { AnimatedBackground } from '@/src/components/auth/AnimatedBackground';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface WelcomeIntroScreenProps {
  onComplete: () => void;
}

const POPCORN_DURATION = 500;
const TITLE_DELAY = 300;
const TITLE_DURATION = 600;
const SUBTITLE_DELAY = TITLE_DELAY + 450;
const SUBTITLE_DURATION = 600;
const BUTTON_DELAY = SUBTITLE_DELAY + 450;
const BUTTON_DURATION = 500;

export default function WelcomeIntroScreen({ onComplete }: WelcomeIntroScreenProps) {
  const { t } = useTranslation();

  const popcornOpacity = useSharedValue(0);
  const popcornScale = useSharedValue(0.4);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(20);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(20);
  const buttonOpacity = useSharedValue(0);
  const buttonTranslateY = useSharedValue(16);

  useEffect(() => {
    // Popcorn pops in first
    popcornOpacity.value = withTiming(1, { duration: POPCORN_DURATION });
    popcornScale.value = withSpring(1, { damping: 12, stiffness: 120 });

    // Title cascades in
    titleOpacity.value = withDelay(TITLE_DELAY, withTiming(1, { duration: TITLE_DURATION }));
    titleTranslateY.value = withDelay(TITLE_DELAY, withTiming(0, { duration: TITLE_DURATION }));

    // Subtitle animates in after title
    subtitleOpacity.value = withDelay(
      SUBTITLE_DELAY,
      withTiming(1, { duration: SUBTITLE_DURATION })
    );
    subtitleTranslateY.value = withDelay(
      SUBTITLE_DELAY,
      withTiming(0, { duration: SUBTITLE_DURATION })
    );

    // Button fades in after subtitle
    buttonOpacity.value = withDelay(BUTTON_DELAY, withTiming(1, { duration: BUTTON_DURATION }));
    buttonTranslateY.value = withDelay(BUTTON_DELAY, withTiming(0, { duration: BUTTON_DURATION }));
  }, [
    popcornOpacity,
    popcornScale,
    titleOpacity,
    titleTranslateY,
    subtitleOpacity,
    subtitleTranslateY,
    buttonOpacity,
    buttonTranslateY,
  ]);

  const popcornStyle = useAnimatedStyle(() => ({
    opacity: popcornOpacity.value,
    transform: [{ scale: popcornScale.value }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ translateY: buttonTranslateY.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Animated poster collage background */}
      <AnimatedBackground />

      {/* Heavier gradient overlay: fades to black around the halfway mark */}
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.2)', 'rgba(0, 0, 0, 0.6)', 'rgba(0, 0, 0, 0.95)', COLORS.black]}
        locations={[0, 0.35, 0.55, 0.7]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.content}>
        <Animated.View style={[styles.popcornWrapper, popcornStyle]}>
          <Text style={styles.popcornEmoji} accessibilityLabel="popcorn">
            🍿
          </Text>
        </Animated.View>

        <Animated.View style={[styles.titleContainer, titleStyle]}>
          <Text style={styles.eyebrow}>
            {t('personalOnboarding.welcomePrefix').trim()}
          </Text>
          <Text style={styles.heroTitle}>
            {t('personalOnboarding.welcomeAppName')}
          </Text>
        </Animated.View>

        <Animated.Text style={[styles.subtitle, subtitleStyle]}>
          {t('personalOnboarding.welcomeSubtitle')}
        </Animated.Text>

        <Animated.View style={[buttonStyle, styles.buttonWrapper]}>
          <Pressable
            style={styles.button}
            onPress={onComplete}
            accessibilityRole="button"
            accessibilityLabel={t('personalOnboarding.letsGo')}
          >
            <Text style={styles.buttonText}>{t('personalOnboarding.letsGo')}</Text>
            <ArrowRight size={20} color={COLORS.white} />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: 120,
    gap: SPACING.m,
  },
  popcornWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  popcornEmoji: {
    fontSize: 44,
    lineHeight: 52,
    textAlign: 'center',
  },
  titleContainer: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  eyebrow: {
    fontSize: FONT_SIZE.s,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 3,
    textAlign: 'center',
  },
  heroTitle: {
    fontSize: 50,
    fontWeight: '900',
    color: COLORS.primary,
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 56,
  },
  subtitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  buttonWrapper: {
    alignSelf: 'stretch',
    marginTop: SPACING.l,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.m,
    gap: SPACING.s,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
});
