import { act, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { Text, View } = require('react-native');

  const AnimatedView = ({ children, entering, exiting, ...props }: any) =>
    React.createElement(View, props, children);
  const AnimatedText = ({ children, entering, exiting, ...props }: any) =>
    React.createElement(Text, props, children);

  return {
    __esModule: true,
    default: {
      View: AnimatedView,
      Text: AnimatedText,
    },
    Easing: {
      out: (easing: unknown) => easing,
      cubic: 'cubic',
    },
    FadeIn: {
      duration: () => ({}),
    },
    runOnJS: (fn: (...args: any[]) => unknown) => (...args: any[]) => {
      if (args.some((arg) => typeof arg === 'function')) {
        return undefined;
      }
      return fn(...args);
    },
    useAnimatedStyle: (factory: () => Record<string, unknown>) => factory(),
    useSharedValue: (initial: unknown) => ({ value: initial }),
    withDelay: (_delay: number, animation: unknown) => animation,
    withTiming: (toValue: unknown, config?: { duration?: number }, callback?: (finished: boolean) => void) => {
      if (callback) {
        setTimeout(() => callback(true), config?.duration ?? 0);
      }
      return toValue;
    },
  };
});

import PersonalizingScreen from '@/src/screens/onboarding/PersonalizingScreen';

describe('PersonalizingScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('rotates the helper phrases and ends on almost there before completing', async () => {
    const onComplete = jest.fn().mockResolvedValue(undefined);
    const onDone = jest.fn();

    const { getByText } = render(
      <PersonalizingScreen onComplete={onComplete} onDone={onDone} />
    );

    expect(getByText('Curating your lists...')).toBeTruthy();

    const expectedPhrases = [
      'Personalizing recommendations...',
      'Setting up your release calendar...',
      'Fine-tuning your experience...',
      'Almost there...',
    ];

    for (const phrase of expectedPhrases) {
      await act(async () => {
        jest.advanceTimersByTime(900);
        await Promise.resolve();
      });

      expect(getByText(phrase)).toBeTruthy();
    }

    expect(onDone).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1399);
      await Promise.resolve();
    });

    expect(onDone).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1);
      await Promise.resolve();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
