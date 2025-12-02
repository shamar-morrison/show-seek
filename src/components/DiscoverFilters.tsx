import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/constants/theme';
import { tmdbApi } from '@/src/api/tmdb';
import { Check, ChevronDown, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface FilterState {
  sortBy: string;
  genre: number | null;
  year: number | null;
  rating: number;
  language: string | null;
}

interface DiscoverFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  mediaType: 'movie' | 'tv';
  onClearFilters: () => void;
  genreMap: Record<number, string>;
}

const SORT_OPTIONS = [
  { label: 'Popularity', value: 'popularity.desc' },
  { label: 'Top Rated', value: 'vote_average.desc' },
  { label: 'Newest', value: 'primary_release_date.desc' },
];

const RATING_OPTIONS = [
  { label: 'Any Rating', value: 0 },
  { label: '5+ Stars', value: 5 },
  { label: '6+ Stars', value: 6 },
  { label: '7+ Stars', value: 7 },
  { label: '8+ Stars', value: 8 },
  { label: '9+ Stars', value: 9 },
];

interface SelectOption {
  label: string;
  value: any;
}

const ITEM_HEIGHT = 56;

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
              <TouchableOpacity onPress={() => setVisible(false)} activeOpacity={ACTIVE_OPACITY}>
                <X size={24} color={COLORS.text} />
              </TouchableOpacity>
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

export default function DiscoverFilters({
  filters,
  onChange,
  mediaType,
  onClearFilters,
  genreMap,
}: DiscoverFiltersProps) {
  const [languages, setLanguages] = useState<{ iso_639_1: string; english_name: string }[]>([]);

  // Convert genreMap to array
  const genres = Object.entries(genreMap).map(([id, name]) => ({
    id: Number(id),
    name,
  }));

  useEffect(() => {
    loadLanguages();
  }, []);

  const loadLanguages = async () => {
    try {
      const data = await tmdbApi.getLanguages();
      setLanguages(data);
    } catch (error) {
      console.error('Failed to load languages', error);
    }
  };

  const updateFilter = (key: keyof FilterState, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  const genreOptions = [
    { label: 'All Genres', value: null },
    ...genres.map((g) => ({ label: g.name, value: g.id })),
  ];

  const languageOptions = [
    { label: 'All Languages', value: null },
    ...languages.map((l) => ({ label: l.english_name, value: l.iso_639_1 })),
  ];

  // Generate year options from current year down to 1950
  const currentYear = new Date().getFullYear();
  const yearOptions = [
    { label: 'All Years', value: null },
    ...Array.from({ length: currentYear - 1949 }, (_, i) => {
      const year = currentYear - i;
      return { label: String(year), value: year };
    }),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.col}>
          <FilterSelect
            label="Sort By"
            value={filters.sortBy}
            options={SORT_OPTIONS}
            onSelect={(val) => updateFilter('sortBy', val)}
          />
        </View>
        <View style={styles.col}>
          <FilterSelect
            label="Genre"
            value={filters.genre}
            options={genreOptions}
            onSelect={(val) => updateFilter('genre', val)}
            placeholder="All Genres"
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <FilterSelect
            label="Rating"
            value={filters.rating}
            options={RATING_OPTIONS}
            onSelect={(val) => updateFilter('rating', val)}
          />
        </View>
        <View style={styles.col}>
          <FilterSelect
            label="Language"
            value={filters.language}
            options={languageOptions}
            onSelect={(val) => updateFilter('language', val)}
            placeholder="All Languages"
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <FilterSelect
            label="Release Year"
            value={filters.year}
            options={yearOptions}
            onSelect={(val) => updateFilter('year', val)}
            placeholder="All Years"
          />
        </View>
        <View style={styles.col} />
      </View>

      <TouchableOpacity
        style={styles.clearButton}
        onPress={onClearFilters}
        activeOpacity={ACTIVE_OPACITY}
      >
        <X size={18} color={COLORS.textSecondary} />
        <Text style={styles.clearButtonText}>Clear Filters</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.m,
    gap: SPACING.m,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.m,
  },
  col: {
    flex: 1,
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
    backgroundColor: COLORS.surface,
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
  inputContainer: {
    gap: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.m,
    color: COLORS.text,
    fontSize: FONT_SIZE.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
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
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    padding: SPACING.m,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    marginTop: SPACING.xs,
  },
  clearButtonText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});
