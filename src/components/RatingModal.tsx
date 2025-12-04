import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Star, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '../constants/theme';
import { useDeleteEpisodeRating, useRateEpisode } from '../hooks/useRatings';
import { ratingService } from '../services/RatingService';
import { getRatingText } from '../utils/ratingHelpers';

interface RatingModalProps {
  visible: boolean;
  onClose: () => void;

  // For movies and TV shows
  mediaId?: number;
  mediaType?: 'movie' | 'tv';

  // For episodes
  episodeData?: {
    tvShowId: number;
    seasonNumber: number;
    episodeNumber: number;
    episodeName: string;
    tvShowName: string;
    posterPath: string | null;
  };

  initialRating?: number;
  onRatingSuccess: (rating: number) => void;
  onShowToast?: (message: string) => void;
}

export default function RatingModal({
  visible,
  onClose,
  mediaId,
  mediaType,
  episodeData,
  initialRating = 0,
  onRatingSuccess,
  onShowToast,
}: RatingModalProps) {
  const [rating, setRating] = useState(initialRating);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Episode rating mutations
  const rateEpisodeMutation = useRateEpisode();
  const deleteEpisodeMutation = useDeleteEpisodeRating();

  useEffect(() => {
    if (visible) {
      setRating(initialRating);
      setIsSubmitting(false);
    }
  }, [visible, initialRating]);

  const handleRatingSelect = (selectedRating: number) => {
    Haptics.selectionAsync();
    setRating(selectedRating);
  };

  const handleSubmit = async () => {
    if (rating === 0) return;

    setIsSubmitting(true);
    onClose();

    try {
      if (episodeData) {
        // Episode rating
        await rateEpisodeMutation.mutateAsync({
          tvShowId: episodeData.tvShowId,
          seasonNumber: episodeData.seasonNumber,
          episodeNumber: episodeData.episodeNumber,
          rating,
          episodeMetadata: {
            episodeName: episodeData.episodeName,
            tvShowName: episodeData.tvShowName,
            posterPath: episodeData.posterPath,
          },
        });
      } else if (mediaId !== undefined && mediaType) {
        // Movie/TV rating
        await ratingService.saveRating(mediaId, mediaType, rating);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onRatingSuccess(rating);
    } catch (err) {
      console.error('Failed to save rating:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to save rating';
      onShowToast?.(errorMessage);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    onClose();

    try {
      if (episodeData) {
        // Delete episode rating
        await deleteEpisodeMutation.mutateAsync({
          tvShowId: episodeData.tvShowId,
          seasonNumber: episodeData.seasonNumber,
          episodeNumber: episodeData.episodeNumber,
        });
      } else if (mediaId !== undefined && mediaType) {
        // Delete movie/TV rating
        await ratingService.deleteRating(mediaId, mediaType);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onRatingSuccess(0);
    } catch (err) {
      console.error('Failed to delete rating:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete rating';
      onShowToast?.(errorMessage);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Rate this Title</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={ACTIVE_OPACITY}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.starsContainer}>
            {[...Array(10)].map((_, index) => {
              const starValue = index + 1;
              const isFilled = starValue <= rating;
              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleRatingSelect(starValue)}
                  activeOpacity={0.7}
                  style={styles.starButton}
                >
                  <Star
                    size={28}
                    color={isFilled ? COLORS.primary : COLORS.textSecondary}
                    fill={isFilled ? COLORS.primary : 'transparent'}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.ratingTextContainer}>
            <Text style={styles.ratingScore}>{rating > 0 ? `${rating}/10` : 'Tap to rate'}</Text>
            {rating > 0 && <Text style={styles.ratingDescription}>{getRatingText(rating)}</Text>}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.submitButton, (rating === 0 || isSubmitting) && styles.disabledButton]}
              onPress={handleSubmit}
              disabled={rating === 0 || isSubmitting}
              activeOpacity={ACTIVE_OPACITY}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.submitButtonText}>Confirm Rating</Text>
              )}
            </TouchableOpacity>
            {initialRating > 0 && (
              <TouchableOpacity
                style={[styles.deleteButton, isSubmitting && styles.disabledButton]}
                onPress={handleDelete}
                disabled={isSubmitting}
                activeOpacity={ACTIVE_OPACITY}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={COLORS.error} />
                ) : (
                  <Text style={styles.deleteButtonText}>Clear Rating</Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              activeOpacity={ACTIVE_OPACITY}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelButtonText, isSubmitting && styles.disabledText]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.l,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.overlay,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  title: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  errorBanner: {
    backgroundColor: COLORS.error,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
  },
  errorBannerText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.s,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: SPACING.m,
  },
  starButton: {
    padding: 2,
  },
  ratingTextContainer: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
    height: 50, // Fixed height to prevent jumping
  },
  ratingScore: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  ratingDescription: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
  },
  actions: {
    flexDirection: 'column',
    gap: SPACING.m,
  },
  cancelButton: {
    padding: SPACING.m,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
  deleteButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.error,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: COLORS.error,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledText: {
    opacity: 0.5,
  },
});
