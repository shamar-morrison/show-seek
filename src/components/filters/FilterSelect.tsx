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
  isActive = false,
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
      >
        <Text
          style={[
            styles.selectButtonText,
            (value == null || value === 0) && { color: COLORS.textSecondary },
          ]}
        >
          {selectedOption ? selectedOption.label : (placeholder ?? t('filters.selectPlaceholder'))}
        </Text>
        <AppIcon icon={ArrowDown01Icon} size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setVisible(false)} activeOpacity={ACTIVE_OPACITY}>
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
                    setVisible(false);
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
    </View>
  );
}
