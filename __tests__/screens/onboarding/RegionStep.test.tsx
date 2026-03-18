import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/src/context/RegionProvider', () => ({
  SUPPORTED_REGIONS: [
    { code: 'US', name: 'United States', emoji: '🇺🇸' },
    { code: 'CA', name: 'Canada', emoji: '🇨🇦' },
  ],
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-reanimated/mock', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: {
      View: ({ children, ...props }: any) => React.createElement(View, props, children),
    },
    FadeInDown: {
      duration: () => ({ delay: () => ({}) }),
    },
  };
});

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    FlashList: ({ data = [], renderItem, ...props }: any) =>
      React.createElement(
        View,
        props,
        data.map((item: any, index: number) =>
          React.createElement(View, { key: item.code }, renderItem({ item, index }))
        )
      ),
  };
});

import RegionStep from '@/src/screens/onboarding/RegionStep';

describe('RegionStep', () => {
  it('keeps the Other option selected when the parent preserves the viaOther flag', () => {
    const { getByText, rerender } = render(
      <RegionStep selectedRegion="US" selectedViaOther={false} onSelect={jest.fn()} />
    );

    const otherPressable = getByText('Other').parent as any;
    fireEvent.press(otherPressable);

    rerender(<RegionStep selectedRegion="US" selectedViaOther={true} onSelect={jest.fn()} />);

    let selectedOtherPressable = getByText('Other').parent as any;
    while (selectedOtherPressable?.props?.accessibilityState == null && selectedOtherPressable?.parent) {
      selectedOtherPressable = selectedOtherPressable.parent;
    }

    expect(selectedOtherPressable.props.accessibilityState.selected).toBe(true);
    const usPressable = getByText('United States').parent as any;
    expect(usPressable.props.accessibilityState?.selected).toBe(false);
  });

  it('normalizes the Other selection to US while signaling viaOther', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <RegionStep selectedRegion={null} selectedViaOther={false} onSelect={onSelect} />
    );

    fireEvent.press(getByText('Other').parent as any);

    expect(onSelect).toHaveBeenCalledWith('US', { viaOther: true });
  });
});
