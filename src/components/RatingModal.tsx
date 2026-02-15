import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { MAX_FREE_ITEMS_PER_LIST } from '@/src/constants/lists';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import {
  useDeleteEpisodeRating,
  useDeleteRating,
  useRateEpisode,
  useRateMedia,
} from '@/src/hooks/useRatings';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import { getRatingText } from '@/src/utils/ratingHelpers';
import * as Haptics from 'expo-haptics';
import { Star, StarHalf, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

// Sub-component for individual star with half-star support
interface RatingStarProps {
  value: number; // The full value this star represents (1-10)
  currentRating: number;
  onRate: (rating: number) => void;
  isFirstStar?: boolean; // For enforcing minimum rating of 1
}

const RatingStar = ({ value, currentRating, onRate, isFirstStar = false }: RatingStarProps) => {
  const { accentColor } = useAccentColor();
  const isFull = currentRating >= value;
  const isHalf = currentRating === value - 0.5;

  // Determine what icon to render
  const renderStarIcon = () => {
    if (isFull) {
      return <Star size={28} color={accentColor} fill={accentColor} />;
    }
    if (isHalf) {
      return <StarHalf size={28} color={accentColor} fill={accentColor} />;
    }
    return <Star size={28} color={COLORS.textSecondary} fill="transparent" />;
  };

  const handleLeftPress = () => {
    // For the first star, left tap = 1 (minimum rating), not 0.5
    const halfValue = isFirstStar ? 1 : value - 0.5;
    onRate(halfValue);
  };

  const handleRightPress = () => {
    onRate(value);
  };

  return (
    <View style={starStyles.wrapper}>
      {/* Visual layer */}
      <View pointerEvents="none" style={starStyles.iconContainer}>
        {renderStarIcon()}
      </View>

      {/* Touch layer - two halves */}
      <View style={starStyles.touchLayer}>
        <Pressable style={starStyles.leftHalf} onPress={handleLeftPress} android_ripple={null} />
        <Pressable style={starStyles.rightHalf} onPress={handleRightPress} android_ripple={null} />
      </View>
    </View>
  );
};

const starStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    position: 'absolute',
  },
  touchLayer: {
    flexDirection: 'row',
    width: '100%',
    height: '100%',
  },
  leftHalf: {
    flex: 1,
    height: '100%',
  },
  rightHalf: {
    flex: 1,
    height: '100%',
  },
});

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
    /** Whether the user is a premium subscriber */
    isPremium?: boolean;
    /** Current number of items in the target list (for limit checking) */
    currentListCount?: number;
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
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [rating, setRating] = useState(initialRating);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Episode rating mutations
  const rateMediaMutation = useRateMedia();
  const deleteMediaMutation = useDeleteRating();
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
        // Movie/TV rating - pass metadata if available
        const metadata = autoAddOptions?.mediaMetadata;
        await rateMediaMutation.mutateAsync({
          mediaId,
          mediaType,
          rating,
          metadata: metadata
            ? {
                title: metadata.title,
                posterPath: metadata.poster_path,
                releaseDate: metadata.release_date || null,
              }
            : undefined,
        });

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
          // Check list limit for free users before auto-adding
          const isPremium = autoAddOptions.isPremium ?? false;
          const currentCount = autoAddOptions.currentListCount ?? 0;
          if (!isPremium && currentCount >= MAX_FREE_ITEMS_PER_LIST) {
            console.log('[RatingModal] Skipping auto-add: list limit reached for free user');
          } else {
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
                t('lists.alreadyWatched')
              );

              console.log('[RatingModal] Auto-added to Already Watched list:', metadata.title);
            } catch (autoAddError) {
              // Log but don't throw - auto-add is non-critical
              console.error('[RatingModal] Auto-add to Already Watched list failed:', autoAddError);
            }
          }
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onRatingSuccess(rating);
    } catch (err) {
      console.error('Failed to save rating:', err);
      const errorMessage = err instanceof Error ? err.message : t('rating.failedToSave');
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
        await deleteMediaMutation.mutateAsync({ mediaId, mediaType });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onRatingSuccess(0);
    } catch (err) {
      console.error('Failed to delete rating:', err);
      const errorMessage = err instanceof Error ? err.message : t('rating.failedToDelete');
      onShowToast?.(errorMessage);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Format rating display - show decimal if half-star
  const formatRating = (r: number) => {
    if (r === 0) return t('rating.tapToRate');
    return Number.isInteger(r) ? `${r}/10` : `${r.toFixed(1)}/10`;
  };

  const rateTypeLabel = episodeData
    ? t('media.episode')
    : mediaType === 'tv'
      ? t('media.tvShow')
      : t('media.movie');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={modalLayoutStyles.container}
      >
        <ModalBackground />
        <Pressable style={modalLayoutStyles.backdrop} onPress={handleClose} />

        <View style={modalLayoutStyles.card}>
          <View style={[modalHeaderStyles.header, styles.header]}>
            <Text style={modalHeaderStyles.title}>
              {t('rating.rateThis', { type: rateTypeLabel })}
            </Text>
            <Pressable onPress={handleClose}>
              {({ pressed }) => (
                <View style={{ opacity: pressed ? ACTIVE_OPACITY : 1 }}>
                  <X size={24} color={COLORS.text} />
                </View>
              )}
            </Pressable>
          </View>

          <View style={styles.starsContainer}>
            {/* First row: stars 1-5 */}
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((starValue) => (
                <RatingStar
                  key={starValue}
                  value={starValue}
                  currentRating={rating}
                  onRate={handleRatingSelect}
                  isFirstStar={starValue === 1}
                />
              ))}
            </View>
            {/* Second row: stars 6-10 */}
            <View style={styles.starsRow}>
              {[6, 7, 8, 9, 10].map((starValue) => (
                <RatingStar
                  key={starValue}
                  value={starValue}
                  currentRating={rating}
                  onRate={handleRatingSelect}
                />
              ))}
            </View>
          </View>

          <View style={styles.ratingTextContainer}>
            <Text style={[styles.ratingScore, { color: accentColor }]}>{formatRating(rating)}</Text>
            {rating > 0 && <Text style={styles.ratingDescription}>{getRatingText(rating)}</Text>}
          </View>

          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: accentColor },
                (rating === 0 || isSubmitting) && styles.disabledButton,
                pressed && { opacity: ACTIVE_OPACITY },
              ]}
              onPress={handleSubmit}
              disabled={rating === 0 || isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.submitButtonText}>{t('rating.confirmRating')}</Text>
              )}
            </Pressable>
            {initialRating > 0 && (
              <Pressable
                style={({ pressed }) => [
                  styles.deleteButton,
                  isSubmitting && styles.disabledButton,
                  pressed && { opacity: ACTIVE_OPACITY },
                ]}
                onPress={handleDelete}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color={COLORS.error} />
                ) : (
                  <Text style={styles.deleteButtonText}>{t('rating.removeRating')}</Text>
                )}
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [styles.cancelButton, pressed && { opacity: ACTIVE_OPACITY }]}
              onPress={handleClose}
              disabled={isSubmitting}
            >
              <Text style={[styles.cancelButtonText, isSubmitting && styles.disabledText]}>
                {t('common.cancel')}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: SPACING.l,
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
