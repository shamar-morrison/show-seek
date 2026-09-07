import { HorizontalFlashList } from '@/src/components/ui/HorizontalFlashList';
import { HORIZONTAL_SCROLL_PROPS } from '@/src/components/ui/horizontalScrollProps';
import { render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

let capturedProps: any = null;

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  const MockFlashList = (props: any) => {
    capturedProps = props;
    return <View testID="mock-flash-list" />;
  };

  return { FlashList: MockFlashList };
});

describe('HorizontalFlashList', () => {
  beforeEach(() => {
    capturedProps = null;
  });

  it('enforces anti-overscroll props so edge flings cannot swallow taps', () => {
    render(
      <HorizontalFlashList
        data={[1, 2, 3]}
        renderItem={({ item }) => <Text>{item}</Text>}
        keyExtractor={(item) => String(item)}
      />
    );

    expect(capturedProps.horizontal).toBe(true);
    expect(capturedProps.bounces).toBe(false);
    expect(capturedProps.alwaysBounceHorizontal).toBe(false);
    expect(capturedProps.overScrollMode).toBe('never');
    // decelerationRate intentionally left at RN default to preserve scroll speed
    expect(capturedProps.decelerationRate).toBeUndefined();
  });

  it('does not allow callers to re-enable overscroll', () => {
    render(
      <HorizontalFlashList
        data={[1]}
        renderItem={({ item }) => <Text>{item}</Text>}
        keyExtractor={(item) => String(item)}
        // @ts-expect-error - enforced props are omitted from public type
        bounces
      />
    );

    expect(capturedProps.bounces).toBe(false);
  });

  it('shares the same tuning with plain horizontal ScrollViews', () => {
    expect(HORIZONTAL_SCROLL_PROPS).toEqual({
      horizontal: true,
      bounces: false,
      alwaysBounceHorizontal: false,
      overScrollMode: 'never',
    });
  });
});
