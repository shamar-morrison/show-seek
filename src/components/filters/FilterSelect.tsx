import {
  ACTIVE_OPACITY,
  COLORS,
  FONT_FAMILY,
  accentBorder,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { ArrowDown01Icon, Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, TouchableOpacity, Text, View } from 'react-native';
import { filterSelectStyles as styles, FILTER_SELECT_ITEM_HEIGHT } from './filterSelectStyles';

export interface SelectOption {
  label: string;
  value: any;
}

export interface FilterSelectProps {
  label: string;
  value: any;
  options: SelectOption[];
  onSelect: (val: any) => void;
  placeholder?: string;
  isActive?: boolean;
  testID?: string;
}

/**
 * Whether a select shows its "nothing chosen" look (muted text). Filters say so through
 * `isActive`, since defaults like "Any runtime" are real options rather than empty values.
 * Selects without `isActive` (e.g. sort order) fall back to treating null and 0 as unset.
 */
export function isUnsetSelectValue(value: unknown, isActive: boolean | undefined): boolean {
  if (isActive !== undefined) return !isActive;
  return value == null || value === 0;
}

/**
 * Single-select dropdown with a modal option list.
 * Shared by Discover and watchlist/custom-list filter UIs.
 * The modal header renders the field `label` directly.
 */
export function FilterSelect({
  label,
  value,
  options,
  onSelect,
  placeholder,
  isActive,
  testID,
}: FilterSelectProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [visible, setVisible] = useState(false);
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <View style={styles.selectContainer}>
      <Text style={styles.selectLabel}>{label}</Text>
      <TouchableOpacity
        style={[styles.selectButton, isActive && { borderColor: accentBorder(accentColor) }]}
        onPress={() => setVisible(true)}
        activeOpacity={ACTIVE_OPACITY}
        accessibilityRole="button"
        accessibilityLabel={selectedOption ? `${label}: ${selectedOption.label}` : label}
        testID={testID}
      >
        <Text
          style={[
            styles.selectButtonText,
            isUnsetSelectValue(value, isActive) && { color: COLORS.textSecondary },
          ]}
          numberOfLines={1}
        >
          {selectedOption ? selectedOption.label : (placeholder ?? t('filters.selectPlaceholder'))}
        </Text>
        <AppIcon icon={ArrowDown01Icon} size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>

      <FilterSelectModal
        visible={visible}
        onClose={() => setVisible(false)}
        label={label}
        value={value}
        options={options}
        onSelect={onSelect}
      />
    </View>
  );
}

export interface FilterSelectModalProps {
  visible: boolean;
  onClose: () => void;
  label: string;
  value: any;
  options: SelectOption[];
  /** Called with the tapped option; the modal then closes. */
  onSelect: (val: any) => void;
  testID?: string;
}

/**
 * The option list of `FilterSelect` on its own, so a filter chip can open it directly.
 * The header renders the field `label`; tapping an option selects it and closes.
 */
export function FilterSelectModal({
  visible,
  onClose,
  label,
  value,
  options,
  onSelect,
  testID,
}: FilterSelectModalProps) {
  const { accentColor } = useAccentColor();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
      testID={testID}
    >
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label}</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={ACTIVE_OPACITY}>
              <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={options}
            keyExtractor={(item) => String(item.value)}
            getItemLayout={(_, index) => ({
              length: FILTER_SELECT_ITEM_HEIGHT,
              offset: FILTER_SELECT_ITEM_HEIGHT * index,
              index,
            })}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.optionItem}
                activeOpacity={ACTIVE_OPACITY}
                onPress={() => {
                  onSelect(item.value);
                  onClose();
                }}
              >
                <Text
                  style={[
                    styles.optionText,
                    item.value === value && {
                      color: accentColor,
                      fontFamily: FONT_FAMILY.semiBold,
                    },
                  ]}
                >
                  {item.label}
                </Text>
                {item.value === value && (
                  <AppIcon icon={Tick02Icon} size={20} color={accentColor} />
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
