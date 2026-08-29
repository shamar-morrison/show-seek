import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { isPremiumAuthRequiredError } from '@/src/context/premiumBilling';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { trackPaywallWinbackDecision } from '@/src/services/analytics';
import type { PaywallWinbackScreen } from '@/src/services/analytics';
import {
  getWinbackSubscriptionOption,
  purchaseWinbackOffer,
  type SubscriptionOption,
} from '@/src/services/winbackOffer';
import { AlertCircle, Clock } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export const WINBACK_OFFER_DURATION_MS = 5 * 60 * 1000; // 5 minutes

interface WinbackOfferModalProps {
  visible: boolean;
  onDecline: () => void;
  onSuccess: () => void;
  screenName?: PaywallWinbackScreen | string;
}

const formatTimer = (totalSeconds: number): string => {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/**
 * Exit-intent win-back offer modal shown on the onboarding paywall step.
 * Displays a discounted weekly subscription with a real-time 5-minute countdown timer.
 */
export function WinbackOfferModal({
  visible,
  onDecline,
  onSuccess,
  screenName = 'onboarding-paywall',
}: WinbackOfferModalProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const requireAccount = useAccountRequired();

  const [subscriptionOption, setSubscriptionOption] = useState<SubscriptionOption | null>(null);
  const [isLoadingOption, setIsLoadingOption] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.floor(WINBACK_OFFER_DURATION_MS / 1000));
  const [isExpired, setIsExpired] = useState(false);

  const giftScale = useSharedValue(1);
  const buttonScale = useSharedValue(1);
  const buttonGlow = useSharedValue(0.3);

  const expiresAtRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pulse animations for gift emoji and claim button
  useEffect(() => {
    if (visible) {
      giftScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      buttonScale.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      buttonGlow.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 900, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(giftScale);
      cancelAnimation(buttonScale);
      cancelAnimation(buttonGlow);
      giftScale.value = 1;
      buttonScale.value = 1;
      buttonGlow.value = 0.3;
    }

    return () => {
      cancelAnimation(giftScale);
      cancelAnimation(buttonScale);
      cancelAnimation(buttonGlow);
    };
  }, [visible, giftScale, buttonScale, buttonGlow]);

  const animatedGiftStyle = useAnimatedStyle(() => ({
    transform: [{ scale: giftScale.value }],
  }));

  const animatedButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
    shadowColor: accentColor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: buttonGlow.value,
    shadowRadius: 10,
    elevation: 4,
  }));

  // Initialize or reset expiration timestamp when modal opens
  useEffect(() => {
    if (visible) {
      if (!expiresAtRef.current) {
        expiresAtRef.current = Date.now() + WINBACK_OFFER_DURATION_MS;
      }

      const updateRemaining = () => {
        if (!expiresAtRef.current) return;
        const diffMs = expiresAtRef.current - Date.now();
        const remaining = Math.max(0, Math.ceil(diffMs / 1000));
        setSecondsLeft(remaining);

        if (remaining <= 0) {
          setIsExpired(true);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      };

      updateRemaining();

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      intervalRef.current = setInterval(updateRemaining, 1000);

      // Fetch subscription option details
      setIsLoadingOption(true);
      void getWinbackSubscriptionOption()
        .then((option) => {
          setSubscriptionOption(option);
        })
        .finally(() => {
          setIsLoadingOption(false);
        });
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [visible]);

  // Recalculate remaining seconds on AppState active transition (prevents clock desync when backgrounded)
  useEffect(() => {
    if (!visible) return;

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && expiresAtRef.current) {
        const diffMs = expiresAtRef.current - Date.now();
        const remaining = Math.max(0, Math.ceil(diffMs / 1000));
        setSecondsLeft(remaining);
        if (remaining <= 0) {
          setIsExpired(true);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [visible]);

  // Extract pricing info
  const firstPhase = subscriptionOption?.pricingPhases?.[0];
  const formattedPrice = firstPhase?.price?.formatted || '$0.99';
  const priceAmount = (firstPhase?.price?.amountMicros ?? 990000) / 1_000_000;
  const currencyCode = firstPhase?.price?.currencyCode || 'USD';

  const handlePurchase = useCallback(async () => {
    if (isPurchasing || isExpired) return;

    setIsPurchasing(true);
    try {
      const result = await purchaseWinbackOffer({ subscriptionOption });

      if (result === true) {
        void trackPaywallWinbackDecision({
          decision: 'accept',
          screen: screenName,
          price: priceAmount,
          currency: currencyCode,
        });
        onSuccess();
      } else {
        // User cancelled in Play purchase sheet (result is false)
        // Keep user on modal without treating as error
        setIsPurchasing(false);
      }
    } catch (error: any) {
      setIsPurchasing(false);

      if (isPremiumAuthRequiredError(error)) {
        requireAccount();
        return;
      }

      console.error('[WinbackOfferModal] Purchase error:', error);
      Alert.alert(
        t('premium.purchaseFailedTitle'),
        error?.message || t('errors.generic'),
        [{ text: t('common.ok'), onPress: onDecline }]
      );
    }
  }, [
    currencyCode,
    isExpired,
    isPurchasing,
    onDecline,
    onSuccess,
    priceAmount,
    requireAccount,
    screenName,
    subscriptionOption,
    t,
  ]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDecline}
    >
      <Pressable
        style={styles.overlay}
        onPress={onDecline}
        testID="winback-modal-overlay"
      >
        <ModalBackground />

        {/* Prevent press propagation on the card */}
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          {/* Animated Gift Emoji */}
          <Animated.View style={[styles.giftContainer, animatedGiftStyle]}>
            <Text style={styles.giftEmoji}>🎁</Text>
          </Animated.View>

          {/* Headline & Subtext */}
          <Text style={styles.headline}>
            {t('winbackOffer.headline', 'Wait! Unlock ShowSeek Premium for Less')}
          </Text>
          <Text style={styles.subtext}>
            {t(
              'winbackOffer.subtext',
              'Get unlimited access to advanced tracking, widgets, and Trakt sync at our special weekly price.'
            )}
          </Text>

          {/* Pricing Highlight Card */}
          <View style={styles.priceContainer}>
            <View style={styles.priceRow}>
              <Text style={[styles.highlightPrice, { color: accentColor }]}>
                {formattedPrice}
              </Text>
              <Text style={styles.pricePeriod}>
                {t('winbackOffer.perWeek', '/ week')}
              </Text>
            </View>
          </View>

          {/* Timer Section */}
          <View style={[styles.timerContainer, isExpired && styles.timerContainerExpired]}>
            {isExpired ? (
              <>
                <AlertCircle size={16} color={COLORS.error} />
                <Text style={styles.expiredText}>
                  {t('winbackOffer.expiredBadge', 'Offer has expired')}
                </Text>
              </>
            ) : (
              <>
                <Clock size={16} color={accentColor} />
                <Text style={styles.timerLabel}>
                  {t('winbackOffer.timerLabel', 'Offer expires in:')}
                </Text>
                <Text style={[styles.timerCountdown, { color: accentColor }]}>
                  {formatTimer(secondsLeft)}
                </Text>
              </>
            )}
          </View>

          {/* Action Buttons */}
          {!isExpired ? (
            <View style={styles.buttonContainer}>
              <Animated.View style={[styles.claimButtonWrapper, animatedButtonStyle]}>
                <Pressable
                  style={({ pressed }) => [
                    styles.claimButton,
                    { backgroundColor: accentColor },
                    (isPurchasing || isLoadingOption) && styles.buttonDisabled,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={handlePurchase}
                  disabled={isPurchasing || isLoadingOption}
                >
                  {isPurchasing || isLoadingOption ? (
                    <ActivityIndicator size="small" color={COLORS.black} />
                  ) : (
                    <Text style={styles.claimButtonText}>
                      {t('winbackOffer.claimButton', 'Claim Special Offer')}
                    </Text>
                  )}
                </Pressable>
              </Animated.View>
            </View>
          ) : null}
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
    maxWidth: 380,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  giftContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.m,
  },
  giftEmoji: {
    fontSize: 58,
    lineHeight: 68,
    textAlign: 'center',
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
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.l,
    paddingHorizontal: SPACING.s,
  },
  priceContainer: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: BORDER_RADIUS.m,
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    alignItems: 'center',
    marginBottom: SPACING.m,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  highlightPrice: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  pricePeriod: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingVertical: 6,
    paddingHorizontal: SPACING.m,
    borderRadius: BORDER_RADIUS.round,
    marginBottom: SPACING.xl,
  },
  timerContainerExpired: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  timerLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  timerCountdown: {
    fontSize: FONT_SIZE.s,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  expiredText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.error,
    fontWeight: '700',
  },
  buttonContainer: {
    width: '100%',
    gap: SPACING.s,
  },
  claimButtonWrapper: {
    width: '100%',
    borderRadius: BORDER_RADIUS.m,
  },
  claimButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimButtonText: {
    color: COLORS.black,
    fontSize: FONT_SIZE.m,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
