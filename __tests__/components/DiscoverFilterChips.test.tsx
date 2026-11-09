import { DiscoverFilterChips } from '@/src/components/discover/DiscoverFilterChips';
import { DEFAULT_DISCOVER_FILTERS, type DiscoverFilterState } from '@/src/utils/discoverFilters';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const labels: Record<string, string> = {
        'discover.sortBy': 'Sort By',
        'discover.topRated': 'Top Rated',
        'discover.language': 'Language',
        'filters.runtime': 'Runtime',
        'filters.runtimeOptions.60to90': '1–1.5 h',
      };
      if (key === 'filters.removeFilter') return `Remove ${options?.name}`;
      return labels[key] ?? key;
    },
  }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff5500' }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light' },
}));

jest.mock('@/src/hooks/useDiscoverFilterOptions', () => ({
  useDiscoverFilterOptions: () => ({
    languageNames: { ko: 'Korean' },
    providerNames: { 8: 'Netflix', 337: 'Disney Plus' },
  }),
}));

const renderChips = (filters: DiscoverFilterState) => {
  const onFiltersChange = jest.fn();
  const onEditFilters = jest.fn();
  const utils = render(
    <DiscoverFilterChips
      filters={filters}
      onFiltersChange={onFiltersChange}
      mediaType="movie"
      genreMap={{ 28: 'Action' }}
      onEditFilters={onEditFilters}
    />
  );
  return { ...utils, onFiltersChange, onEditFilters };
};

describe('DiscoverFilterChips', () => {
  it('renders nothing without active filters', () => {
    const { queryByTestId } = renderChips(DEFAULT_DISCOVER_FILTERS);
    expect(queryByTestId('discover-active-filters')).toBeNull();
  });

  it('names each filter, including runtime, language and each streaming service', () => {
    const { getByTestId, getByText } = renderChips({
      ...DEFAULT_DISCOVER_FILTERS,
      sortBy: 'vote_average.desc',
      genres: [28],
      runtime: '60to90',
      language: 'ko',
      watchProviders: [8, 337],
    });

    expect(getByTestId('discover-filter-chip-sort-edit').props.accessibilityLabel).toBe(
      'Sort By: Top Rated'
    );
    expect(getByText('Action')).toBeTruthy();
    expect(getByTestId('discover-filter-chip-runtime-edit').props.accessibilityLabel).toBe(
      'Runtime: 1–1.5 h'
    );
    expect(getByTestId('discover-filter-chip-language-edit').props.accessibilityLabel).toBe(
      'Language: Korean'
    );
    expect(getByText('Netflix')).toBeTruthy();
    expect(getByText('Disney Plus')).toBeTruthy();
  });

  it('removes just one filter with its ✕', () => {
    const filters = {
      ...DEFAULT_DISCOVER_FILTERS,
      runtime: '60to90' as const,
      watchProviders: [8, 337],
    };
    const { getByTestId, onFiltersChange } = renderChips(filters);

    fireEvent.press(getByTestId('discover-filter-chip-runtime-remove'));
    expect(onFiltersChange).toHaveBeenLastCalledWith({ ...filters, runtime: 'any' });

    fireEvent.press(getByTestId('discover-filter-chip-provider-8-remove'));
    expect(onFiltersChange).toHaveBeenLastCalledWith({ ...filters, watchProviders: [337] });
  });

  it('opens the sheet when a chip is tapped', () => {
    const { getByTestId, onEditFilters } = renderChips({ ...DEFAULT_DISCOVER_FILTERS, year: 2024 });
    fireEvent.press(getByTestId('discover-filter-chip-year-edit'));
    expect(onEditFilters).toHaveBeenCalledTimes(1);
  });

  it('Clear All resets every filter and the sort', () => {
    const { getByTestId, onFiltersChange } = renderChips({
      ...DEFAULT_DISCOVER_FILTERS,
      sortBy: 'vote_average.desc',
      rating: 7,
    });
    fireEvent.press(getByTestId('discover-filters-clear-all'));
    expect(onFiltersChange).toHaveBeenCalledWith(DEFAULT_DISCOVER_FILTERS);
  });
});
