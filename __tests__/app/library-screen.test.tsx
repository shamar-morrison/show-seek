import LibraryScreen from '@/app/(tabs)/library/index';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockPush = jest.fn();
const mockRequireAccount = jest.fn(() => false);
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

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockRequireAccount,
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('react-native', () => {
  const React = require('react');
  const actual = jest.requireActual('react-native');

  return {
    ...actual,
    Keyboard: {
      dismiss: jest.fn(),
    },
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
    mockRequireAccount.mockReturnValue(false);
  });

  it('lets free users open notes and reminders while keeping widgets premium-locked', () => {
    const { getByTestId } = render(<LibraryScreen />);

    fireEvent.press(getByTestId('library-nav-notes'));
    fireEvent.press(getByTestId('library-nav-reminders'));
    fireEvent.press(getByTestId('library-nav-season-ratings'));
    fireEvent.press(getByTestId('library-nav-widgets'));

    expect(mockPush).toHaveBeenNthCalledWith(1, '/(tabs)/library/notes');
    expect(mockPush).toHaveBeenNthCalledWith(2, '/(tabs)/library/reminders');
    expect(mockPush).toHaveBeenNthCalledWith(3, '/(tabs)/library/ratings/seasons');
    expect(mockPush).toHaveBeenNthCalledWith(4, '/premium');
  });

  it('blocks guest users from reaching premium through widgets', () => {
    mockRequireAccount.mockReturnValue(true);

    const { getByTestId } = render(<LibraryScreen />);

    fireEvent.press(getByTestId('library-nav-widgets'));

    expect(mockRequireAccount).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('lets premium users open the widgets screen', () => {
    mockPremiumState.isPremium = true;

    const { getByTestId } = render(<LibraryScreen />);

    fireEvent.press(getByTestId('library-nav-widgets'));

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/library/widgets');
  });
});

describe('LibraryScreen search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPremiumState.isPremium = false;
    mockRequireAccount.mockReturnValue(false);
  });

  it('shows the search button before the settings action and filters items by title', () => {
    const { getByTestId, getByPlaceholderText, queryByTestId } = render(<LibraryScreen />);

    expect(getByTestId('library-search-button')).toBeTruthy();
    expect(getByTestId('library-nav-notes')).toBeTruthy();

    fireEvent.press(getByTestId('library-search-button'));

    const input = getByPlaceholderText('library.searchLibraryPlaceholder');
    fireEvent.changeText(input, 'ratings');

    expect(getByTestId('library-nav-season-ratings')).toBeTruthy();
    expect(queryByTestId('library-nav-notes')).toBeNull();
  });

  it('matches section titles and shows an empty state when nothing matches', () => {
    const { getByTestId, getByPlaceholderText, getByText, queryByTestId } = render(
      <LibraryScreen />
    );

    fireEvent.press(getByTestId('library-search-button'));

    const input = getByPlaceholderText('library.searchLibraryPlaceholder');
    fireEvent.changeText(input, 'favorites');

    expect(getByTestId('library-nav-favorite-people')).toBeTruthy();

    fireEvent.changeText(input, 'zzz-no-match');

    expect(queryByTestId('library-nav-notes')).toBeNull();
    expect(getByText('common.noResults')).toBeTruthy();
  });

  it('restores the full list when search is closed', () => {
    const { getByTestId, getByPlaceholderText, queryByTestId } = render(<LibraryScreen />);

    fireEvent.press(getByTestId('library-search-button'));

    const input = getByPlaceholderText('library.searchLibraryPlaceholder');
    fireEvent.changeText(input, 'ratings');
    expect(queryByTestId('library-nav-notes')).toBeNull();

    fireEvent.press(getByTestId('searchable-header-clear'));

    expect(getByTestId('library-nav-notes')).toBeTruthy();
    expect(getByTestId('library-search-button')).toBeTruthy();
  });
});
