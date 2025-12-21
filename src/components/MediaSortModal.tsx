import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { BORDER_RADIUS, COLORS, FONT_SIZE, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { ArrowDown, ArrowUp, Check, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
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
  | 'alphabetical'
  | 'popularity';
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

const BASE_SORT_OPTIONS: { label: string; value: SortOption; defaultDirection: SortDirection }[] = [
  { label: 'Recently Added', value: 'recentlyAdded', defaultDirection: 'desc' },
  { label: 'Release Date', value: 'releaseDate', defaultDirection: 'desc' },
  { label: 'Rating', value: 'rating', defaultDirection: 'desc' },
  { label: 'Popularity', value: 'popularity', defaultDirection: 'desc' },
  { label: 'Alphabetically', value: 'alphabetical', defaultDirection: 'asc' },
];

const USER_RATING_OPTION = {
  label: 'Your Rating',
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
  let SORT_OPTIONS = showUserRatingOption
    ? [
        ...BASE_SORT_OPTIONS.slice(0, -1),
        USER_RATING_OPTION,
        BASE_SORT_OPTIONS[BASE_SORT_OPTIONS.length - 1],
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
    const sortOption = SORT_OPTIONS.find((o) => o.value === option);
    if (localSortState.option === option) {
      // Toggle direction if same option is selected
      setLocalSortState((prev) => ({
        ...prev,
        direction: prev.direction === 'asc' ? 'desc' : 'asc',
      }));
    } else {
      // Set new option with its default direction
      setLocalSortState({
        option,
        direction: sortOption?.defaultDirection ?? 'desc',
      });
    }
  };

  const handleApply = () => {
    onApplySort(localSortState);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ModalBackground />
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Sort By</Text>
            <Pressable onPress={onClose} hitSlop={HIT_SLOP.s}>
              <X size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.optionsContainer}>
            {SORT_OPTIONS.map((option) => {
              const isSelected = localSortState.option === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                  onPress={() => handleOptionSelect(option.value)}
                >
                  <View style={styles.optionContent}>
                    <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                      {option.label}
                    </Text>
                    {isSelected && (
                      <View style={styles.directionIndicator}>
                        {localSortState.direction === 'asc' ? (
                          <ArrowUp size={16} color={COLORS.primary} />
                        ) : (
                          <ArrowDown size={16} color={COLORS.primary} />
                        )}
                      </View>
                    )}
                  </View>
                  {isSelected && <Check size={20} color={COLORS.primary} />}
                </Pressable>
              );
            })}
          </View>

          <Pressable style={styles.applyButton} onPress={handleApply}>
            <Text style={styles.applyButtonText}>Apply</Text>
          </Pressable>
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
  optionsContainer: {
    gap: SPACING.s,
    marginBottom: SPACING.l,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  optionItemSelected: {
    borderColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}15`,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  optionText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
  },
  optionTextSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  directionIndicator: {
    opacity: 0.8,
  },
  applyButton: {
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.white,
    fontWeight: 'bold',
  },
});
