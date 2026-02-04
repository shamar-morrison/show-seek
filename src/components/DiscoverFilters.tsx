import { tmdbApi, WatchProvider } from '@/src/api/tmdb';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Check, ChevronDown, Lock, Search, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export interface FilterState {
  sortBy: string;
  genre: number | null;
  year: number | null;
  rating: number;
  language: string | null;
  watchProvider: number | null;
}

interface DiscoverFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  mediaType: 'movie' | 'tv';
  onClearFilters: () => void;
  genreMap: Record<number, string>;
}

const RATING_VALUES = [0, 5, 6, 7, 8, 9] as const;

interface SelectOption {
  label: string;
  value: any;
}
interface BaseFilterSelectProps {
  label: string;
  value: any;
  options: SelectOption[];
  onSelect: (val: any) => void;
  placeholder?: string;
  isActive?: boolean;
}

interface SearchableFilterSelectProps extends BaseFilterSelectProps {
  searchPlaceholder?: string;
}

const ITEM_HEIGHT = 56;

const FilterSelect = ({
  label,
  value,
  options,
  onSelect,
  placeholder,
  isActive = false,
}: BaseFilterSelectProps) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <View style={styles.selectContainer}>
      <Text style={styles.selectLabel}>{label}</Text>
      <TouchableOpacity
        style={[styles.selectButton, isActive && styles.selectButtonActive]}
        onPress={() => setVisible(true)}
        activeOpacity={ACTIVE_OPACITY}
      >
        <Text style={[styles.selectButtonText, !selectedOption && { color: COLORS.textSecondary }]}>
          {selectedOption ? selectedOption.label : placeholder ?? t('filters.selectPlaceholder')}
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
              <Text style={styles.modalTitle}>{t('filters.selectLabel', { label })}</Text>
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

const SearchableFilterSelect = ({
  label,
  value,
  options,
  onSelect,
  placeholder,
  isActive = false,
  searchPlaceholder,
}: SearchableFilterSelectProps) => {
  const { t } = useTranslation();
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
        style={[styles.selectButton, isActive && styles.selectButtonActive]}
        onPress={() => setVisible(true)}
        activeOpacity={ACTIVE_OPACITY}
      >
        <Text style={[styles.selectButtonText, !selectedOption && { color: COLORS.textSecondary }]}>
          {selectedOption ? selectedOption.label : placeholder ?? t('filters.selectPlaceholder')}
        </Text>
        <ChevronDown size={20} color={COLORS.textSecondary} />
      </TouchableOpacity>

      <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={handleClose}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={handleClose}>
          <View style={styles.searchableModalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('filters.selectLabel', { label })}</Text>
              <TouchableOpacity onPress={handleClose} activeOpacity={ACTIVE_OPACITY}>
                <X size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.searchContainer}>
              <Search size={18} color={COLORS.textSecondary} />
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
                  <X size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              style={styles.searchableList}
              data={filteredOptions}
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

// Premium-locked filter that redirects to upgrade screen
const PremiumLockedFilter = ({ label }: { label: string }) => {
  const { t } = useTranslation();
  const router = useRouter();

  const handlePress = () => {
    router.push('/premium');
  };

  return (
    <View style={styles.selectContainer}>
      <View style={styles.premiumLabelContainer}>
        <Text style={styles.selectLabel}>{label}</Text>
        <Lock size={12} color={COLORS.primary} />
      </View>
      <TouchableOpacity
        style={[styles.selectButton, styles.selectButtonLocked]}
        onPress={handlePress}
        activeOpacity={ACTIVE_OPACITY}
      >
        <Text style={[styles.selectButtonText, { color: COLORS.textSecondary }]}>
          {t('premiumFeature.title')}
        </Text>
        <Lock size={16} color={COLORS.primary} />
      </TouchableOpacity>
    </View>
  );
};

const FilterLoadingSkeleton = ({ label }: { label: string }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.selectContainer}>
      <Text style={styles.selectLabel}>{label}</Text>
      <View style={[styles.selectButton, styles.selectButtonLoading]}>
        <Text style={[styles.selectButtonText, { color: COLORS.textSecondary }]}>
          {t('common.loading')}
        </Text>
      </View>
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
  const { t } = useTranslation();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const watchProvidersQuery = useQuery({
    queryKey: ['watchProviders', mediaType],
    queryFn: () => tmdbApi.getWatchProviders(mediaType),
    staleTime: 1000 * 60 * 60 * 24 * 30, // 30 days
    gcTime: 1000 * 60 * 60 * 24 * 30, // 30 days
  });

  const languagesQuery = useQuery({
    queryKey: ['languages'],
    queryFn: () => tmdbApi.getLanguages(),
    staleTime: 1000 * 60 * 60 * 24 * 30, // 30 days
    gcTime: 1000 * 60 * 60 * 24 * 30, // 30 days
  });

  const languages = languagesQuery.data || [];
  const watchProviders = watchProvidersQuery.data || [];

  // Convert genreMap to array
  const genres = Object.entries(genreMap).map(([id, name]) => ({
    id: Number(id),
    name,
  }));

  const updateFilter = (key: keyof FilterState, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  const sortOptions: SelectOption[] = [
    { label: t('discover.popularity'), value: 'popularity.desc' },
    { label: t('discover.topRated'), value: 'vote_average.desc' },
    { label: t('discover.newest'), value: 'primary_release_date.desc' },
  ];

  const ratingOptions: SelectOption[] = RATING_VALUES.map((value) => {
    if (value === 0) return { label: t('filters.anyRating'), value: 0 };
    return { label: t('filters.starsPlus', { count: value }), value };
  });

  const genreOptions = [
    { label: t('discover.anyGenre'), value: null },
    ...genres.map((g) => ({ label: g.name, value: g.id })),
  ];

  const languageOptions = [
    { label: t('discover.anyLanguage'), value: null },
    ...languages.map((l) => ({ label: l.english_name, value: l.iso_639_1 })),
  ];

  const watchProviderOptions = [
    { label: t('discover.anyStreamingService'), value: null },
    ...watchProviders.map((p: WatchProvider) => ({ label: p.provider_name, value: p.provider_id })),
  ];

  // Generate year options from current year down to 1950
  const currentYear = new Date().getFullYear();
  const yearOptions = [
    { label: t('discover.anyYear'), value: null },
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
            label={t('discover.sortBy')}
            value={filters.sortBy}
            options={sortOptions}
            onSelect={(val) => updateFilter('sortBy', val)}
            isActive={filters.sortBy !== 'popularity.desc'}
          />
        </View>
        <View style={styles.col}>
          <FilterSelect
            label={t('discover.genres')}
            value={filters.genre}
            options={genreOptions}
            onSelect={(val) => updateFilter('genre', val)}
            placeholder={t('discover.anyGenre')}
            isActive={filters.genre !== null}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <FilterSelect
            label={t('discover.rating')}
            value={filters.rating}
            options={ratingOptions}
            onSelect={(val) => updateFilter('rating', val)}
            isActive={filters.rating !== 0}
          />
        </View>
        <View style={styles.col}>
          <SearchableFilterSelect
            label={t('discover.language')}
            value={filters.language}
            options={languageOptions}
            onSelect={(val) => updateFilter('language', val)}
            placeholder={t('discover.anyLanguage')}
            isActive={filters.language !== null}
            searchPlaceholder={t('discover.searchLanguages')}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.col}>
          <FilterSelect
            label={t('discover.releaseYear')}
            value={filters.year}
            options={yearOptions}
            onSelect={(val) => updateFilter('year', val)}
            placeholder={t('discover.anyYear')}
            isActive={filters.year !== null}
          />
        </View>
        <View style={styles.col}>
          {isPremiumLoading ? (
            <FilterLoadingSkeleton label={t('discover.streamingService')} />
          ) : isPremium ? (
            <SearchableFilterSelect
              label={t('discover.streamingService')}
              value={filters.watchProvider}
              options={watchProviderOptions}
              onSelect={(val) => updateFilter('watchProvider', val)}
              placeholder={t('discover.anyStreamingService')}
              isActive={filters.watchProvider !== null}
              searchPlaceholder={t('discover.searchStreamingServices')}
            />
          ) : (
            <PremiumLockedFilter label={t('discover.streamingService')} />
          )}
        </View>
      </View>

      <TouchableOpacity
        style={styles.clearButton}
        onPress={onClearFilters}
        activeOpacity={ACTIVE_OPACITY}
      >
        <X size={18} color={COLORS.textSecondary} />
        <Text style={styles.clearButtonText}>{t('common.clearFilters')}</Text>
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
  selectButtonActive: {
    borderColor: COLORS.error,
  },
  selectButtonLocked: {
    opacity: 0.7,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
  },
  selectButtonLoading: {
    opacity: 0.5,
  },
  premiumLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
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
  searchableModalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    height: '60%',
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
  },
  searchableList: {
    flex: 1,
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
    gap: SPACING.s,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    paddingVertical: SPACING.xs,
  },
  emptyContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
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
