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
  withTiming,
} from 'react-native-reanimated';

interface WelcomeIntroScreenProps {
  onComplete: () => void;
}

const TITLE_DURATION = 700;
const SUBTITLE_DELAY = 800;
const SUBTITLE_DURATION = 700;
const BUTTON_DELAY = SUBTITLE_DELAY + SUBTITLE_DURATION + 200;
const BUTTON_DURATION = 500;

export default function WelcomeIntroScreen({ onComplete }: WelcomeIntroScreenProps) {
  const { t } = useTranslation();

  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(20);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(20);
  const buttonOpacity = useSharedValue(0);
  const buttonTranslateY = useSharedValue(16);

  useEffect(() => {
    // Title animates in
    titleOpacity.value = withTiming(1, { duration: TITLE_DURATION });
    titleTranslateY.value = withTiming(0, { duration: TITLE_DURATION });

    // Subtitle animates in after a delay
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
    titleOpacity,
    titleTranslateY,
    subtitleOpacity,
    subtitleTranslateY,
    buttonOpacity,
    buttonTranslateY,
  ]);

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
        <Animated.Text style={[styles.title, titleStyle]}>
          {t('personalOnboarding.welcomePrefix')}
          <Text style={styles.titleAccent}>{t('personalOnboarding.welcomeAppName')}</Text>
        </Animated.Text>
        <Animated.Text style={[styles.subtitle, subtitleStyle]}>
          {t('personalOnboarding.welcomeSubtitle')}
        </Animated.Text>

        <Animated.View style={[buttonStyle, styles.buttonWrapper]}>
          <Pressable style={styles.button} onPress={onComplete}>
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
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  titleAccent: {
    color: COLORS.primary,
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
