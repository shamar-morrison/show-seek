import {
  ACTIVE_OPACITY,
  COLORS,
  FONT_FAMILY,
  accentBorder,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { AppIcon } from '@/src/components/ui/AppIcon';
import {
  ArrowDown01Icon,
  Cancel01Icon,
  Search01Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { filterSelectStyles as styles, FILTER_SELECT_ITEM_HEIGHT } from './filterSelectStyles';
import { FilterSelectProps } from './FilterSelect';

export interface SearchableFilterSelectProps extends FilterSelectProps {
  searchPlaceholder?: string;
}

/**
 * Single-select dropdown with a search box above the options.
 * Shared by Discover and watchlist/custom-list filter UIs.
 */
export function SearchableFilterSelect({
  label,
  value,
  options,
  onSelect,
  placeholder,
  isActive = false,
  searchPlaceholder,
}: SearchableFilterSelectProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [visible, setVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase().trim();
    return options.filter((opt) => opt.label.toLowerCase().includes(query));
  }, [options, searchQuery]);

  const handleClose = () => {
    setVisible(false);
    setSearchQuery('');
  };

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
          numberOfLines={1}
        >
          {selectedOption ? selectedOption.label : (placeholder ?? t('filters.selectPlaceholder'))}
        </Text>
        <AppIcon icon={ArrowDown01Icon} size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>

      <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={handleClose}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleClose}>
          <View style={styles.searchableModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={handleClose} activeOpacity={ACTIVE_OPACITY}>
                <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchContainer}>
              <AppIcon icon={Search01Icon} size={18} color={COLORS.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder={searchPlaceholder ?? t('filters.searchPlaceholder')}
                placeholderTextColor={COLORS.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} activeOpacity={ACTIVE_OPACITY}>
                  <AppIcon icon={Cancel01Icon} size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              style={styles.searchableList}
              data={filteredOptions}
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
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>{t('common.noResults')}</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.optionItem}
                  activeOpacity={ACTIVE_OPACITY}
                  onPress={() => {
                    onSelect(item.value);
                    handleClose();
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
