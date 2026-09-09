import { ModalBackground } from '@/src/components/ui/ModalBackground';
import {
  FilterSelect,
  MultiSelectFilter,
  SelectOption,
} from '@/src/components/filters';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { modalHeaderStyles, modalLayoutStyles } from '@/src/styles/modalStyles';
import { DEFAULT_WATCH_STATUS_FILTERS, WatchStatusFilterState } from '@/src/utils/listFilters';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import React, { useState } from 'react';
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

interface WatchStatusFiltersModalProps {
  visible: boolean;
  onClose: () => void;
  filters: WatchStatusFilterState;
  onApplyFilters: (filters: WatchStatusFilterState) => void;
  genreMap: Record<number, string>;
  /** Whether to show the media type filter. Defaults to true. Set to false for single-type screens. */
  showMediaTypeFilter?: boolean;
}

export default function WatchStatusFiltersModal({
  visible,
  onClose,
  filters,
  onApplyFilters,
  genreMap,
  showMediaTypeFilter = true,
}: WatchStatusFiltersModalProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [localFilters, setLocalFilters] = useState<WatchStatusFilterState>(filters);

  // Update local filters when modal opens
  React.useEffect(() => {
    if (visible) {
      setLocalFilters(filters);
    }
  }, [visible, filters]);

  const updateFilter = <K extends keyof WatchStatusFilterState>(
    key: K,
    value: WatchStatusFilterState[K]
  ) => {
    setLocalFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApply = () => {
    onApplyFilters(localFilters);
  };

  const handleClear = () => {
    setLocalFilters(DEFAULT_WATCH_STATUS_FILTERS);
  };

  // Genre options (multi-select, matching Discover)
  const genreOptions = Object.entries(genreMap)
    .map(([id, name]) => ({ label: name, value: Number(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Year options
  const currentYear = new Date().getFullYear();
  const yearOptions = [
    { label: t('discover.anyYear'), value: null },
    ...Array.from({ length: currentYear - 1949 }, (_, i) => {
      const year = currentYear - i;
      return { label: String(year), value: year };
    }),
  ];

  const ratingOptions: SelectOption[] = [
    { label: t('filters.anyRating'), value: 0 },
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => ({
      label: t('filters.starsPlus', { count: value }),
      value,
    })),
  ];

  const mediaTypeOptions: SelectOption[] = [
    { label: t('library.allMedia'), value: 'all' },
    { label: t('media.movies'), value: 'movie' },
    { label: t('media.tvShows'), value: 'tv' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={modalLayoutStyles.container}
      >
        <ModalBackground />
        <TouchableOpacity style={modalLayoutStyles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={modalLayoutStyles.card}>
          <View style={modalHeaderStyles.header}>
            <Text style={modalHeaderStyles.title}>{t('library.filterLists')}</Text>
            <Pressable onPress={onClose} hitSlop={HIT_SLOP.m}>
              <AppIcon icon={Cancel01Icon} size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.filtersContainer}>
            {showMediaTypeFilter && (
              <FilterSelect
                label={t('filters.mediaType')}
                value={localFilters.mediaType}
                options={mediaTypeOptions}
                onSelect={(val) => updateFilter('mediaType', val)}
              />
            )}

            <MultiSelectFilter
              label={t('discover.genres')}
              selectedIds={localFilters.genres}
              operator={localFilters.genreOperator}
              showOperatorTabs
              operatorTestID="genre-operator-toggle"
              options={genreOptions}
              onApply={(ids, op) =>
                setLocalFilters((prev) => ({ ...prev, genres: ids, genreOperator: op }))
              }
              placeholder={t('discover.anyGenre')}
              isActive={localFilters.genres.length > 0}
            />

            <FilterSelect
              label={t('discover.rating')}
              value={localFilters.rating}
              options={ratingOptions}
              onSelect={(val) => updateFilter('rating', val)}
            />

            <FilterSelect
              label={t('discover.releaseYear')}
              value={localFilters.year}
              options={yearOptions}
              onSelect={(val) => updateFilter('year', val)}
              placeholder={t('discover.anyYear')}
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClear}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={styles.clearButtonText}>{t('common.clearAll')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyButton, { backgroundColor: accentColor }]}
              onPress={handleApply}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={styles.applyButtonText}>{t('common.apply')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  filtersContainer: {
    gap: SPACING.m,
    marginBottom: SPACING.l,
  },
  actions: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  clearButton: {
    flex: 1,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
  },
  applyButton: {
    flex: 1,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.white,
    fontFamily: FONT_FAMILY.bold,
  },
});
