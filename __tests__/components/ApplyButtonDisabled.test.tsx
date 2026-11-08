import { CalendarSortModal } from '@/src/components/calendar/CalendarSortModal';
import { MultiSelectFilter } from '@/src/components/filters';
import MediaSortModal, { LIST_SORT_OPTIONS } from '@/src/components/MediaSortModal';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

// Render FlatList rows directly so option rows can be pressed.
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const FlatList = ({ data = [], renderItem, keyExtractor, ListEmptyComponent, ...props }: any) => {
    const { View } = actual;
    return (
      <View {...props}>
        {data.length === 0 && ListEmptyComponent}
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

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff5500' }),
}));

jest.mock('expo-image', () => ({ Image: 'Image' }));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light', Medium: 'Medium' },
}));

jest.mock('@/src/components/ui/ModalBackground', () => ({
  ModalBackground: () => null,
}));

const isDisabled = (element: { props: { accessibilityState?: { disabled?: boolean } } }) =>
  element.props.accessibilityState?.disabled === true;

describe('Apply is disabled when nothing would change', () => {
  /** Opens a select field and taps an option row in its picker. */
  const pick = (utils: ReturnType<typeof render>, selectTestID: string, label: string) => {
    fireEvent.press(utils.getByTestId(selectTestID));
    // The field's button can show the same text, so the picker row is the last match.
    const matches = utils.getAllByText(label);
    fireEvent.press(matches[matches.length - 1]);
  };

  const renderListSort = (
    sortState: React.ComponentProps<typeof MediaSortModal>['sortState'],
    onApplySort = jest.fn()
  ) =>
    render(
      <MediaSortModal
        visible
        onClose={jest.fn()}
        sortState={sortState}
        onApplySort={onApplySort}
        showUserRatingOption
        allowedOptions={LIST_SORT_OPTIONS}
      />
    );

  it('MediaSortModal: shows a Sort By field and an Order field with their current values', () => {
    const utils = renderListSort({ option: 'runtime', direction: 'desc' });

    expect(utils.getByText('Sort')).toBeTruthy();
    expect(utils.getByTestId('sort-by-select').props.accessibilityLabel).toBe('Sort By: Runtime');
    expect(utils.getByTestId('sort-order-select').props.accessibilityLabel).toBe(
      'Order: Longest to Shortest'
    );
  });

  it('MediaSortModal: Apply is enabled only after the sort or order changes', () => {
    const onApplySort = jest.fn();
    const utils = renderListSort({ option: 'recentlyAdded', direction: 'desc' }, onApplySort);

    expect(isDisabled(utils.getByTestId('sort-apply-button'))).toBe(true);
    fireEvent.press(utils.getByTestId('sort-apply-button'));
    expect(onApplySort).not.toHaveBeenCalled();

    pick(utils, 'sort-order-select', 'Oldest to Newest');
    expect(isDisabled(utils.getByTestId('sort-apply-button'))).toBe(false);

    pick(utils, 'sort-order-select', 'Newest to Oldest');
    expect(isDisabled(utils.getByTestId('sort-apply-button'))).toBe(true);

    pick(utils, 'sort-by-select', 'Alphabetical');
    fireEvent.press(utils.getByTestId('sort-apply-button'));
    expect(onApplySort).toHaveBeenCalledWith({ option: 'alphabetical', direction: 'asc' });
  });

  it('MediaSortModal: list screens offer Your Rating and Runtime after TMDB Rating', () => {
    const utils = renderListSort({ option: 'recentlyAdded', direction: 'desc' });

    const rendered = utils
      .getAllByText(/^(Recently Added|Release Date|TMDB Rating|Your Rating|Runtime|Alphabetical)$/)
      .map((node) => node.props.children);
    // The first match is the field's own button; the rest are the picker rows in order.
    expect([...new Set(rendered)]).toEqual([
      'Recently Added',
      'Release Date',
      'TMDB Rating',
      'Your Rating',
      'Runtime',
      'Alphabetical',
    ]);
  });

  it('MediaSortModal: Order labels follow the chosen sort and reset to its natural order', () => {
    const utils = renderListSort({ option: 'recentlyAdded', direction: 'asc' });

    const expectedLabels: [string, string, string, string][] = [
      ['Runtime', 'runtime', 'Longest to Shortest', 'Shortest to Longest'],
      ['TMDB Rating', 'rating', 'Highest to Lowest', 'Lowest to Highest'],
      ['Your Rating', 'userRating', 'Highest to Lowest', 'Lowest to Highest'],
      ['Release Date', 'releaseDate', 'Newest to Oldest', 'Oldest to Newest'],
      ['Alphabetical', 'alphabetical', 'A to Z', 'Z to A'],
    ];
    expectedLabels.forEach(([label, , natural, reverse]) => {
      pick(utils, 'sort-by-select', label);
      // A new sort starts in its natural order, which is listed first.
      expect(utils.getByTestId('sort-order-select').props.accessibilityLabel).toBe(
        `Order: ${natural}`
      );
      expect(utils.getAllByText(reverse).length).toBeGreaterThan(0);
    });
    expect(utils.queryByText('Newest to Oldest')).toBeNull();
  });

  it('CalendarSortModal: enabled only for a different sort', () => {
    const onApply = jest.fn();
    const { getByTestId, getByText } = render(
      <CalendarSortModal visible sortMode="soonest" onClose={jest.fn()} onApply={onApply} />
    );

    expect(isDisabled(getByTestId('calendar-sort-apply-button'))).toBe(true);
    fireEvent.press(getByText('Alphabetical'));
    expect(isDisabled(getByTestId('calendar-sort-apply-button'))).toBe(false);
    fireEvent.press(getByTestId('calendar-sort-apply-button'));
    expect(onApply).toHaveBeenCalledWith('alphabetical');
  });

  it('MultiSelectFilter: enabled only when the draft selection changes', () => {
    const onApply = jest.fn();
    const { getAllByText, getByTestId, getByText } = render(
      <MultiSelectFilter
        label="Genres"
        selectedIds={[28]}
        options={[
          { label: 'Action', value: 28 },
          { label: 'Drama', value: 18 },
        ]}
        onApply={onApply}
      />
    );

    // Open the picker from its button (the selected genre's name).
    fireEvent.press(getAllByText('Action')[0]);
    expect(isDisabled(getByTestId('multi-select-apply-button'))).toBe(true);

    fireEvent.press(getByText('Drama'));
    expect(isDisabled(getByTestId('multi-select-apply-button'))).toBe(false);

    fireEvent.press(getByText('Drama'));
    expect(isDisabled(getByTestId('multi-select-apply-button'))).toBe(true);
    expect(onApply).not.toHaveBeenCalled();
  });
});
