import { ActiveFiltersBar } from '@/src/components/library/ActiveFiltersBar';
import { DEFAULT_SORT_STATE, type SortState } from '@/src/components/MediaSortModal';
import { DEFAULT_WATCH_STATUS_FILTERS, type WatchStatusFilterState } from '@/src/utils/listFilters';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff5500' }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light' },
}));

jest.mock('@/src/components/ui/ModalBackground', () => ({
  ModalBackground: () => null,
}));

// The project's react-native mock renders ScrollView as a plain host element with no methods,
// so swap in one whose scrollTo can be observed.
const mockScrollTo = jest.fn();
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const mockReact = jest.requireActual('react');
  return {
    ...actual,
    ScrollView: mockReact.forwardRef((props: object, ref: unknown) => {
      mockReact.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }));
      return mockReact.createElement(actual.View, { ...props, testID: 'chip-strip-scroll' });
    }),
  };
});

const genreMap = { 28: 'Action', 18: 'Drama' };

const renderBar = (filters: WatchStatusFilterState, sortState: SortState = DEFAULT_SORT_STATE) => {
  const handlers = {
    onFiltersChange: jest.fn(),
    onSortChange: jest.fn(),
    onEditFilters: jest.fn(),
    onEditSort: jest.fn(),
  };
  const utils = render(
    <ActiveFiltersBar
      filters={filters}
      sortState={sortState}
      defaultSortState={DEFAULT_SORT_STATE}
      genreMap={genreMap}
      {...handlers}
    />
  );
  return { ...utils, ...handlers };
};

describe('ActiveFiltersBar', () => {
  it('renders nothing without active filters or a custom sort', () => {
    const { queryByTestId } = renderBar(DEFAULT_WATCH_STATUS_FILTERS);
    expect(queryByTestId('active-filters-bar')).toBeNull();
  });

  it('shows one chip per filter, using the same labels as the filter modal', () => {
    const { getByTestId, getByText } = renderBar({
      ...DEFAULT_WATCH_STATUS_FILTERS,
      mediaType: 'movie',
      genres: [28, 18],
      userRating: 8,
      runtime: '90to120',
    });

    expect(getByTestId('active-filter-chip-mediaType')).toBeTruthy();
    expect(getByText('Action')).toBeTruthy();
    expect(getByText('Drama')).toBeTruthy();
    expect(getByTestId('active-filter-chip-userRating-edit').props.accessibilityLabel).toBe(
      'Your Rating: 8+ stars'
    );
    expect(getByTestId('active-filter-chip-runtime-edit').props.accessibilityLabel).toBe(
      'Runtime: 1.5–2 h'
    );
  });

  it('removes just one filter with its ✕', () => {
    const filters = {
      ...DEFAULT_WATCH_STATUS_FILTERS,
      genres: [28, 18],
      genreOperator: 'and' as const,
      runtime: '60to90' as const,
    };
    const { getByTestId, onFiltersChange } = renderBar(filters);

    fireEvent.press(getByTestId('active-filter-chip-genre-28-remove'));
    expect(onFiltersChange).toHaveBeenLastCalledWith({ ...filters, genres: [18] });

    fireEvent.press(getByTestId('active-filter-chip-runtime-remove'));
    expect(onFiltersChange).toHaveBeenLastCalledWith({ ...filters, runtime: 'any' });
  });

  it('resets the genre operator when the last genre is removed', () => {
    const filters = {
      ...DEFAULT_WATCH_STATUS_FILTERS,
      genres: [28],
      genreOperator: 'and' as const,
    };
    const { getByTestId, onFiltersChange } = renderBar(filters);

    fireEvent.press(getByTestId('active-filter-chip-genre-28-remove'));
    expect(onFiltersChange).toHaveBeenLastCalledWith(DEFAULT_WATCH_STATUS_FILTERS);
  });

  it('opens the filter or sort modal when a chip is tapped', () => {
    const { getByTestId, onEditFilters, onEditSort } = renderBar(
      { ...DEFAULT_WATCH_STATUS_FILTERS, year: 2024 },
      { option: 'runtime', direction: 'desc' }
    );

    fireEvent.press(getByTestId('active-filter-chip-year-edit'));
    expect(onEditFilters).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId('active-sort-chip-edit'));
    expect(onEditSort).toHaveBeenCalledTimes(1);
  });

  it('shows a custom sort in plain words and resets it with its ✕', () => {
    const { getByTestId, onSortChange } = renderBar(DEFAULT_WATCH_STATUS_FILTERS, {
      option: 'runtime',
      direction: 'desc',
    });

    expect(getByTestId('active-sort-chip-edit').props.accessibilityLabel).toBe(
      'Sort: Runtime · Longest to Shortest'
    );
    fireEvent.press(getByTestId('active-sort-chip-remove'));
    expect(onSortChange).toHaveBeenCalledWith(DEFAULT_SORT_STATE);
  });

  it('offers Clear All only with two or more chips, and it resets filters and sort', () => {
    const single = renderBar({ ...DEFAULT_WATCH_STATUS_FILTERS, rating: 7 });
    expect(single.queryByTestId('active-filters-clear-all')).toBeNull();
    single.unmount();

    const { getByTestId, onFiltersChange, onSortChange } = renderBar(
      { ...DEFAULT_WATCH_STATUS_FILTERS, rating: 7 },
      { option: 'alphabetical', direction: 'asc' }
    );
    fireEvent.press(getByTestId('active-filters-clear-all'));
    expect(onFiltersChange).toHaveBeenCalledWith(DEFAULT_WATCH_STATUS_FILTERS);
    expect(onSortChange).toHaveBeenCalledWith(DEFAULT_SORT_STATE);
  });

  it('pulls the strip back when a removed chip would leave blank space at the end', () => {
    const { getByTestId } = renderBar({ ...DEFAULT_WATCH_STATUS_FILTERS, rating: 7 });
    const scrollView = getByTestId('chip-strip-scroll');
    const scrollTo = mockScrollTo;
    scrollTo.mockClear();

    fireEvent(scrollView, 'layout', { nativeEvent: { layout: { width: 400 } } });
    fireEvent(scrollView, 'contentSizeChange', 1000, 34);
    // Scrolled to the very end: 1000 - 400.
    fireEvent.scroll(scrollView, { nativeEvent: { contentOffset: { x: 600, y: 0 } } });

    // A chip is removed: the row is 100 shorter, so it scrolls back by 100.
    fireEvent(scrollView, 'contentSizeChange', 900, 34);
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 500, animated: true });
    scrollTo.mockClear();

    // A chip is added: there is more room to scroll, so nothing moves.
    fireEvent(scrollView, 'contentSizeChange', 950, 34);
    expect(scrollTo).not.toHaveBeenCalled();

    // Content now fits on screen: back to the start.
    fireEvent(scrollView, 'contentSizeChange', 300, 34);
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 0, animated: true });
  });
});
