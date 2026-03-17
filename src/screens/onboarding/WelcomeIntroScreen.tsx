import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
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
const HOLD_DURATION = 1500;

export default function WelcomeIntroScreen({ onComplete }: WelcomeIntroScreenProps) {
  const { t } = useTranslation();

  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(20);
  const subtitleOpacity = useSharedValue(0);
  const subtitleTranslateY = useSharedValue(20);

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

    // Auto-transition after the full animation
    const timeout = setTimeout(onComplete, TITLE_DURATION + SUBTITLE_DELAY + HOLD_DURATION);
    return () => clearTimeout(timeout);
  }, [onComplete, titleOpacity, titleTranslateY, subtitleOpacity, subtitleTranslateY]);

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
    transform: [{ translateY: subtitleTranslateY.value }],
  }));

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Animated.Text style={[styles.title, titleStyle]}>
          {t('personalOnboarding.welcomeTitle')}
        </Animated.Text>
        <Animated.Text style={[styles.subtitle, subtitleStyle]}>
          {t('personalOnboarding.welcomeSubtitle')}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    gap: SPACING.m,
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
