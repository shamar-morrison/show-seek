import RatingButton from '@/src/components/RatingButton';
import ReminderButton from '@/src/components/ReminderButton';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { Check, ImageIcon, LucideIcon, Pencil, Play, Plus, StickyNote } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { detailStyles } from './detailStyles';

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
  listIcon?: LucideIcon;
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

  return (
    <View style={detailStyles.actionButtons}>
      {/* Secondary Action Buttons Row */}
      <View style={detailStyles.secondaryActionsRow}>
        {/* Add to List Button */}
        <TouchableOpacity
          style={[
            detailStyles.addButton,
            isInAnyList && detailStyles.addedButton,
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
              React.createElement(listIcon, { size: 24, color: COLORS.white })
            ) : (
              <Check size={24} color={COLORS.white} />
            )
          ) : (
            <Plus size={24} color={COLORS.white} />
          )}
        </TouchableOpacity>

        {/* Rating Button */}
        <View style={detailStyles.ratingButtonContainer}>
          <RatingButton onPress={onRate} isRated={userRating > 0} isLoading={isLoadingRating} />
        </View>

        {/* Reminder Button (optional) */}
        {onReminder && (
          <View style={detailStyles.ratingButtonContainer}>
            <ReminderButton
              onPress={onReminder}
              hasReminder={hasReminder}
              isLoading={isLoadingReminder}
            />
          </View>
        )}

        {/* Notes Button */}
        <View style={detailStyles.ratingButtonContainer}>
          <TouchableOpacity
            style={detailStyles.actionButtonTouchable}
            activeOpacity={ACTIVE_OPACITY}
            onPress={onNote}
            disabled={isLoadingNote}
          >
            {isLoadingNote ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : hasNote ? (
              <Pencil size={24} color={COLORS.white} />
            ) : (
              <StickyNote size={24} color={COLORS.white} />
            )}
          </TouchableOpacity>
        </View>

        {/* Share Card Button (optional) */}
        {onShareCard && (
          <View style={detailStyles.ratingButtonContainer}>
            <TouchableOpacity
              style={detailStyles.actionButtonTouchable}
              activeOpacity={ACTIVE_OPACITY}
              onPress={onShareCard}
            >
              <ImageIcon size={24} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Watch Trailer Button Row */}
      <View style={detailStyles.trailerButtonRow}>
        <TouchableOpacity
          style={[detailStyles.playButton, !hasTrailer && detailStyles.disabledButton]}
          onPress={onTrailer}
          disabled={!hasTrailer}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Play size={18} color={COLORS.white} fill={COLORS.white} />
          <Text style={detailStyles.playButtonText}>{t('media.watchTrailer')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
