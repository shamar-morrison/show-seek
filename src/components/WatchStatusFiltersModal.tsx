import { ModalBackground } from '@/src/components/ui/ModalBackground';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { DEFAULT_WATCH_STATUS_FILTERS, WatchStatusFilterState } from '@/src/utils/listFilters';
import { Check, ChevronDown, X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

interface WatchStatusFiltersModalProps {
  visible: boolean;
  onClose: () => void;
  filters: WatchStatusFilterState;
  onApplyFilters: (filters: WatchStatusFilterState) => void;
  genreMap: Record<number, string>;
}

const RATING_OPTIONS = [
  { label: 'Any Rating', value: 0 },
  { label: '5+ Stars', value: 5 },
  { label: '6+ Stars', value: 6 },
  { label: '7+ Stars', value: 7 },
  { label: '8+ Stars', value: 8 },
  { label: '9+ Stars', value: 9 },
];

const ITEM_HEIGHT = 56;

interface SelectOption {
  label: string;
  value: any;
}

const FilterSelect = ({
  label,
  value,
  options,
  onSelect,
  placeholder = 'Select...',
}: {
  label: string;
  value: any;
  options: SelectOption[];
  onSelect: (val: any) => void;
  placeholder?: string;
}) => {
  const [visible, setVisible] = useState(false);
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <View style={styles.selectContainer}>
      <Text style={styles.selectLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.selectButton}
        onPress={() => setVisible(true)}
        activeOpacity={ACTIVE_OPACITY}
      >
        <Text style={[styles.selectButtonText, !selectedOption && { color: COLORS.textSecondary }]}>
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <ChevronDown size={20} color={COLORS.textSecondary} />
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
              <Text style={styles.modalTitle}>Select {label}</Text>
              <Pressable onPress={() => setVisible(false)}>
                <X size={24} color={COLORS.text} />
              </Pressable>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => String(item.value)}
              getItemLayout={(_, index) => ({
                length: ITEM_HEIGHT,
                offset: ITEM_HEIGHT * index,
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
                    style={[styles.optionText, item.value === value && styles.optionTextSelected]}
                  >
                    {item.label}
                  </Text>
                  {item.value === value && <Check size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default function WatchStatusFiltersModal({
  visible,
  onClose,
  filters,
  onApplyFilters,
  genreMap,
}: WatchStatusFiltersModalProps) {
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

  // Genre options
  const genreOptions = [
    { label: 'All Genres', value: null },
    ...Object.entries(genreMap)
      .map(([id, name]) => ({ label: name, value: Number(id) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];

  // Year options
  const currentYear = new Date().getFullYear();
  const yearOptions = [
    { label: 'All Years', value: null },
    ...Array.from({ length: currentYear - 1949 }, (_, i) => {
      const year = currentYear - i;
      return { label: String(year), value: year };
    }),
  ];

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
            <Text style={styles.title}>Filter Lists</Text>
            <Pressable onPress={onClose}>
              <X size={24} color={COLORS.text} />
            </Pressable>
          </View>

          <View style={styles.filtersContainer}>
            <FilterSelect
              label="Genre"
              value={localFilters.genre}
              options={genreOptions}
              onSelect={(val) => updateFilter('genre', val)}
              placeholder="All Genres"
            />

            <FilterSelect
              label="Rating"
              value={localFilters.rating}
              options={RATING_OPTIONS}
              onSelect={(val) => updateFilter('rating', val)}
            />

            <FilterSelect
              label="Release Year"
              value={localFilters.year}
              options={yearOptions}
              onSelect={(val) => updateFilter('year', val)}
              placeholder="All Years"
            />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClear}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={styles.clearButtonText}>Clear All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.applyButton}
              onPress={handleApply}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={styles.applyButtonText}>Apply</Text>
            </TouchableOpacity>
          </View>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
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
  filtersContainer: {
    gap: SPACING.m,
    marginBottom: SPACING.l,
  },
  selectContainer: {
    gap: SPACING.xs,
  },
  selectLabel: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  selectButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceLight,
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  selectButtonText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.text,
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: SPACING.l,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.m,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  modalTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.m,
    height: ITEM_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  optionText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
  },
  optionTextSelected: {
    color: COLORS.primary,
    fontWeight: '600',
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
    fontWeight: '600',
  },
  applyButton: {
    flex: 1,
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
