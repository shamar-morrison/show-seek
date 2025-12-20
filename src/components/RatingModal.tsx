import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useDeleteEpisodeRating, useRateEpisode } from '@/src/hooks/useRatings';
import { ratingService } from '@/src/services/RatingService';
import { getRatingText } from '@/src/utils/ratingHelpers';
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

  /**
   * Optional auto-add configuration for movies.
   * When provided and conditions are met, the movie is added to "Already Watched" list.
   */
  autoAddOptions?: {
    /** Whether auto-add is enabled (from user preferences) */
    shouldAutoAdd?: boolean;
    /** Cached list membership - map of listId to boolean */
    listMembership?: Record<string, boolean>;
    /** Media metadata for adding to list */
    mediaMetadata?: {
      title: string;
      poster_path: string | null;
      vote_average: number;
      release_date: string;
      genre_ids?: number[];
    };
  };
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
  autoAddOptions,
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

        // Auto-add to "Already Watched" list for first-time movie ratings
        // Only applies when: mediaType is 'movie', initialRating is 0 (first-time),
        // preference is enabled, and movie is not already in the list
        const isFirstTimeRating = initialRating === 0;
        const shouldAutoAdd = autoAddOptions?.shouldAutoAdd ?? true;
        const isNotInAlreadyWatched = !autoAddOptions?.listMembership?.['already-watched'];

        if (
          mediaType === 'movie' &&
          isFirstTimeRating &&
          shouldAutoAdd &&
          isNotInAlreadyWatched &&
          autoAddOptions?.mediaMetadata
        ) {
          try {
            // Dynamically import to avoid circular dependencies
            const { listService } = await import('../services/ListService');
            const metadata = autoAddOptions.mediaMetadata;

            await listService.addToList(
              'already-watched',
              {
                id: mediaId,
                title: metadata.title,
                poster_path: metadata.poster_path,
                media_type: 'movie',
                vote_average: metadata.vote_average,
                release_date: metadata.release_date,
                genre_ids: metadata.genre_ids,
              },
              'Already Watched'
            );

            console.log('[RatingModal] Auto-added to Already Watched list:', metadata.title);
          } catch (autoAddError) {
            // Log but don't throw - auto-add is non-critical
            console.error('[RatingModal] Auto-add to Already Watched list failed:', autoAddError);
          }
        }
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
        <ModalBackground />
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Rate this Title</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={ACTIVE_OPACITY}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.starsContainer}>
            {/* First row: stars 1-5 */}
            <View style={styles.starsRow}>
              {[...Array(5)].map((_, index) => {
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
            {/* Second row: stars 6-10 */}
            <View style={styles.starsRow}>
              {[...Array(5)].map((_, index) => {
                const starValue = index + 6;
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
    flexDirection: 'column',
    alignItems: 'center',
    gap: SPACING.s,
    marginBottom: SPACING.m,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
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
