import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import { ListMediaItem } from '@/src/services/ListService';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Shuffle, Star, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface ShuffleModalProps {
  visible: boolean;
  items: ListMediaItem[];
  onClose: () => void;
  onViewDetails: (item: ListMediaItem) => void;
}

const POSTER_WIDTH = 180;
const POSTER_HEIGHT = 270;
const ANIMATION_DURATION = 2000; // Total animation time in ms
const MIN_INTERVAL = 80; // Fastest cycling speed
const MAX_INTERVAL = 400; // Slowest speed before stopping

export default function ShuffleModal({
  visible,
  items,
  onClose,
  onViewDetails,
}: ShuffleModalProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayedItem, setDisplayedItem] = useState<ListMediaItem | null>(null);
  const [hasRevealed, setHasRevealed] = useState(false);
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animation values for the poster
  const posterScale = useSharedValue(1);
  const posterOpacity = useSharedValue(1);

  // Select a random target item
  const selectRandomItem = useCallback(() => {
    if (items.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex];
  }, [items]);

  // Clear any pending animation timeouts
  const clearAnimationTimeouts = useCallback(() => {
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }
  }, []);

  // Run the slot-machine animation
  const runAnimation = useCallback(() => {
    if (items.length === 0) return;

    setIsAnimating(true);
    setHasRevealed(false);

    const targetItem = selectRandomItem();
    if (!targetItem) return;

    // For single item, skip animation
    if (items.length === 1) {
      setDisplayedItem(targetItem);
      setHasRevealed(true);
      setIsAnimating(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    const startTime = Date.now();
    let currentInterval = MIN_INTERVAL;

    const cycleThroughItems = () => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= ANIMATION_DURATION) {
        // Animation complete - reveal the target
        setDisplayedItem(targetItem);
        setHasRevealed(true);
        setIsAnimating(false);

        // Trigger reveal animation and haptic
        posterScale.value = withSequence(
          withTiming(1.1, { duration: 150, easing: Easing.out(Easing.exp) }),
          withTiming(1, { duration: 100 })
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      // Show a random item (not necessarily the target)
      const randomIndex = Math.floor(Math.random() * items.length);
      setDisplayedItem(items[randomIndex]);

      // Quick opacity flash for visual feedback
      posterOpacity.value = withSequence(
        withTiming(0.7, { duration: currentInterval * 0.3 }),
        withTiming(1, { duration: currentInterval * 0.3 })
      );

      // Ease out: increase interval as we approach the end
      const progress = elapsed / ANIMATION_DURATION;
      // Exponential easing for smooth slowdown
      currentInterval = MIN_INTERVAL + (MAX_INTERVAL - MIN_INTERVAL) * Math.pow(progress, 2);

      animationTimeoutRef.current = setTimeout(cycleThroughItems, currentInterval);
    };

    // Start the cycling
    cycleThroughItems();
  }, [items, selectRandomItem, posterScale, posterOpacity]);

  // Start animation when modal opens
  useEffect(() => {
    if (visible && items.length > 0) {
      // Reset state
      setDisplayedItem(null);
      setHasRevealed(false);
      posterScale.value = 1;
      posterOpacity.value = 1;

      // Small delay before starting animation
      const startTimeout = setTimeout(() => {
        runAnimation();
      }, 300);

      return () => {
        clearTimeout(startTimeout);
        clearAnimationTimeouts();
      };
    } else {
      clearAnimationTimeouts();
    }
  }, [visible, items.length, runAnimation, clearAnimationTimeouts, posterScale, posterOpacity]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAnimationTimeouts();
  }, [clearAnimationTimeouts]);

  const handleSpinAgain = () => {
    clearAnimationTimeouts();
    runAnimation();
  };

  const handleViewDetails = () => {
    if (displayedItem) {
      onViewDetails(displayedItem);
    }
  };

  const handleClose = useCallback(() => {
    clearAnimationTimeouts();
    setIsAnimating(false);
    onClose();
  }, [clearAnimationTimeouts, onClose]);

  const posterAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: posterScale.value }],
    opacity: posterOpacity.value,
  }));

  // Get display title (movies use 'title', TV shows use 'name')
  const getTitle = (item: ListMediaItem) => {
    return item.title || item.name || t('media.unknown');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <ModalBackground />
      <Pressable style={modalLayoutStyles.backdrop} onPress={handleClose} />

      <View style={modalLayoutStyles.container}>
        <View style={[modalLayoutStyles.card, styles.content]}>
          {/* Header */}
          <View style={[modalHeaderStyles.header, styles.header]}>
            <View style={styles.headerTitleRow}>
              <Shuffle size={20} color={accentColor} />
              <Text style={modalHeaderStyles.title}>{t('shuffle.title')}</Text>
            </View>
            <Pressable onPress={handleClose} testID="shuffle-close-button">
              {({ pressed }) => (
                <View style={{ opacity: pressed ? ACTIVE_OPACITY : 1 }}>
                  <X size={24} color={COLORS.text} />
                </View>
              )}
            </Pressable>
          </View>

          {/* Poster Display */}
          <View style={styles.posterContainer}>
            {displayedItem ? (
              <Animated.View style={[styles.posterWrapper, posterAnimatedStyle]}>
                {displayedItem.poster_path ? (
                  <Image
                    source={getImageUrl(displayedItem.poster_path, TMDB_IMAGE_SIZES.poster.medium)}
                    style={styles.poster}
                    contentFit="cover"
                    transition={isAnimating ? 0 : 200}
                  />
                ) : (
                  <View style={[styles.poster, styles.placeholderPoster]}>
                    <Text style={styles.placeholderText}>{t('shuffle.noImage')}</Text>
                  </View>
                )}
              </Animated.View>
            ) : (
              <View style={[styles.poster, styles.placeholderPoster]}>
                <Shuffle size={48} color={COLORS.textSecondary} />
                <Text style={styles.placeholderText}>{t('shuffle.shuffling')}</Text>
              </View>
            )}
          </View>

          {/* Title & Rating */}
          {displayedItem && hasRevealed && (
            <View style={styles.infoContainer}>
              <Text style={styles.mediaTitle} numberOfLines={2}>
                {getTitle(displayedItem)}
              </Text>
              {displayedItem.vote_average > 0 && (
                <View style={styles.ratingBadge}>
                  <Star size={14} color={accentColor} fill={accentColor} />
                  <Text style={styles.ratingText}>{displayedItem.vote_average.toFixed(1)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            {hasRevealed && (
              <Pressable
                style={({ pressed }) => [
                  styles.primaryButton,
                  { backgroundColor: accentColor },
                  pressed && { opacity: ACTIVE_OPACITY },
                ]}
                onPress={handleViewDetails}
                testID="shuffle-view-details-button"
              >
                <Text style={styles.primaryButtonText}>{t('shuffle.viewDetails')}</Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: accentColor },
                isAnimating && styles.disabledButton,
                pressed && { opacity: ACTIVE_OPACITY },
              ]}
              onPress={handleSpinAgain}
              disabled={isAnimating}
              testID="shuffle-spin-again-button"
            >
              <Shuffle size={18} color={isAnimating ? COLORS.textSecondary : accentColor} />
              <Text
                style={[
                  styles.secondaryButtonText,
                  { color: accentColor },
                  isAnimating && styles.disabledText,
                ]}
              >
                {hasRevealed ? t('shuffle.spinAgain') : t('shuffle.shuffling')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    maxWidth: 320,
  },
  header: {
    marginBottom: SPACING.l,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  posterContainer: {
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  posterWrapper: {
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  poster: {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    borderRadius: BORDER_RADIUS.m,
  },
  placeholderPoster: {
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.m,
  },
  placeholderText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
  },
  infoContainer: {
    alignItems: 'center',
    marginBottom: SPACING.l,
    gap: SPACING.s,
  },
  mediaTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.s,
  },
  ratingText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  actions: {
    gap: SPACING.m,
  },
  primaryButton: {
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.s,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  disabledButton: {
    borderColor: COLORS.textSecondary,
  },
  disabledText: {
    color: COLORS.textSecondary,
  },
});
