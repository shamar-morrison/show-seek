import { getImageUrl } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
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
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { filterSelectStyles as styles, FILTER_SELECT_ITEM_HEIGHT } from './filterSelectStyles';

export type GenreOperator = 'and' | 'or';

export interface MultiSelectOption {
  label: string;
  value: number;
  /** TMDB logo path for the option (streaming providers); omit for text-only rows */
  logoPath?: string | null;
}

export interface MultiSelectFilterProps {
  label: string;
  selectedIds: number[];
  options: MultiSelectOption[];
  onApply: (ids: number[], operator: GenreOperator) => void;
  placeholder?: string;
  isActive?: boolean;
  /** Initial And/Or operator (only used when showOperatorTabs is true) */
  operator?: GenreOperator;
  /** Show the And/Or combination tabs once the draft is non-empty (genres only) */
  showOperatorTabs?: boolean;
  operatorTestID?: string;
  /** Show a search box above the options (streaming providers) */
  searchable?: boolean;
  searchPlaceholder?: string;
}

/**
 * Staged multi-select picker with checkboxes, optional option logos, an
 * optional search box, and an optional And/Or combination toggle.
 * Selection is staged in draft state and committed via Apply, so toggling
 * options doesn't refetch the discover query on every tap; closing via the
 * X button or backdrop discards the draft. Clear + Apply appear in a footer
 * once there is something to confirm.
 *
 * Shared by Discover (genres, streaming providers) and
 * watchlist/custom-list genre filters.
 */
export function MultiSelectFilter({
  label,
  selectedIds,
  options,
  onApply,
  placeholder,
  isActive = false,
  operator = 'or',
  showOperatorTabs = false,
  operatorTestID,
  searchable = false,
  searchPlaceholder,
}: MultiSelectFilterProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [visible, setVisible] = useState(false);
  const [draftIds, setDraftIds] = useState<number[]>(selectedIds);
  const [draftOperator, setDraftOperator] = useState<GenreOperator>(operator);
  const [searchQuery, setSearchQuery] = useState('');

  // Snapshot committed selection into the draft each time the modal opens.
  useEffect(() => {
    if (visible) {
      setDraftIds(selectedIds);
      setDraftOperator(operator);
    }
  }, [visible, selectedIds, operator]);

  const draftSet = useMemo(() => new Set(draftIds), [draftIds]);
  const showLogos = useMemo(() => options.some((opt) => opt.logoPath), [options]);
  const filteredOptions = useMemo(() => {
    if (!searchable || !searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase().trim();
    return options.filter((opt) => opt.label.toLowerCase().includes(query));
  }, [options, searchable, searchQuery]);
  const buttonLabel = useMemo(() => {
    if (selectedIds.length === 0) return placeholder ?? t('filters.selectPlaceholder');
    const selectedSet = new Set(selectedIds);
    const names = options.filter((opt) => selectedSet.has(opt.value)).map((opt) => opt.label);
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }, [selectedIds, options, placeholder, t]);

  const handleClose = () => {
    setVisible(false);
    setSearchQuery('');
  };

  const handleToggleDraft = (id: number) => {
    setDraftIds((prev) =>
      prev.includes(id) ? prev.filter((genreId) => genreId !== id) : [...prev, id]
    );
  };

  const handleClearDraft = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDraftIds([]);
    setDraftOperator('or');
  };

  const handleApply = () => {
    onApply(draftIds, draftOperator);
    handleClose();
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
            selectedIds.length === 0 && { color: COLORS.textSecondary },
          ]}
          numberOfLines={1}
        >
          {buttonLabel}
        </Text>
        <AppIcon icon={ArrowDown01Icon} size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>

      <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={handleClose}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleClose}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={handleClose} activeOpacity={ACTIVE_OPACITY}>
                <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            {showOperatorTabs && draftIds.length > 0 && (
              <SegmentedControl
                options={[
                  { key: 'and', label: t('discover.and') },
                  { key: 'or', label: t('discover.or') },
                ]}
                activeKey={draftOperator}
                onChange={setDraftOperator}
                testID={operatorTestID}
                style={styles.operatorToggle}
              />
            )}
            {searchable && (
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
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    activeOpacity={ACTIVE_OPACITY}
                  >
                    <AppIcon icon={Cancel01Icon} size={18} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                )}
              </View>
            )}
            <FlatList
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
              renderItem={({ item }) => {
                const isSelected = draftSet.has(item.value);
                return (
                  <TouchableOpacity
                    style={styles.optionItem}
                    activeOpacity={ACTIVE_OPACITY}
                    onPress={() => handleToggleDraft(item.value)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSelected }}
                    accessibilityLabel={item.label}
                  >
                    <View style={styles.optionLabelGroup}>
                      <View
                        style={[
                          styles.checkbox,
                          isSelected && {
                            backgroundColor: accentColor,
                            borderColor: accentColor,
                          },
                        ]}
                      >
                        {isSelected && <AppIcon icon={Tick02Icon} size={14} color={COLORS.white} />}
                      </View>
                      {showLogos &&
                        (item.logoPath ? (
                          <MediaImage
                            source={{ uri: getImageUrl(item.logoPath, '/w92') }}
                            style={styles.optionLogo}
                            contentFit="contain"
                            cachePolicy="memory-disk"
                          />
                        ) : (
                          <View style={styles.optionLogo} />
                        ))}
                      <Text
                        style={[
                          styles.optionText,
                          isSelected && {
                            color: accentColor,
                            fontFamily: FONT_FAMILY.semiBold,
                          },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
            {(draftIds.length > 0 || selectedIds.length > 0) && (
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.footerClearButton}
                  onPress={handleClearDraft}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <AppIcon icon={Cancel01Icon} size={18} color={COLORS.textSecondary} />
                  <Text style={styles.clearButtonText}>{t('common.clear')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.footerApplyButton, { backgroundColor: accentColor }]}
                  onPress={handleApply}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <Text style={styles.footerApplyButtonText}>{t('common.apply')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
