import { FilterSelect } from '@/src/components/filters';
import { ModalBackground } from '@/src/components/ui/ModalBackground';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

export type SortOption =
  | 'recentlyAdded'
  | 'releaseDate'
  | 'rating'
  | 'userRating'
  | 'runtime'
  | 'alphabetical'
  | 'popularity'
  | 'progress'
  | 'lastWatched'
  | 'dateAdded'
  | 'lastUpdated';
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  option: SortOption;
  direction: SortDirection;
}

export const DEFAULT_SORT_STATE: SortState = {
  option: 'recentlyAdded',
  direction: 'desc',
};

/** Sort options for rating screens (excludes popularity since it's not stored in Firebase) */
export const RATING_SCREEN_SORT_OPTIONS: SortOption[] = [
  'recentlyAdded',
  'releaseDate',
  'rating',
  'userRating',
  'alphabetical',
];

interface MediaSortModalProps {
  visible: boolean;
  onClose: () => void;
  sortState: SortState;
  onApplySort: (sortState: SortState) => void;
  showUserRatingOption?: boolean;
  allowedOptions?: SortOption[];
}

const BASE_SORT_OPTIONS: {
  labelKey: string;
  value: SortOption;
  defaultDirection: SortDirection;
}[] = [
  { labelKey: 'sort.recentlyAdded', value: 'recentlyAdded', defaultDirection: 'desc' },
  { labelKey: 'discover.releaseDate', value: 'releaseDate', defaultDirection: 'desc' },
  { labelKey: 'sort.tmdbRating', value: 'rating', defaultDirection: 'desc' },
  { labelKey: 'discover.popularity', value: 'popularity', defaultDirection: 'desc' },
  { labelKey: 'sort.progress', value: 'progress', defaultDirection: 'desc' },
  { labelKey: 'sort.lastWatched', value: 'lastWatched', defaultDirection: 'desc' },
  { labelKey: 'sort.dateAdded', value: 'dateAdded', defaultDirection: 'desc' },
  { labelKey: 'sort.lastUpdated', value: 'lastUpdated', defaultDirection: 'desc' },
  { labelKey: 'sort.runtime', value: 'runtime', defaultDirection: 'desc' },
  { labelKey: 'sort.alphabetical', value: 'alphabetical', defaultDirection: 'asc' },
];

/** Sort options for list screens (custom lists, watch status lists, favorites) */
export const LIST_SORT_OPTIONS: SortOption[] = [
  'recentlyAdded',
  'releaseDate',
  'rating',
  'userRating',
  'runtime',
  'alphabetical',
];

/** Sort options for notes screens */
export const NOTES_SCREEN_SORT_OPTIONS: SortOption[] = ['dateAdded', 'lastUpdated', 'alphabetical'];

type OrderLabels = Record<SortDirection, string>;

const DATE_ORDER: OrderLabels = {
  desc: 'sort.directions.newestFirst',
  asc: 'sort.directions.oldestFirst',
};
const NUMBER_ORDER: OrderLabels = {
  desc: 'sort.directions.highestFirst',
  asc: 'sort.directions.lowestFirst',
};

/**
 * What each direction means for each sort, in plain words. Every screen sorts ascending as
 * oldest / lowest / shortest / A first, so these labels hold wherever the modal is used.
 */
const ORDER_LABELS: Record<SortOption, OrderLabels> = {
  recentlyAdded: DATE_ORDER,
  releaseDate: DATE_ORDER,
  lastWatched: DATE_ORDER,
  dateAdded: DATE_ORDER,
  lastUpdated: DATE_ORDER,
  rating: NUMBER_ORDER,
  userRating: NUMBER_ORDER,
  popularity: NUMBER_ORDER,
  progress: NUMBER_ORDER,
  runtime: { desc: 'sort.directions.longestFirst', asc: 'sort.directions.shortestFirst' },
  alphabetical: { asc: 'sort.directions.aToZ', desc: 'sort.directions.zToA' },
};

const USER_RATING_OPTION = {
  labelKey: 'media.userRating',
  value: 'userRating' as SortOption,
  defaultDirection: 'desc' as SortDirection,
};

export default function MediaSortModal({
  visible,
  onClose,
  sortState,
  onApplySort,
  showUserRatingOption = false,
  allowedOptions,
}: MediaSortModalProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  // Your Rating sits right after TMDB Rating so the two ratings read together.
  const ratingIndex = BASE_SORT_OPTIONS.findIndex((o) => o.value === 'rating');
  let SORT_OPTIONS = showUserRatingOption
    ? [
        ...BASE_SORT_OPTIONS.slice(0, ratingIndex + 1),
        USER_RATING_OPTION,
        ...BASE_SORT_OPTIONS.slice(ratingIndex + 1),
      ]
    : [...BASE_SORT_OPTIONS];

  // Filter options if allowedOptions is provided
  if (allowedOptions) {
    SORT_OPTIONS = SORT_OPTIONS.filter((opt) => allowedOptions.includes(opt.value));
  }
  const [localSortState, setLocalSortState] = useState<SortState>(sortState);

  // Update local state when modal opens
  useEffect(() => {
    if (visible) {
      setLocalSortState(sortState);
    }
  }, [visible, sortState]);

  const handleOptionSelect = (option: SortOption) => {
    if (localSortState.option === option) return;
    // A new sort starts in its natural order (newest / highest / A first).
    const sortOption = SORT_OPTIONS.find((o) => o.value === option);
    setLocalSortState({
      option,
      direction: sortOption?.defaultDirection ?? 'desc',
    });
  };

  const handleDirectionSelect = (direction: SortDirection) => {
    setLocalSortState((prev) => ({ ...prev, direction }));
  };

  // The selected sort's natural order is listed first.
  const selectedOption = SORT_OPTIONS.find((o) => o.value === localSortState.option);
  const defaultDirection = selectedOption?.defaultDirection ?? 'desc';
  const directions: SortDirection[] =
    defaultDirection === 'asc' ? ['asc', 'desc'] : ['desc', 'asc'];
  const orderLabels = ORDER_LABELS[localSortState.option] ?? DATE_ORDER;

  // Nothing to apply when the choice matches the sort already in use.
  const canApply =
    localSortState.option !== sortState.option || localSortState.direction !== sortState.direction;

  const handleApply = () => {
    if (!canApply) return;
    onApplySort(localSortState);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={modalLayoutStyles.container}
      >
        <ModalBackground />
        <TouchableOpacity style={modalLayoutStyles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={modalLayoutStyles.card}>
          <View style={[modalHeaderStyles.header, styles.header]}>
            <Text style={modalHeaderStyles.title}>{t('sort.title')}</Text>
            <Pressable onPress={onClose} hitSlop={HIT_SLOP.m}>
              <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.fields}>
            <FilterSelect
              label={t('discover.sortBy')}
              value={localSortState.option}
              options={SORT_OPTIONS.map((option) => ({
                label: t(option.labelKey),
                value: option.value,
              }))}
              onSelect={(value: SortOption) => handleOptionSelect(value)}
              testID="sort-by-select"
            />
            <FilterSelect
              label={t('sort.orderTitle')}
              value={localSortState.direction}
              options={directions.map((direction) => ({
                label: t(orderLabels[direction]),
                value: direction,
              }))}
              onSelect={(value: SortDirection) => handleDirectionSelect(value)}
              testID="sort-order-select"
            />
          </View>

          <Pressable
            style={[
              styles.applyButton,
              { backgroundColor: accentColor },
              !canApply && styles.applyButtonDisabled,
            ]}
            onPress={handleApply}
            disabled={!canApply}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canApply }}
            testID="sort-apply-button"
          >
            <Text style={styles.applyButtonText}>{t('common.apply')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: SPACING.m,
  },
  fields: {
    gap: SPACING.m,
    marginBottom: SPACING.l,
  },
  applyButton: {
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
  },
});
