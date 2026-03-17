import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

interface PersonalizingScreenProps {
  onComplete: () => Promise<void>;
  onDone: () => void;
}

const PHRASES_KEYS = [
  'personalOnboarding.personalizing.curatingLists',
  'personalOnboarding.personalizing.personalizingRecommendations',
  'personalOnboarding.personalizing.settingUpCalendar',
  'personalOnboarding.personalizing.finetuning',
  'personalOnboarding.personalizing.almostThere',
];

const MIN_DURATION_MS = 5000;
const PHRASE_INTERVAL_MS = 700;

export default function PersonalizingScreen({ onComplete, onDone }: PersonalizingScreenProps) {
  const { t } = useTranslation();
  const [currentPhraseIndex, setPhraseIndex] = useState(0);
  const progressWidth = useSharedValue(0);
  const phraseOpacity = useSharedValue(1);
  const hasCompleted = useRef(false);
  const saveStarted = useRef(false);

  const progressAnimStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const phraseAnimStyle = useAnimatedStyle(() => ({
    opacity: phraseOpacity.value,
  }));

  // Rotate phrases once, then pause on the last one
  useEffect(() => {
    if (currentPhraseIndex >= PHRASES_KEYS.length - 1) {
      return;
    }

    const timeout = setTimeout(() => {
      phraseOpacity.value = withTiming(0, { duration: 200 }, () => {
        phraseOpacity.value = withDelay(50, withTiming(1, { duration: 300 }));
      });

      setPhraseIndex((prev) => Math.min(prev + 1, PHRASES_KEYS.length - 1));
    }, PHRASE_INTERVAL_MS);

    return () => clearTimeout(timeout);
  }, [currentPhraseIndex, phraseOpacity]);

  // Animate progress bar
  useEffect(() => {
    progressWidth.value = withTiming(100, {
      duration: MIN_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [progressWidth]);

  // Start saving and complete after minimum duration
  useEffect(() => {
    if (saveStarted.current) return;
    saveStarted.current = true;

    const doComplete = async () => {
      // Wait minimum duration for the animation
      const waitPromise = new Promise<void>((resolve) =>
        setTimeout(resolve, MIN_DURATION_MS)
      );

      // Run save and wait in parallel
      await Promise.all([onComplete(), waitPromise]);

      // Only navigate after both the save and the minimum duration have elapsed
      if (!hasCompleted.current) {
        hasCompleted.current = true;
        onDone();
      }
    };

    doComplete().catch((e) => {
      console.error('[PersonalizingScreen] Error during completion:', e);
    });
  }, [onComplete]);

  return (
    <View style={styles.container}>
      <Animated.View entering={FadeIn.duration(600)} style={styles.content}>
        {/* Logo/Title area */}
        <Text style={styles.title}>
          {t('personalOnboarding.personalizing.title')}
        </Text>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[styles.progressFill, progressAnimStyle]}
            />
          </View>
        </View>

        {/* Rotating phrase */}
        <Animated.Text style={[styles.phrase, phraseAnimStyle]}>
          {t(PHRASES_KEYS[currentPhraseIndex])}
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    gap: SPACING.xl,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  progressContainer: {
    width: '100%',
    maxWidth: 280,
  },
  progressTrack: {
    height: 6,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.round,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: BORDER_RADIUS.round,
  },
  phrase: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontWeight: '500',
    minHeight: 20,
  },
});
