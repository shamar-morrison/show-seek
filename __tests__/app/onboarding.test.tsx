import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockCompleteOnboarding = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    completeOnboarding: mockCompleteOnboarding,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  return {
    LinearGradient: ({ children, ...props }: any) =>
      React.createElement('LinearGradient', props, children),
  };
});

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  const FlashList = React.forwardRef((props: any, ref) => {
    const { data, renderItem, onMomentumScrollEnd } = props;
    const [index, setIndex] = React.useState(0);
    const screenWidth = 375;

    React.useImperativeHandle(ref, () => ({
      scrollToIndex: ({ index: nextIndex }: { index: number }) => {
        setIndex(nextIndex);
        onMomentumScrollEnd?.({
          nativeEvent: {
            contentOffset: { x: nextIndex * screenWidth },
          },
        });
      },
    }));

    return React.createElement(View, { testID: 'mock-flash-list' }, renderItem({ item: data[index], index }));
  });

  return { FlashList, FlashListRef: {} };
});

import OnboardingScreen from '@/app/onboarding';

describe('Onboarding screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCompleteOnboarding.mockResolvedValue(undefined);
    (global as any).__EXPO_VIDEO_FORCE_ERROR = false;
  });

  it('renders the first feature slide with three-dot progress', () => {
    const { getByText, getByTestId, queryByText } = render(<OnboardingScreen />);

    expect(getByText('Never miss a release')).toBeTruthy();
    expect(getByText('Track upcoming episodes and movies with reminders.')).toBeTruthy();
    expect(getByText('Next')).toBeTruthy();

    expect(queryByText('Welcome to ShowSeek')).toBeNull();
    expect(queryByText('Connect Trakt')).toBeNull();

    expect(getByTestId('pagination-dot-0').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: '#E50914', width: 20 })])
    );
    expect(getByTestId('pagination-dot-1').props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ backgroundColor: 'rgba(255, 255, 255, 0.35)', width: 8 }),
      ])
    );
    expect(getByTestId('pagination-dot-2')).toBeTruthy();
  });

  it('advances slides with Next and finishes with Get Started', async () => {
    const { getByText, getByTestId } = render(<OnboardingScreen />);

    const ctaButton = getByTestId('onboarding-cta-button');
    fireEvent.press(ctaButton);

    await waitFor(() => {
      expect(getByText("Can't decide? Shuffle it.")).toBeTruthy();
    });

    fireEvent.press(ctaButton);

    await waitFor(() => {
      expect(getByText('Match your mood')).toBeTruthy();
      expect(getByText('Get Started')).toBeTruthy();
    });

    fireEvent.press(ctaButton);

    await waitFor(() => {
      expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    });
  });

  it('completes onboarding when Skip is pressed', async () => {
    const { getByTestId } = render(<OnboardingScreen />);

    fireEvent.press(getByTestId('onboarding-skip-button'));

    await waitFor(() => {
      expect(mockCompleteOnboarding).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    });
  });

  it('shows fallback UI when video playback errors', async () => {
    (global as any).__EXPO_VIDEO_FORCE_ERROR = true;

    const { getByTestId, getByText } = render(<OnboardingScreen />);

    await waitFor(() => {
      expect(getByTestId('video-fallback-calendar')).toBeTruthy();
      expect(getByText('Preview unavailable')).toBeTruthy();
    });
  });
});
