import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import WelcomeIntroScreen from '@/src/screens/onboarding/WelcomeIntroScreen';
import { COLORS, FONT_SIZE } from '@/src/constants/theme';

jest.mock('@/src/components/auth/AnimatedBackground', () => ({
  AnimatedBackground: () => null,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, Text } = require('react-native');

  return {
    __esModule: true,
    default: {
      View: ({ children, ...props }: any) => React.createElement(View, props, children),
      Text: ({ children, ...props }: any) => React.createElement(Text, props, children),
    },
    useAnimatedStyle: (factory: () => Record<string, unknown>) => factory(),
    useSharedValue: (initialValue: unknown) => ({ value: initialValue }),
    withTiming: (value: unknown) => value,
    withSpring: (value: unknown) => value,
    withDelay: (_delay: number, anim: unknown) => anim,
  };
});

const mockTranslations: Record<string, string> = {
  'personalOnboarding.welcomePrefix': 'Welcome to ',
  'personalOnboarding.welcomeAppName': 'ShowSeek',
  'personalOnboarding.welcomeSubtitle': "Let's customize your experience",
  'personalOnboarding.letsGo': "Let's Go",
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => mockTranslations[key] ?? key,
  }),
}));

describe('WelcomeIntroScreen', () => {
  it('renders the cinematic elements: popcorn emoji on top, uppercase eyebrow, and hero ShowSeek', () => {
    const onCompleteMock = jest.fn();
    const { getByText, getByLabelText } = render(
      <WelcomeIntroScreen onComplete={onCompleteMock} />
    );

    // Popcorn emoji
    const popcornEmoji = getByText('🍿');
    expect(popcornEmoji).toBeTruthy();
    expect(getByLabelText('popcorn')).toBeTruthy();
    expect(popcornEmoji.props.style).toEqual(
      expect.objectContaining({
        fontSize: 44,
      })
    );

    // Eyebrow "Welcome to"
    const eyebrow = getByText('Welcome to');
    expect(eyebrow).toBeTruthy();
    expect(eyebrow.props.style).toEqual(
      expect.objectContaining({
        fontSize: FONT_SIZE.s,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 3,
        color: COLORS.textSecondary,
      })
    );

    // Hero title "ShowSeek"
    const heroTitle = getByText('ShowSeek');
    expect(heroTitle).toBeTruthy();
    expect(heroTitle.props.style).toEqual(
      expect.objectContaining({
        fontSize: 50,
        fontWeight: '900',
        color: COLORS.primary,
      })
    );

    // Subtitle
    expect(getByText("Let's customize your experience")).toBeTruthy();
  });

  it('triggers onComplete when the CTA button is pressed', () => {
    const onCompleteMock = jest.fn();
    const { getByText } = render(<WelcomeIntroScreen onComplete={onCompleteMock} />);

    const button = getByText("Let's Go");
    fireEvent.press(button);

    expect(onCompleteMock).toHaveBeenCalledTimes(1);
  });
});
