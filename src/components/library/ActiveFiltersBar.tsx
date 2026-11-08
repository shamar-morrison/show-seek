import { AppIcon } from '@/src/components/ui/AppIcon';
import { HORIZONTAL_SCROLL_PROPS } from '@/src/components/ui/horizontalScrollProps';
import {
  getSortOptionLabelKey,
  getSortOrderLabelKey,
  type SortState,
} from '@/src/components/MediaSortModal';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import {
  getMediaTypeLabel,
  getRuntimeLabel,
  getTmdbRatingLabel,
  getUserRatingLabel,
} from '@/src/utils/listFilterLabels';
import { DEFAULT_WATCH_STATUS_FILTERS, type WatchStatusFilterState } from '@/src/utils/listFilters';
import { ArrowUpDownIcon, Cancel01Icon, FilterRemoveIcon } from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';
import * as Haptics from 'expo-haptics';
import type { TFunction } from 'i18next';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export interface ActiveFilterChip {
  key: string;
  /** Field name shown muted before the value; omitted when the value speaks for itself. */
  label?: string;
  value: string;
  /** The filters with only this one removed. */
  remove: (filters: WatchStatusFilterState) => WatchStatusFilterState;
}

/** One chip per active filter (one per genre), in the filter modal's order. */
export function describeActiveFilters(
  filters: WatchStatusFilterState,
  t: TFunction,
  genreMap: Record<number, string>
): ActiveFilterChip[] {
  const defaults = DEFAULT_WATCH_STATUS_FILTERS;
  const chips: ActiveFilterChip[] = [];

  if (filters.mediaType !== defaults.mediaType) {
    chips.push({
      key: 'mediaType',
      label: t('filters.type'),
      value: getMediaTypeLabel(t, filters.mediaType),
      remove: (f) => ({ ...f, mediaType: defaults.mediaType }),
    });
  }
  filters.genres.forEach((genreId) => {
    chips.push({
      key: `genre-${genreId}`,
      value: genreMap[genreId] ?? t('discover.genres'),
      remove: (f) => {
        const genres = f.genres.filter((id) => id !== genreId);
        return {
          ...f,
          genres,
          genreOperator: genres.length === 0 ? defaults.genreOperator : f.genreOperator,
        };
      },
    });
  });
  if (filters.rating !== defaults.rating) {
    chips.push({
      key: 'rating',
      label: t('filters.tmdbRating'),
      value: getTmdbRatingLabel(t, filters.rating),
      remove: (f) => ({ ...f, rating: defaults.rating }),
    });
  }
  if (filters.userRating !== defaults.userRating) {
    chips.push({
      key: 'userRating',
      label: t('filters.yourRating'),
      value: getUserRatingLabel(t, filters.userRating),
      remove: (f) => ({ ...f, userRating: defaults.userRating }),
    });
  }
  if (filters.year !== defaults.year) {
    chips.push({
      key: 'year',
      label: t('discover.releaseYear'),
      value: String(filters.year),
      remove: (f) => ({ ...f, year: defaults.year }),
    });
  }
  if (filters.runtime !== defaults.runtime) {
    chips.push({
      key: 'runtime',
      label: t('filters.runtime'),
      value: getRuntimeLabel(t, filters.runtime),
      remove: (f) => ({ ...f, runtime: defaults.runtime }),
    });
  }
  return chips;
}

interface ActiveFiltersBarProps {
  filters: WatchStatusFilterState;
  onFiltersChange: (filters: WatchStatusFilterState) => void;
  sortState: SortState;
  defaultSortState: SortState;
  onSortChange: (sortState: SortState) => void;
  genreMap: Record<number, string>;
  /** Opens the filter modal so a chip's value can be adjusted. */
  onEditFilters: () => void;
  /** Opens the sort modal. */
  onEditSort: () => void;
}

/**
 * A strip of the active filters and sort under the list header. Each chip clears itself with
 * its ✕ or opens the matching modal when tapped; "Clear all" resets everything at once.
 * Renders nothing while no filter or custom sort is active.
 */
export function ActiveFiltersBar({
  filters,
  onFiltersChange,
  sortState,
  defaultSortState,
  onSortChange,
  genreMap,
  onEditFilters,
  onEditSort,
}: ActiveFiltersBarProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  const filterChips = describeActiveFilters(filters, t, genreMap);
  const hasCustomSort =
    sortState.option !== defaultSortState.option ||
    sortState.direction !== defaultSortState.direction;
  const chipCount = filterChips.length + (hasCustomSort ? 1 : 0);

  if (chipCount === 0) return null;

  const handleRemoveFilter = (chip: ActiveFilterChip) => {
    void Haptics.selectionAsync();
    onFiltersChange(chip.remove(filters));
  };

  const handleResetSort = () => {
    void Haptics.selectionAsync();
    onSortChange(defaultSortState);
  };

  const handleClearAll = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onFiltersChange(DEFAULT_WATCH_STATUS_FILTERS);
    if (hasCustomSort) onSortChange(defaultSortState);
  };

  const sortValue = `${t(getSortOptionLabelKey(sortState.option))} · ${t(
    getSortOrderLabelKey(sortState.option, sortState.direction)
  )}`;

  return (
    <View testID="active-filters-bar">
      <ScrollView
        {...HORIZONTAL_SCROLL_PROPS}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* A single chip already has its own ✕, so Clear all only appears for two or more. */}
        {chipCount > 1 && (
          <Pressable
            style={({ pressed }) => [styles.clearChip, pressed && styles.pressed]}
            onPress={handleClearAll}
            accessibilityRole="button"
            accessibilityLabel={t('common.clearAll')}
            testID="active-filters-clear-all"
          >
            <AppIcon icon={FilterRemoveIcon} size={14} color={COLORS.textSecondary} />
            <Text style={styles.clearChipText}>{t('common.clearAll')}</Text>
          </Pressable>
        )}

        {hasCustomSort && (
          <Chip
            accentColor={accentColor}
            icon={ArrowUpDownIcon}
            label={t('sort.title')}
            value={sortValue}
            onPress={onEditSort}
            onRemove={handleResetSort}
            editLabel={t('sort.editSort')}
            removeLabel={t('filters.removeFilter', { name: sortValue })}
            testID="active-sort-chip"
          />
        )}

        {filterChips.map((chip) => (
          <Chip
            key={chip.key}
            accentColor={accentColor}
            label={chip.label}
            value={chip.value}
            onPress={onEditFilters}
            onRemove={() => handleRemoveFilter(chip)}
            editLabel={t('filters.editFilters')}
            removeLabel={t('filters.removeFilter', {
              name: chip.label ? `${chip.label} ${chip.value}` : chip.value,
            })}
            testID={`active-filter-chip-${chip.key}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}

interface ChipProps {
  accentColor: string;
  icon?: IconSvgElement;
  label?: string;
  value: string;
  onPress: () => void;
  onRemove: () => void;
  editLabel: string;
  removeLabel: string;
  testID: string;
}

function Chip({
  accentColor,
  icon,
  label,
  value,
  onPress,
  onRemove,
  editLabel,
  removeLabel,
  testID,
}: ChipProps) {
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: hexToRGBA(accentColor, 0.12),
          borderColor: hexToRGBA(accentColor, 0.35),
        },
      ]}
      testID={testID}
    >
      <Pressable
        style={({ pressed }) => [styles.chipBody, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${value}` : value}
        accessibilityHint={editLabel}
        testID={`${testID}-edit`}
      >
        {icon && <AppIcon icon={icon} size={14} color={accentColor} />}
        <Text style={styles.chipText} numberOfLines={1}>
          {label ? <Text style={styles.chipLabel}>{`${label} `}</Text> : null}
          {value}
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [
          styles.removeButton,
          { backgroundColor: hexToRGBA(accentColor, pressed ? 0.4 : 0.22) },
        ]}
        onPress={onRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={removeLabel}
        testID={`${testID}-remove`}
      >
        <AppIcon icon={Cancel01Icon} size={12} color={COLORS.text} />
      </Pressable>
    </View>
  );
}

const CHIP_HEIGHT = 34;

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: SPACING.s,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
  },
  chip: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    flexDirection: 'row',
    height: CHIP_HEIGHT,
    paddingRight: SPACING.xs,
  },
  chipBody: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    height: '100%',
    paddingLeft: SPACING.m,
    paddingRight: SPACING.s,
  },
  chipText: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.s,
    maxWidth: 240,
  },
  chipLabel: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.medium,
  },
  removeButton: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.round,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  clearChip: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.round,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: CHIP_HEIGHT,
    paddingHorizontal: SPACING.m,
  },
  clearChipText: {
    color: COLORS.textSecondary,
    fontFamily: FONT_FAMILY.semiBold,
    fontSize: FONT_SIZE.s,
  },
  pressed: {
    opacity: 0.7,
  },
});
