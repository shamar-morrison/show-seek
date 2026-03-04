import { CategoryTabs } from '@/src/components/ui/CategoryTabs';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

describe('CategoryTabs', () => {
  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'movie', label: 'Movies' },
    { key: 'tv', label: 'TV Shows' },
  ];

  it('renders all tab labels', () => {
    const { getByText } = render(
      <CategoryTabs tabs={tabs} activeKey="all" onChange={jest.fn()} testID="category-tabs" />
    );

    expect(getByText('All')).toBeTruthy();
    expect(getByText('Movies')).toBeTruthy();
    expect(getByText('TV Shows')).toBeTruthy();
  });

  it('highlights the active tab and sets selected accessibility state', () => {
    const { getByTestId } = render(
      <CategoryTabs tabs={tabs} activeKey="movie" onChange={jest.fn()} testID="category-tabs" />
    );

    const activeTab = getByTestId('category-tabs-tab-movie');
    const inactiveTab = getByTestId('category-tabs-tab-all');

    expect(activeTab).toHaveProp('accessibilityState', { selected: true });
    expect(inactiveTab).toHaveProp('accessibilityState', { selected: false });
  });

  it('calls onChange with the pressed tab key', () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <CategoryTabs tabs={tabs} activeKey="all" onChange={onChange} testID="category-tabs" />
    );

    fireEvent.press(getByTestId('category-tabs-tab-tv'));

    expect(onChange).toHaveBeenCalledWith('tv');
  });

  it('renders a horizontal scroll container', () => {
    const { getByTestId } = render(
      <CategoryTabs tabs={tabs} activeKey="all" onChange={jest.fn()} testID="category-tabs" />
    );

    expect(getByTestId('category-tabs-scroll').props.horizontal).toBe(true);
  });
});
