import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ModalBackground } from '@/src/components/ui/ModalBackground';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import { ListMediaItem } from '@/src/services/ListService';
import { useShuffleCycle } from '@/src/hooks/useShuffleCycle';
import { Image } from 'expo-image';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Cancel01Icon, ShuffleIcon, StarIcon } from '@hugeicons/core-free-icons';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

interface ShuffleModalProps {
  visible: boolean;
  items: ListMediaItem[];
  onClose: () => void;
  onViewDetails: (item: ListMediaItem) => void;
}

const POSTER_WIDTH = 180;
const POSTER_HEIGHT = 270;

export default function ShuffleModal({
  visible,
  items,
  onClose,
  onViewDetails,
}: ShuffleModalProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const { resolvePosterPath } = usePosterOverrides();
  const { displayedItem, isAnimating, hasRevealed, start, cancel, reset, posterAnimatedStyle } =
    useShuffleCycle(items);

  // Start animation when modal opens
  useEffect(() => {
    if (visible && items.length > 0) {
      reset();

      // Small delay before starting animation
      const startTimeout = setTimeout(() => {
        start();
      }, 300);

      return () => {
        clearTimeout(startTimeout);
        cancel();
      };
    } else {
      cancel();
    }
  }, [visible, items.length, start, cancel, reset]);

  const handleSpinAgain = () => {
    start();
  };

  const handleViewDetails = () => {
    if (displayedItem) {
      onViewDetails(displayedItem);
    }
  };

  const handleClose = useCallback(() => {
    cancel();
    onClose();
  }, [cancel, onClose]);

  // Get display title (movies use 'title', TV shows use 'name')
  const getTitle = (item: ListMediaItem) => {
    return item.title || item.name || t('media.unknown');
  };

  const displayedPosterPath = useMemo(() => {
    if (!displayedItem) {
      return null;
    }

    return resolvePosterPath(displayedItem.media_type, displayedItem.id, displayedItem.poster_path);
  }, [displayedItem, resolvePosterPath]);

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
              <Text style={modalHeaderStyles.title}>{t('shuffle.title')}</Text>
            </View>
            <Pressable onPress={handleClose} testID="shuffle-close-button">
              {({ pressed }) => (
                <View style={{ opacity: pressed ? ACTIVE_OPACITY : 1 }}>
                  <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
                </View>
              )}
            </Pressable>
          </View>

          {/* Poster Display */}
          <View style={styles.posterContainer}>
            {displayedItem ? (
              <Animated.View style={[styles.posterWrapper, posterAnimatedStyle]}>
                {displayedPosterPath ? (
                  <Image
                    source={getImageUrl(displayedPosterPath, TMDB_IMAGE_SIZES.poster.medium)}
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
                <AppIcon icon={ShuffleIcon} size={48} color={COLORS.textSecondary} />
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
                  <AppIcon icon={StarIcon} size={14} color={accentColor} fill={accentColor} />
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
              <AppIcon
                icon={ShuffleIcon}
                size={18}
                color={isAnimating ? COLORS.textSecondary : accentColor}
              />
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
    fontFamily: FONT_FAMILY.semiBold,
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
    fontFamily: FONT_FAMILY.semiBold,
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
    fontFamily: FONT_FAMILY.bold,
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
    fontFamily: FONT_FAMILY.semiBold,
  },
  disabledButton: {
    borderColor: COLORS.textSecondary,
  },
  disabledText: {
    color: COLORS.textSecondary,
  },
});
