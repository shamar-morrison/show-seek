import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { Genre, tmdbApi } from '@/src/api/tmdb';
import { ChevronDown, Check, X } from 'lucide-react-native';

export interface FilterState {
  sortBy: string;
  genre: number | null;
  year: string;
  rating: number;
  language: string | null;
}

interface DiscoverFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  mediaType: 'movie' | 'tv';
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

const COMMON_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'hi', name: 'Hindi' },
];

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
              <TouchableOpacity onPress={() => setVisible(false)}>
                <X size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => String(item.value)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={() => {
                    onSelect(item.value);
                    setVisible(false);
                  }}
                >
                  <Text style={[
                    styles.optionText, 
                    item.value === value && styles.optionTextSelected
                  ]}>
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
}: DiscoverFiltersProps) {
  const [genres, setGenres] = useState<Genre[]>([]);
  const [languages, setLanguages] = useState<{ iso_639_1: string; english_name: string }[]>([]);

  useEffect(() => {
    loadGenres();
    loadLanguages();
  }, [mediaType]);

  const loadGenres = async () => {
    try {
      const data = await tmdbApi.getGenres(mediaType);
      setGenres(data);
    } catch (error) {
      console.error('Failed to load genres', error);
    }
  };

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
    ...genres.map(g => ({ label: g.name, value: g.id }))
  ];

  const languageOptions = [
    { label: 'All Languages', value: null },
    ...languages.map(l => ({ label: l.english_name, value: l.iso_639_1 }))
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

      <View style={styles.inputContainer}>
        <Text style={styles.selectLabel}>Release Year</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 2023"
          placeholderTextColor={COLORS.textSecondary}
          keyboardType="numeric"
          value={filters.year}
          onChangeText={(text) => updateFilter('year', text)}
          maxLength={4}
        />
      </View>
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
});
