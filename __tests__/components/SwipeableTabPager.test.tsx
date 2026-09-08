import { SwipeableTabPager, type SwipeableTabPagerRef } from '@/src/components/ui/SwipeableTabPager';
import { act, render } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import React, { createRef } from 'react';
import { Text } from 'react-native';

const mockScrollToIndex = jest.fn();
const mockScrollToOffset = jest.fn();
let mockFlatListProps: any = {};

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  const React = require('react');
  const MockFlatList = React.forwardRef((props: any, ref: any) => {
    mockFlatListProps = props;
    React.useImperativeHandle(ref, () => ({
      scrollToIndex: mockScrollToIndex,
      scrollToOffset: mockScrollToOffset,
    }));
    return React.createElement(
      RN.View,
      { testID: props.testID },
      (props.data ?? []).map((item: any, index: number) =>
        React.createElement(
          React.Fragment,
          { key: String(item) },
          props.renderItem({ item, index })
        )
      )
    );
  });
  MockFlatList.displayName = 'MockFlatList';
  return { ...RN, FlatList: MockFlatList };
});

const TABS = ['all', 'movie', 'tv'] as const;
type Tab = (typeof TABS)[number];

const renderPage = jest.fn((key: Tab, isActive: boolean) =>
  React.createElement(Text, null, `page-${key}-${isActive ? 'active' : 'idle'}`)
);

const settleToIndex = (index: number) => {
  const width = Dimensions.get('window').width;
  act(() => {
    mockFlatListProps.onMomentumScrollEnd({
      nativeEvent: { contentOffset: { x: width * index } },
    });
  });
};

describe('SwipeableTabPager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlatListProps = {};
  });

  it('renders only the initially active page; others stay unmounted', () => {
    render(
      <SwipeableTabPager tabs={TABS} activeKey="all" onChange={() => {}} renderPage={renderPage} />
    );

    expect(renderPage).toHaveBeenCalledTimes(1);
    expect(renderPage).toHaveBeenCalledWith('all', true);
  });

  it('reports swipe settles via onChange and marks the new page active', () => {
    const onChange = jest.fn();
    const { update, getByText } = render(
      <SwipeableTabPager tabs={TABS} activeKey="all" onChange={onChange} renderPage={renderPage} />
    );

    settleToIndex(1);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('movie');

    // Parent applies the new key: movie page mounts active, all goes idle.
    update(
      <SwipeableTabPager tabs={TABS} activeKey="movie" onChange={onChange} renderPage={renderPage} />
    );
    expect(getByText('page-movie-active')).toBeTruthy();
    expect(getByText('page-all-idle')).toBeTruthy();
  });

  it('ignores settles on the already-active page', () => {
    const onChange = jest.fn();
    render(
      <SwipeableTabPager tabs={TABS} activeKey="movie" onChange={onChange} renderPage={renderPage} />
    );

    settleToIndex(1);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('scrolls imperatively via ref and mounts the target page', () => {
    const ref = createRef<SwipeableTabPagerRef>();
    const { getByText } = render(
      <SwipeableTabPager
        ref={ref}
        tabs={TABS}
        activeKey="all"
        onChange={() => {}}
        renderPage={renderPage}
      />
    );
    // Ignore the mount-time rotation-alignment scroll.
    mockScrollToIndex.mockClear();

    expect(ref.current).toBeTruthy();
    act(() => {
      ref.current?.goToKey('tv');
    });

    expect(mockScrollToIndex).toHaveBeenCalledWith({ index: 2, animated: true });
    // goToKey marks the tab visited so its content mounts immediately.
    expect(getByText('page-tv-idle')).toBeTruthy();
  });

  it('ignores unknown keys in goToKey', () => {
    const ref = createRef<SwipeableTabPagerRef>();
    render(
      <SwipeableTabPager
        ref={ref}
        tabs={TABS}
        activeKey="all"
        onChange={() => {}}
        renderPage={renderPage}
      />
    );
    mockScrollToIndex.mockClear();

    act(() => {
      ref.current?.goToKey('music');
    });

    expect(mockScrollToIndex).not.toHaveBeenCalled();
    expect(renderPage).toHaveBeenCalledTimes(1);
  });
});
