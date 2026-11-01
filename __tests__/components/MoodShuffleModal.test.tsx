import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  G: 'G',
  Line: 'Line',
  Polyline: 'Polyline',
  Polygon: 'Polygon',
}));

jest.mock('@hugeicons/react-native', () => ({
  HugeiconsIcon: () => null,
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: {
    Success: 'success',
  },
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

jest.mock('@/src/components/ui/ModalBackground', () => ({
  ModalBackground: () => null,
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: View,
      createAnimatedComponent: (component: any) => component,
    },
    // Shared values are referentially stable in real Reanimated
    useSharedValue: (initial: any) => require('react').useRef({ value: initial }).current,
    useAnimatedStyle: () => ({}),
    withTiming: (value: any) => value,
    withSequence: (...args: any[]) => args[args.length - 1],
    Easing: {
      out: (fn: any) => fn,
      exp: (t: number) => t,
    },
  };
});

import MoodShuffleModal, { MOOD_REVEAL_PAUSE_MS } from '@/src/components/MoodShuffleModal';
import { MOODS } from '@/src/constants/moods';

const START_DELAY_MS = 300;
const SHUFFLE_DURATION_MS = 2000;

describe('MoodShuffleModal', () => {
  const onClose = jest.fn();
  const onSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const renderModal = (visible = true) =>
    render(
      <MoodShuffleModal
        visible={visible}
        backdropByMoodId={{}}
        onClose={onClose}
        onSelect={onSelect}
      />
    );

  it('calls onClose when the close button is pressed', () => {
    const { getByTestId } = renderModal();

    fireEvent.press(getByTestId('mood-shuffle-close-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-selects a mood after the shuffle and reveal pause', () => {
    renderModal();

    act(() => {
      jest.advanceTimersByTime(START_DELAY_MS + SHUFFLE_DURATION_MS + 500);
    });
    // Revealed but still pausing
    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(MOOD_REVEAL_PAUSE_MS);
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    const selectedId = onSelect.mock.calls[0][0];
    expect(MOODS.map((m) => m.id)).toContain(selectedId);
  });

  it('does not navigate if closed before the reveal', () => {
    const { getByTestId } = renderModal();

    act(() => {
      jest.advanceTimersByTime(START_DELAY_MS + 500);
    });
    fireEvent.press(getByTestId('mood-shuffle-close-button'));

    act(() => {
      jest.advanceTimersByTime(SHUFFLE_DURATION_MS + MOOD_REVEAL_PAUSE_MS + 1000);
    });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not start shuffling while hidden', () => {
    renderModal(false);

    act(() => {
      jest.advanceTimersByTime(START_DELAY_MS + SHUFFLE_DURATION_MS + MOOD_REVEAL_PAUSE_MS + 1000);
    });

    expect(onSelect).not.toHaveBeenCalled();
  });
});
