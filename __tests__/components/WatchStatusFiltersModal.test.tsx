import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { DEFAULT_WATCH_STATUS_FILTERS } from '@/src/utils/listFilters';
import { fireEvent, render, within } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff5500' }),
}));

jest.mock('expo-image', () => ({ Image: 'Image' }));

jest.mock('@/src/components/ui/ModalBackground', () => ({
  ModalBackground: () => null,
}));

const genreMap = { 28: 'Action', 18: 'Drama' };

const renderModal = (props: Partial<React.ComponentProps<typeof WatchStatusFiltersModal>> = {}) => {
  const onApplyFilters = jest.fn();
  const utils = render(
    <WatchStatusFiltersModal
      visible
      onClose={jest.fn()}
      filters={DEFAULT_WATCH_STATUS_FILTERS}
      onApplyFilters={onApplyFilters}
      genreMap={genreMap}
      {...props}
    />
  );
  return { ...utils, onApplyFilters };
};

describe('WatchStatusFiltersModal', () => {
  it('lays list filters out two per row, with Type, Your rating, and Runtime', () => {
    const { getAllByTestId } = renderModal({ showListFilters: true });

    const rows = getAllByTestId('filters-row');
    expect(rows).toHaveLength(3);
    // Each select also repeats its label in its (hidden) option picker, hence getAllByText.
    expect(within(rows[0]).getAllByText('Type').length).toBeGreaterThan(0);
    expect(within(rows[0]).getAllByText('Genres').length).toBeGreaterThan(0);
    expect(within(rows[1]).getAllByText('TMDB Rating').length).toBeGreaterThan(0);
    expect(within(rows[1]).getAllByText('Your Rating').length).toBeGreaterThan(0);
    expect(within(rows[2]).getAllByText('Release Year').length).toBeGreaterThan(0);
    expect(within(rows[2]).getAllByText('Runtime').length).toBeGreaterThan(0);
  });

  it('hides the list-only filters and keeps an odd last filter at half width', () => {
    const { getAllByTestId, queryByText } = renderModal({ showMediaTypeFilter: false });

    const rows = getAllByTestId('filters-row');
    expect(rows).toHaveLength(2);
    expect(queryByText('Type')).toBeNull();
    expect(queryByText('Your Rating')).toBeNull();
    expect(queryByText('Runtime')).toBeNull();
    // The last row still has two cells; the second is an empty spacer.
    expect(rows[1].children).toHaveLength(2);
  });

  it('disables Apply until the choices differ from the filters in use', () => {
    const { getByTestId, getByText, getAllByText, onApplyFilters } = renderModal({
      showListFilters: true,
      filters: { ...DEFAULT_WATCH_STATUS_FILTERS, runtime: '60to90', userRating: 8 },
    });

    expect(getByText('1–1.5 h')).toBeTruthy();
    expect(getAllByText('8+ stars').length).toBeGreaterThan(0);

    const apply = getByTestId('filters-apply-button');
    expect(apply.props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(apply);
    expect(onApplyFilters).not.toHaveBeenCalled();

    fireEvent.press(getByText('Clear All'));
    expect(getByTestId('filters-apply-button').props.accessibilityState).toMatchObject({
      disabled: false,
    });
    fireEvent.press(getByTestId('filters-apply-button'));
    expect(onApplyFilters).toHaveBeenCalledWith(DEFAULT_WATCH_STATUS_FILTERS);
  });

  it('shows a live match count, hides it when unknown, and warns when nothing matches', () => {
    const getMatchCount = jest.fn((filters) =>
      filters.runtime !== 'any' ? null : filters.mediaType === 'tv' ? 0 : 12
    );
    const { getByTestId, queryByTestId, rerender } = renderModal({ getMatchCount });

    expect(getByTestId('filters-match-count').props.children).toBe('12 titles match');

    rerender(
      <WatchStatusFiltersModal
        visible
        onClose={jest.fn()}
        filters={{ ...DEFAULT_WATCH_STATUS_FILTERS, mediaType: 'tv' }}
        onApplyFilters={jest.fn()}
        genreMap={genreMap}
        getMatchCount={getMatchCount}
      />
    );
    expect(getByTestId('filters-match-count').props.children).toBe('No titles match these filters');

    rerender(
      <WatchStatusFiltersModal
        visible
        onClose={jest.fn()}
        filters={{ ...DEFAULT_WATCH_STATUS_FILTERS, runtime: '60to90' }}
        onApplyFilters={jest.fn()}
        genreMap={genreMap}
        getMatchCount={getMatchCount}
      />
    );
    expect(queryByTestId('filters-match-count')).toBeNull();
  });
});
