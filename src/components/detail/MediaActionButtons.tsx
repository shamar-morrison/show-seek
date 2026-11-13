import RatingButton from '@/src/components/RatingButton';
import { getListMembershipTint } from '@/src/utils/listIcons';
import ReminderButton from '@/src/components/ReminderButton';
import { ACTIVE_OPACITY, COLORS, hexToRGBA } from '@/src/constants/theme';
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
import { useDetailActionOrder } from '@/src/hooks/useDetailActionOrder';
import type { DetailActionButtonId } from '@/src/utils/detailActionOrder';
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
 * Displays Add to List, Rating, Reminder (optional), Notes and Share Card (optional) in the order
 * chosen in Settings, then the Watch Trailer button.
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
  const order = useDetailActionOrder();

  // Glassmorphism active-state tints (mirrors show-seek-web action buttons).
  const listTintStyle = isInAnyList
    ? getListMembershipTint({ color: listColor ?? COLORS.success })
    : undefined;
  const ratedTintStyle =
    userRating > 0
      ? {
          backgroundColor: hexToRGBA(accentColor, 0.15),
          borderColor: hexToRGBA(accentColor, 0.5),
        }
      : undefined;
  const reminderTintStyle = hasReminder
    ? {
        backgroundColor: hexToRGBA(accentColor, 0.15),
        borderColor: hexToRGBA(accentColor, 0.5),
      }
    : undefined;

  // Each button, or null where it doesn't apply on this page (reminder, share card).
  const buttons: Record<DetailActionButtonId, React.ReactNode> = {
    list: (
      <TouchableOpacity
        key="list"
        style={[styles.addButton, listTintStyle]}
        activeOpacity={ACTIVE_OPACITY}
        onPress={onAddToList}
        disabled={isLoadingLists}
        testID="detail-action-list"
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
    ),
    rating: (
      <View
        key="rating"
        style={[styles.ratingButtonContainer, ratedTintStyle]}
        testID="detail-action-rating"
      >
        <RatingButton onPress={onRate} isRated={userRating > 0} isLoading={isLoadingRating} />
      </View>
    ),
    reminder: onReminder ? (
      <View
        key="reminder"
        style={[styles.ratingButtonContainer, reminderTintStyle]}
        testID="detail-action-reminder"
      >
        <ReminderButton
          onPress={onReminder}
          hasReminder={hasReminder}
          isLoading={isLoadingReminder}
        />
      </View>
    ) : null,
    note: (
      <View key="note" style={styles.ratingButtonContainer} testID="detail-action-note">
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
    ),
    shareCard: onShareCard ? (
      <View key="shareCard" style={styles.ratingButtonContainer} testID="detail-action-shareCard">
        <TouchableOpacity
          style={styles.actionButtonTouchable}
          activeOpacity={ACTIVE_OPACITY}
          onPress={onShareCard}
          accessibilityRole="button"
          accessibilityLabel={t('shareCard.title')}
        >
          <AppIcon icon={Image01Icon} size={24} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    ) : null,
  };

  return (
    <View style={styles.actionButtons}>
      {/* Secondary action buttons, in the order chosen in Settings */}
      <View style={styles.secondaryActionsRow}>{order.map((id) => buttons[id])}</View>

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
