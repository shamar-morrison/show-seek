import { tmdbApi, WatchProvider } from '@/src/api/tmdb';
import {
  FilterLoadingSkeleton,
  FilterSelect,
  MultiSelectFilter,
  SearchableFilterSelect,
  SelectOption,
} from '@/src/components/filters';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface FilterState {
  sortBy: string;
  genres: number[];
  genreOperator: 'and' | 'or';
  year: number | null;
  rating: number;
  language: string | null;
  watchProviders: number[];
}

interface DiscoverFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  mediaType: 'movie' | 'tv';
  onClearFilters: () => void;
  genreMap: Record<number, string>;
}

const RATING_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export default function DiscoverFilters({
  filters,
  onChange,
  mediaType,
  onClearFilters,
  genreMap,
}: DiscoverFiltersProps) {
  const { t } = useTranslation();
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

  const genreOptions = genres.map((g) => ({ label: g.name, value: g.id }));

  const languageOptions = [
    { label: t('discover.anyLanguage'), value: null },
    ...languages.map((l) => ({ label: l.english_name, value: l.iso_639_1 })),
  ];

  const watchProviderOptions = [
    ...watchProviders.map((p: WatchProvider) => ({
      label: p.provider_name,
      value: p.provider_id,
      logoPath: p.logo_path,
    })),
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
          <MultiSelectFilter
            label={t('discover.genres')}
            selectedIds={filters.genres}
            operator={filters.genreOperator}
            showOperatorTabs
            operatorTestID="genre-operator-toggle"
            options={genreOptions}
            onApply={(ids, op) => onChange({ ...filters, genres: ids, genreOperator: op })}
            placeholder={t('discover.anyGenre')}
            isActive={filters.genres.length > 0}
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
          {watchProvidersQuery.isLoading ? (
            <FilterLoadingSkeleton label={t('discover.streamingService')} />
          ) : (
            <MultiSelectFilter
              label={t('discover.streamingService')}
              selectedIds={filters.watchProviders}
              options={watchProviderOptions}
              onApply={(ids) => onChange({ ...filters, watchProviders: ids })}
              placeholder={t('discover.anyStreamingService')}
              isActive={filters.watchProviders.length > 0}
              searchable
              searchPlaceholder={t('discover.searchStreamingServices')}
            />
          )}
        </View>
      </View>

      <TouchableOpacity
        style={styles.clearButton}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onClearFilters();
        }}
        activeOpacity={ACTIVE_OPACITY}
      >
        <AppIcon icon={Cancel01Icon} size={18} color={COLORS.textSecondary} />
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
    fontFamily: FONT_FAMILY.semiBold,
  },
});
