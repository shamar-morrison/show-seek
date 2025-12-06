import { BlurView } from 'expo-blur';
import { ArrowDown, ArrowUp, Check, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '../constants/theme';

export type SortOption = 'recentlyAdded' | 'releaseDate' | 'rating' | 'alphabetical';
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  option: SortOption;
  direction: SortDirection;
}

export const DEFAULT_SORT_STATE: SortState = {
  option: 'recentlyAdded',
  direction: 'desc',
};

interface MediaSortModalProps {
  visible: boolean;
  onClose: () => void;
  sortState: SortState;
  onApplySort: (sortState: SortState) => void;
}

const SORT_OPTIONS: { label: string; value: SortOption; defaultDirection: SortDirection }[] = [
  { label: 'Recently Added', value: 'recentlyAdded', defaultDirection: 'desc' },
  { label: 'Release Date', value: 'releaseDate', defaultDirection: 'desc' },
  { label: 'Rating', value: 'rating', defaultDirection: 'desc' },
  { label: 'Alphabetically', value: 'alphabetical', defaultDirection: 'asc' },
];

export default function MediaSortModal({
  visible,
  onClose,
  sortState,
  onApplySort,
}: MediaSortModalProps) {
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
        <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>Sort By</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={ACTIVE_OPACITY}>
              <X size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.optionsContainer}>
            {SORT_OPTIONS.map((option) => {
              const isSelected = localSortState.option === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.optionItem, isSelected && styles.optionItemSelected]}
                  activeOpacity={ACTIVE_OPACITY}
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
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.applyButton}
            onPress={handleApply}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={styles.applyButtonText}>Apply</Text>
          </TouchableOpacity>
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
