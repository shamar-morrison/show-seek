import RatingButton from '@/src/components/RatingButton';
import ReminderButton from '@/src/components/ReminderButton';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  Image01Icon,
  NoteDoneIcon,
  PlayIcon,
  PlusSignIcon,
  Note01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { useDetailStyles } from './detailStyles';

export interface MediaActionButtonsProps {
  // Action callbacks
  onAddToList: () => void;
  onRate: () => void;
  onReminder?: () => void; // Optional - only shown if provided
  onNote: () => void;
  onTrailer: () => void;
  onShareCard?: () => void; // Optional - share card action

  // Add to List state
  isInAnyList: boolean;
  isLoadingLists: boolean;
  listIcon?: IconSvgElement;
  listColor?: string;

  // Rating state
  userRating: number;
  isLoadingRating: boolean;

  // Reminder state (only needed if onReminder is provided)
  hasReminder?: boolean;
  isLoadingReminder?: boolean;

  // Note state
  hasNote: boolean;
  isLoadingNote: boolean;

  // Trailer state
  hasTrailer: boolean;
}

/**
 * Shared action buttons row for media detail screens.
 * Displays Add to List, Rating, Reminder (optional), Notes, Share Card (optional), and Watch Trailer buttons.
 */
export function MediaActionButtons({
  onAddToList,
  onRate,
  onReminder,
  onNote,
  onTrailer,
  onShareCard,
  isInAnyList,
  isLoadingLists,
  listIcon,
  listColor,
  userRating,
  isLoadingRating,
  hasReminder = false,
  isLoadingReminder = false,
  hasNote,
  isLoadingNote,
  hasTrailer,
}: MediaActionButtonsProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const styles = useDetailStyles();

  return (
    <View style={styles.actionButtons}>
      {/* Secondary Action Buttons Row */}
      <View style={styles.secondaryActionsRow}>
        {/* Add to List Button */}
        <TouchableOpacity
          style={[
            styles.addButton,
            isInAnyList && styles.addedButton,
            isInAnyList && listColor ? { backgroundColor: listColor } : undefined,
          ]}
          activeOpacity={ACTIVE_OPACITY}
          onPress={onAddToList}
          disabled={isLoadingLists}
        >
          {isLoadingLists ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : isInAnyList ? (
            listIcon ? (
              <AppIcon icon={listIcon} size={24} color={COLORS.white} />
            ) : (
              <AppIcon icon={Tick02Icon} size={24} color={COLORS.white} />
            )
          ) : (
            <AppIcon icon={PlusSignIcon} size={24} color={COLORS.white} />
          )}
        </TouchableOpacity>

        {/* Rating Button */}
        <View style={styles.ratingButtonContainer}>
          <RatingButton onPress={onRate} isRated={userRating > 0} isLoading={isLoadingRating} />
        </View>

        {/* Reminder Button (optional) */}
        {onReminder && (
          <View style={styles.ratingButtonContainer}>
            <ReminderButton
              onPress={onReminder}
              hasReminder={hasReminder}
              isLoading={isLoadingReminder}
            />
          </View>
        )}

        {/* Notes Button */}
        <View style={styles.ratingButtonContainer}>
          <TouchableOpacity
            style={styles.actionButtonTouchable}
            activeOpacity={ACTIVE_OPACITY}
            onPress={onNote}
            disabled={isLoadingNote}
          >
            {isLoadingNote ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : hasNote ? (
              <AppIcon icon={NoteDoneIcon} size={24} color={accentColor} />
            ) : (
              <AppIcon icon={Note01Icon} size={24} color={COLORS.white} />
            )}
          </TouchableOpacity>
        </View>

        {/* Share Card Button (optional) */}
        {onShareCard && (
          <View style={styles.ratingButtonContainer}>
            <TouchableOpacity
              style={styles.actionButtonTouchable}
              activeOpacity={ACTIVE_OPACITY}
              onPress={onShareCard}
            >
              <AppIcon icon={Image01Icon} size={24} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Watch Trailer Button Row */}
      <View style={styles.trailerButtonRow}>
        <TouchableOpacity
          style={[styles.playButton, !hasTrailer && styles.disabledButton]}
          onPress={onTrailer}
          disabled={!hasTrailer}
          activeOpacity={ACTIVE_OPACITY}
        >
          <AppIcon icon={PlayIcon} size={18} color={COLORS.white} fill={COLORS.white} />
          <Text style={styles.playButtonText}>{t('media.watchTrailer')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
