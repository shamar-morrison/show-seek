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
        'discover.streamingService': 'Streaming Service',
      };
      if (key === 'filters.removeFilter') return `Remove ${options?.name}`;
      if (key === 'filters.editFilterValue') return `Opens the ${options?.name} options`;
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

jest.mock('expo-image', () => ({ Image: 'Image' }));

// The project's react-native mock renders FlatList as a bare host element, so render its rows.
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const FlatList = ({ data = [], renderItem, keyExtractor, ...props }: any) => {
    const { View } = actual;
    return (
      <View {...props}>
        {data.map((item: any, index: number) => (
          <View key={keyExtractor ? keyExtractor(item, index) : String(index)}>
            {renderItem({ item, index })}
          </View>
        ))}
      </View>
    );
  };
  FlatList.displayName = 'MockFlatList';
  return { ...actual, FlatList };
});

jest.mock('@/src/hooks/useDiscoverFilterOptions', () => ({
  useDiscoverFilterOptions: () => ({
    languageNames: { ko: 'Korean' },
    providerNames: { 8: 'Netflix', 337: 'Disney Plus' },
  }),
  useDiscoverFieldOptions: () => ({
    sortOptions: [
      { label: 'Popular', value: 'popularity.desc' },
      { label: 'Top Rated', value: 'vote_average.desc' },
    ],
    ratingOptions: [{ label: 'Any rating', value: 0 }],
    runtimeOptions: [
      { label: 'Any runtime', value: 'any' },
      { label: '1–1.5 h', value: '60to90' },
      { label: '1.5–2 h', value: '90to120' },
    ],
    yearOptions: [{ label: 'Any year', value: null }],
    genreOptions: [{ label: 'Action', value: 28 }],
    languageOptions: [{ label: 'Korean', value: 'ko' }],
    watchProviderOptions: [
      { label: 'Netflix', value: 8, logoPath: null },
      { label: 'Disney Plus', value: 337, logoPath: null },
      { label: 'Max', value: 1899, logoPath: null },
    ],
    isLoadingWatchProviders: false,
  }),
}));

const renderChips = (filters: DiscoverFilterState) => {
  const onFiltersChange = jest.fn();
  const utils = render(
    <DiscoverFilterChips
      filters={filters}
      onFiltersChange={onFiltersChange}
      mediaType="movie"
      genreMap={{ 28: 'Action' }}
    />
  );
  return { ...utils, onFiltersChange };
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

  it('opens no picker until a chip is tapped', () => {
    const { queryByTestId } = renderChips({ ...DEFAULT_DISCOVER_FILTERS, runtime: '60to90' });
    expect(queryByTestId('discover-filter-picker-runtime')).toBeNull();
  });

  it('a streaming service chip opens the Streaming Service checklist, and Apply updates it', () => {
    const filters = { ...DEFAULT_DISCOVER_FILTERS, watchProviders: [8] };
    const { getByTestId, getByText, queryByTestId, onFiltersChange } = renderChips(filters);

    const chip = getByTestId('discover-filter-chip-provider-8-edit');
    expect(chip.props.accessibilityHint).toBe('Opens the Streaming Service options');
    fireEvent.press(chip);
    expect(getByTestId('discover-filter-picker-providers')).toBeTruthy();

    fireEvent.press(getByText('Max'));
    fireEvent.press(getByTestId('multi-select-apply-button'));
    expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, watchProviders: [8, 1899] });
    expect(queryByTestId('discover-filter-picker-providers')).toBeNull();
  });

  it('the runtime chip opens the Runtime list, and a tap changes only the runtime', () => {
    const filters = { ...DEFAULT_DISCOVER_FILTERS, runtime: '60to90' as const, rating: 7 };
    const { getByTestId, getByText, queryByTestId, onFiltersChange } = renderChips(filters);

    fireEvent.press(getByTestId('discover-filter-chip-runtime-edit'));
    fireEvent.press(getByText('1.5–2 h'));

    expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, runtime: '90to120' });
    expect(queryByTestId('discover-filter-picker-runtime')).toBeNull();
  });

  it('the sort chip opens the Sort By list', () => {
    const { getByTestId } = renderChips({
      ...DEFAULT_DISCOVER_FILTERS,
      sortBy: 'vote_average.desc',
    });
    fireEvent.press(getByTestId('discover-filter-chip-sort-edit'));
    expect(getByTestId('discover-filter-picker-sort')).toBeTruthy();
  });

  it('closing a picker without choosing changes nothing', () => {
    const { getByTestId, getByText, queryByTestId, onFiltersChange } = renderChips({
      ...DEFAULT_DISCOVER_FILTERS,
      watchProviders: [8],
    });
    fireEvent.press(getByTestId('discover-filter-chip-provider-8-edit'));
    fireEvent.press(getByText('Max'));
    // The Android back button / swipe-to-dismiss path.
    fireEvent(getByTestId('discover-filter-picker-providers'), 'requestClose');

    expect(queryByTestId('discover-filter-picker-providers')).toBeNull();
    expect(onFiltersChange).not.toHaveBeenCalled();
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
