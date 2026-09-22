import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

jest.mock('@lodev09/react-native-true-sheet', () => {
  const React = require('react');
  const TrueSheet = React.forwardRef(({ children }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: jest.fn().mockResolvedValue(undefined),
      dismiss: jest.fn().mockResolvedValue(undefined),
    }));
    return <>{children}</>;
  });
  TrueSheet.displayName = 'TrueSheet';
  return { TrueSheet };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');
  return {
    GestureHandlerRootView: ({ children }: any) => <View>{children}</View>,
    Pressable,
  };
});

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#FF0000' }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));

import WatchProgressOptionsSheet from '@/src/components/watching/WatchProgressOptionsSheet';

describe('WatchProgressOptionsSheet', () => {
  it('renders the hide-completed switch with the given value', async () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(
      <WatchProgressOptionsSheet hideCompleted={false} onToggleHideCompleted={onToggle} />
    );

    await waitFor(() => {
      expect(getByTestId('watch-progress-hide-completed-switch')).toBeTruthy();
    });
    expect(getByTestId('watch-progress-hide-completed-switch').props.value).toBe(false);
  });

  it('calls onToggle when the row is pressed', async () => {
    const onToggle = jest.fn();
    const { getByTestId } = render(
      <WatchProgressOptionsSheet hideCompleted={false} onToggleHideCompleted={onToggle} />
    );

    await waitFor(() => {
      expect(getByTestId('watch-progress-hide-completed-row')).toBeTruthy();
    });

    fireEvent.press(getByTestId('watch-progress-hide-completed-row'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});
