import LibraryScreen from '@/app/(tabs)/library/index';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockPush = jest.fn();
const mockPremiumState = {
  isPremium: false,
};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native', () => {
  const React = require('react');
  const actual = jest.requireActual('react-native');

  return {
    ...actual,
    SectionList: ({ sections = [], renderItem, renderSectionHeader, keyExtractor, ...rest }: any) =>
      React.createElement(
        actual.View,
        rest,
        sections.flatMap((section: any, sectionIndex: number) => {
          const header = renderSectionHeader
            ? [
                React.createElement(
                  actual.View,
                  { key: `section-header-${section.title ?? sectionIndex}` },
                  renderSectionHeader({ section })
                ),
              ]
            : [];

          const items = (section.data ?? []).map((item: any, itemIndex: number) =>
            React.createElement(
              actual.View,
              {
                key: keyExtractor ? keyExtractor(item, itemIndex) : `${sectionIndex}-${itemIndex}`,
              },
              renderItem({ item, index: itemIndex, section })
            )
          );

          return [...header, ...items];
        })
      ),
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
  },
}));

describe('LibraryScreen premium access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPremiumState.isPremium = false;
  });

  it('lets free users open notes and reminders while keeping widgets premium-locked', () => {
    const { getByTestId } = render(<LibraryScreen />);

    fireEvent.press(getByTestId('library-nav-notes'));
    fireEvent.press(getByTestId('library-nav-reminders'));
    fireEvent.press(getByTestId('library-nav-widgets'));

    expect(mockPush).toHaveBeenNthCalledWith(1, '/(tabs)/library/notes');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/(tabs)/library/reminders');
    expect(mockPush).toHaveBeenNthCalledWith(3, '/premium');
  });
});
