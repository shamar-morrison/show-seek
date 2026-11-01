import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { MOODS, type MoodConfig } from '@/src/constants/moods';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useShuffleCycle } from '@/src/hooks/useShuffleCycle';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import { Cancel01Icon, ShuffleIcon } from '@hugeicons/core-free-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

interface MoodShuffleModalProps {
  visible: boolean;
  /** Pre-fetched TMDB backdrop paths keyed by mood id */
  backdropByMoodId: Record<string, string | null>;
  onClose: () => void;
  /** Called after the reveal pause with the chosen mood id */
  onSelect: (moodId: string) => void;
}

const CARD_WIDTH = 280;
const CARD_HEIGHT = 158;
const START_DELAY_MS = 300;
/** How long the revealed mood stays on screen before auto-navigating */
export const MOOD_REVEAL_PAUSE_MS = 1200;

const getMoodTranslationKeys = (mood: MoodConfig) => {
  const moodKey = mood.translationKey.replace('mood.', '');
  return {
    nameKey: `mood.${moodKey}.name`,
    descKey: `mood.${moodKey}.description`,
  };
};

/**
 * Slot-machine shuffle across moods for "Surprise Me". Cycles through the mood
 * cards, lands on one, pauses briefly, then hands the result to `onSelect`.
 */
export default function MoodShuffleModal({
  visible,
  backdropByMoodId,
  onClose,
  onSelect,
}: MoodShuffleModalProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const selectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const clearSelectTimeout = useCallback(() => {
    if (selectTimeoutRef.current) {
      clearTimeout(selectTimeoutRef.current);
      selectTimeoutRef.current = null;
    }
  }, []);

  const handleReveal = useCallback(
    (mood: MoodConfig) => {
      clearSelectTimeout();
      selectTimeoutRef.current = setTimeout(() => {
        selectTimeoutRef.current = null;
        onSelectRef.current(mood.id);
      }, MOOD_REVEAL_PAUSE_MS);
    },
    [clearSelectTimeout]
  );

  const { displayedItem, isAnimating, hasRevealed, start, cancel, reset, posterAnimatedStyle } =
    useShuffleCycle(MOODS, { onReveal: handleReveal });

  // Start shuffling when the modal opens; tear everything down when it hides
  useEffect(() => {
    if (!visible) {
      cancel();
      clearSelectTimeout();
      return;
    }

    reset();
    const startTimeout = setTimeout(start, START_DELAY_MS);

    return () => {
      clearTimeout(startTimeout);
      cancel();
      clearSelectTimeout();
    };
  }, [visible, start, cancel, reset, clearSelectTimeout]);

  // Cleanup on unmount
  useEffect(() => clearSelectTimeout, [clearSelectTimeout]);

  const handleClose = useCallback(() => {
    cancel();
    clearSelectTimeout();
    onClose();
  }, [cancel, clearSelectTimeout, onClose]);

  const backdropPath = displayedItem ? backdropByMoodId[displayedItem.id] : null;
  const imageUri = backdropPath ? getImageUrl(backdropPath, TMDB_IMAGE_SIZES.backdrop.medium) : null;
  const keys = displayedItem ? getMoodTranslationKeys(displayedItem) : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <ModalBackground />
      <Pressable style={modalLayoutStyles.backdrop} onPress={handleClose} />

      <View style={modalLayoutStyles.container}>
        <View style={[modalLayoutStyles.card, styles.content]}>
          {/* Header */}
          <View style={[modalHeaderStyles.header, styles.header]}>
            <View style={styles.headerTitleRow}>
              <AppIcon icon={ShuffleIcon} size={20} color={accentColor} />
              <Text style={modalHeaderStyles.title}>{t('mood.surpriseMe')}</Text>
            </View>
            <Pressable onPress={handleClose} testID="mood-shuffle-close-button">
              {({ pressed }) => (
                <View style={{ opacity: pressed ? ACTIVE_OPACITY : 1 }}>
                  <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
                </View>
              )}
            </Pressable>
          </View>

          {/* Mood Card */}
          <View style={styles.cardContainer}>
            {displayedItem && keys ? (
              <Animated.View
                style={[
                  styles.cardWrapper,
                  { backgroundColor: displayedItem.color + '20' },
                  posterAnimatedStyle,
                ]}
                testID="mood-shuffle-card"
              >
                {imageUri ? (
                  <Image
                    source={{ uri: imageUri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={isAnimating ? 0 : 200}
                  />
                ) : null}
                <LinearGradient
                  colors={['rgba(0,0,0,0.85)', 'rgba(0,0,0,0.1)']}
                  start={{ x: 0.5, y: 1 }}
                  end={{ x: 0.5, y: 0 }}
                  style={styles.cardOverlay}
                >
                  <View
                    style={[styles.iconBadge, { backgroundColor: displayedItem.color + '35' }]}
                  >
                    <AppIcon icon={displayedItem.icon} size={26} color={COLORS.text} />
                  </View>
                  <Text style={styles.moodName} numberOfLines={1}>
                    {t(keys.nameKey)}
                  </Text>
                </LinearGradient>
              </Animated.View>
            ) : (
              <View style={[styles.cardWrapper, styles.placeholderCard]}>
                <AppIcon icon={ShuffleIcon} size={40} color={COLORS.textSecondary} />
              </View>
            )}
          </View>

          {/* Status */}
          <View style={styles.statusContainer}>
            {hasRevealed && displayedItem && keys ? (
              <>
                <Text style={styles.description} numberOfLines={2}>
                  {t(keys.descKey)}
                </Text>
                <Text style={[styles.statusText, { color: accentColor }]}>
                  {t('mood.takingYouThere')}
                </Text>
              </>
            ) : (
              <Text style={styles.statusText}>{t('shuffle.shuffling')}</Text>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    maxWidth: 340,
  },
  header: {
    marginBottom: SPACING.l,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  cardContainer: {
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  cardWrapper: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: BORDER_RADIUS.l,
    overflow: 'hidden',
  },
  placeholderCard: {
    backgroundColor: COLORS.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardOverlay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: SPACING.m,
    gap: SPACING.m,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodName: {
    flex: 1,
    fontSize: FONT_SIZE.l,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  statusContainer: {
    alignItems: 'center',
    gap: SPACING.s,
    minHeight: 64,
    justifyContent: 'center',
  },
  description: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  statusText: {
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});
