import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { PremiumBadge } from '@/src/components/ui/PremiumBadge';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { formatTmdbDate, parseTmdbDate } from '@/src/utils/dateUtils';
import { router } from 'expo-router';
import { Calendar, Clock, Trash2, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface MarkAsWatchedModalProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Callback when the modal should close */
  onClose: () => void;
  /** Movie title for display */
  movieTitle: string;
  /** Movie release date (YYYY-MM-DD format) */
  releaseDate: string | null;
  /** Number of times already watched */
  watchCount: number;
  /** Callback when user selects a watch date */
  onMarkAsWatched: (date: Date) => Promise<void>;
  /** Callback when user wants to clear all watch history */
  onClearAll: () => Promise<void>;
  /** Callback to show a toast message */
  onShowToast?: (message: string) => void;
}

/**
 * Bottom sheet modal for selecting when a movie was watched.
 * Options: Right now, Release Date (premium), Clear all (if applicable)
 */
export default function MarkAsWatchedModal({
  visible,
  onClose,
  movieTitle,
  releaseDate,
  watchCount,
  onMarkAsWatched,
  onClearAll,
  onShowToast,
}: MarkAsWatchedModalProps) {
  const { isPremium } = usePremium();
  const [isLoading, setIsLoading] = useState(false);

  // Reset modal state when closed to prevent stale UI on reopen
  useEffect(() => {
    if (!visible) {
      setIsLoading(false);
    }
  }, [visible]);

  // Parse release date using timezone-safe utility
  let parsedReleaseDate: Date | null = null;
  let hasValidReleaseDate = false;

  if (releaseDate) {
    try {
      parsedReleaseDate = parseTmdbDate(releaseDate);
      // Only allow release dates that are today or in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      hasValidReleaseDate = parsedReleaseDate <= today;
    } catch {
      // Invalid date format
      hasValidReleaseDate = false;
    }
  }

  const handleRightNow = async () => {
    try {
      setIsLoading(true);
      await onMarkAsWatched(new Date());
      onShowToast?.('Marked as watched');
      onClose();
    } catch (error) {
      onShowToast?.(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReleaseDate = async () => {
    if (!parsedReleaseDate) return;

    // Check premium status for date selection
    if (!isPremium) {
      onClose();
      router.push('/premium');
      return;
    }

    try {
      setIsLoading(true);
      await onMarkAsWatched(parsedReleaseDate);
      onShowToast?.('Marked as watched');
      onClose();
    } catch (error) {
      onShowToast?.(error instanceof Error ? error.message : 'Failed to save');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear Watch History',
      'Clear all watch history for this movie? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              await onClearAll();
              onShowToast?.('Watch history cleared');
              onClose();
            } catch (error) {
              onShowToast?.(error instanceof Error ? error.message : 'Failed to clear');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  // Format release date for display using timezone-safe utility
  const getFormattedReleaseDate = (): string => {
    if (!releaseDate) return '';
    return formatTmdbDate(releaseDate, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ModalBackground />
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={ACTIVE_OPACITY}
          onPress={onClose}
        />
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>When did you watch this?</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Movie Title */}
          <Text style={styles.movieTitle} numberOfLines={2}>
            {movieTitle}
          </Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Date Options */}
            <View style={styles.optionsContainer}>
              {/* Right Now */}
              <Pressable
                style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                onPress={handleRightNow}
                disabled={isLoading}
              >
                <View style={styles.optionIcon}>
                  <Clock size={20} color={COLORS.primary} />
                </View>
                <View style={styles.optionContent}>
                  <Text style={styles.optionTitle}>Right now</Text>
                  <Text style={styles.optionDescription}>Use current date and time</Text>
                </View>
              </Pressable>

              {/* Release Date (if available) */}
              {hasValidReleaseDate && (
                <Pressable
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                  onPress={handleReleaseDate}
                  disabled={isLoading}
                >
                  <View style={styles.optionIcon}>
                    <Calendar size={20} color={COLORS.primary} />
                  </View>
                  <View style={styles.optionContent}>
                    <View style={styles.optionTitleRow}>
                      <Text style={styles.optionTitle}>Release Date</Text>
                      {!isPremium && <PremiumBadge />}
                    </View>
                    <Text style={styles.optionDescription}>{getFormattedReleaseDate()}</Text>
                  </View>
                </Pressable>
              )}

              {/* Clear All (only if watched at least once) */}
              {watchCount > 0 && (
                <>
                  <View style={styles.divider} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.option,
                      styles.dangerOption,
                      pressed && styles.optionPressed,
                    ]}
                    onPress={handleClearAll}
                    disabled={isLoading}
                  >
                    <View style={styles.optionIcon}>
                      <Trash2 size={20} color={COLORS.error} />
                    </View>
                    <View style={styles.optionContent}>
                      <Text style={[styles.optionTitle, styles.dangerText]}>
                        Clear all watch history
                      </Text>
                      <Text style={styles.optionDescription}>
                        Remove all {watchCount} watch{watchCount !== 1 ? 'es' : ''}
                      </Text>
                    </View>
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>

          {/* Loading Overlay */}
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          )}
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
  content: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.l,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.m,
  },
  title: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  closeButton: {
    padding: SPACING.xs,
  },
  movieTitle: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    marginBottom: SPACING.l,
  },
  optionsContainer: {
    gap: SPACING.s,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.m,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
    gap: SPACING.m,
  },
  optionPressed: {
    opacity: ACTIVE_OPACITY,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionContent: {
    flex: 1,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  optionTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
    marginVertical: SPACING.s,
  },
  dangerOption: {
    borderWidth: 1,
    borderColor: COLORS.error,
    backgroundColor: 'transparent',
  },
  dangerText: {
    color: COLORS.error,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.l,
  },
});
