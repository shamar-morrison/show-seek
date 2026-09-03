import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import type { OnboardingExitIntentVariant } from '@/src/services/analytics';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { ModalBackground } from '@/src/components/ui/ModalBackground';

interface ExitIntentModalProps {
  visible: boolean;
  /** Copy variant for A/B testing. Default: 'a'. */
  variant?: OnboardingExitIntentVariant;
  /** Called when the user chooses to continue onboarding. */
  onContinue: () => void;
  /** Called when the user chooses to exit. */
  onExit: () => void;
}

const VARIANT_I18N_KEYS = {
  a: {
    headline: 'exitIntent.variantA.headline',
    subtext: 'exitIntent.variantA.subtext',
    continueButton: 'exitIntent.variantA.continueButton',
    exitButton: 'exitIntent.variantA.exitButton',
  },
  b: {
    headline: 'exitIntent.variantB.headline',
    subtext: 'exitIntent.variantB.subtext',
    continueButton: 'exitIntent.variantB.continueButton',
    exitButton: 'exitIntent.variantB.exitButton',
  },
  c: {
    headline: 'exitIntent.variantC.headline',
    subtext: 'exitIntent.variantC.subtext',
    continueButton: 'exitIntent.variantC.continueButton',
    exitButton: 'exitIntent.variantC.exitButton',
  },
} as const;

/**
 * A persuasive exit-intent modal shown when the user attempts to leave
 * onboarding via the Android back button.
 *
 * Three copy variants (a/b/c) can be selected via the `variant` prop
 * for A/B testing. Tapping the backdrop counts as "Continue" (dismisses
 * the modal and resets the one-shot flag).
 */
export function ExitIntentModal({
  visible,
  variant = 'a',
  onContinue,
  onExit,
}: ExitIntentModalProps) {
  const { t } = useTranslation();
  const keys = VARIANT_I18N_KEYS[variant];

  const emojiScale = useSharedValue(1);

  // Pulse animation for emoji
  useEffect(() => {
    if (visible) {
      const easingFn = Easing?.inOut ? Easing.inOut(Easing.ease) : undefined;
      emojiScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 600, easing: easingFn }),
          withTiming(1, { duration: 600, easing: easingFn })
        ),
        -1,
        true
      );
    } else {
      if (typeof cancelAnimation === 'function') {
        cancelAnimation(emojiScale);
      }
      emojiScale.value = 1;
    }

    return () => {
      if (typeof cancelAnimation === 'function') {
        cancelAnimation(emojiScale);
      }
    };
  }, [visible, emojiScale]);

  const animatedEmojiStyle = useAnimatedStyle(() => ({
    transform: [{ scale: emojiScale.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onExit}
    >
      <Pressable style={styles.overlay} onPress={onContinue}>
        <ModalBackground />

        {/* Stop press propagation on the card itself */}
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Animated Emoji */}
          <Animated.View style={[styles.emojiContainer, animatedEmojiStyle]}>
            <Text style={styles.emojiText}>🫣</Text>
          </Animated.View>

          <Text style={styles.headline}>{t(keys.headline)}</Text>
          <Text style={styles.subtext}>{t(keys.subtext)}</Text>

          <View style={styles.buttonContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.continueButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={onContinue}
            >
              <Text style={styles.continueButtonText}>{t(keys.continueButton)}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.exitButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={onExit}
            >
              <Text style={styles.exitButtonText}>{t(keys.exitButton)}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.l,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    // Subtle border to separate from the dark backdrop
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  headline: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: SPACING.s,
  },
  subtext: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.s,
  },
  buttonContainer: {
    width: '100%',
    gap: SPACING.s,
  },
  continueButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '700',
  },
  emojiContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.m,
  },
  emojiText: {
    fontSize: 48,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  exitButton: {
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
});
