import { SegmentedControl } from '@/src/components/ui/SegmentedControl';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

describe('SegmentedControl', () => {
  const options = [
    { key: 'all', label: 'All' },
    { key: 'movie', label: 'Movies' },
    { key: 'tv', label: 'TV Shows' },
  ] as const;

  it('renders a tablist container and preserves tab selection state', () => {
    const { getByTestId } = render(
      <SegmentedControl
        options={options}
        activeKey="movie"
        onChange={jest.fn()}
        testID="segmented-control"
      />
    );

    expect(getByTestId('segmented-control')).toHaveProp('accessibilityRole', 'tablist');
    expect(getByTestId('segmented-control-tab-movie')).toHaveProp('accessibilityState', {
      selected: true,
    });
    expect(getByTestId('segmented-control-tab-all')).toHaveProp('accessibilityState', {
      selected: false,
    });
  });

  it('calls onChange with the pressed key', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <SegmentedControl
        options={options}
        activeKey="all"
        onChange={onChange}
        testID="segmented-control"
      />
    );

    fireEvent.press(getByTestId('segmented-control-tab-tv'));

    expect(onChange).toHaveBeenCalledWith('tv');
  });
});
