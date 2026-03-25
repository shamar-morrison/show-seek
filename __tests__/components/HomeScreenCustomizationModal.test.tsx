import HomeScreenCustomizationModal, {
  HomeScreenCustomizationModalRef,
} from '@/src/components/HomeScreenCustomizationModal';
import { HomeScreenListItem } from '@/src/types/preferences';
import { normalizeHomeScreenSelections } from '@/src/utils/homeScreenSelections';
import { act, fireEvent, render } from '@testing-library/react-native';
import React, { createRef } from 'react';

const mockSheetDismiss = jest.fn(async () => {});
const mockSheetPresent = jest.fn(async () => {});
const mockMutateAsync = jest.fn(async () => {});
const mockPush = jest.fn();
const mockPremiumState = {
  isPremium: true,
  isLoading: false,
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, number>) => {
      if (key === 'homeCustomization.title') return 'Customize Home';
      if (key === 'homeCustomization.selectedCount') {
        return `${options?.selected}/${options?.max} selected`;
      }
      if (key === 'homeCustomization.tmdbLists') return 'TMDB Lists';
      if (key === 'homeCustomization.watchStatus') return 'Watch Status';
      if (key === 'home.trendingMovies') return 'Trending Movies';
      if (key === 'home.trendingTV') return 'Trending TV';
      if (key === 'home.popularMovies') return 'Popular Movies';
      if (key === 'home.topRated') return 'Top Rated';
      if (key === 'home.upcomingMovies') return 'Upcoming Movies';
      if (key === 'home.upcomingTV') return 'Upcoming TV';
      if (key === 'home.latestTrailers') return 'Latest Trailers';
      if (key === 'library.customLists') return 'Custom Lists';
      if (key === 'lists.shouldWatch') return 'Should Watch';
      if (key === 'lists.watching') return 'Currently Watching';
      if (key === 'lists.alreadyWatched') return 'Already Watched';
      if (key === 'lists.favorites') return 'Favorites';
      if (key === 'lists.dropped') return 'Dropped';
      if (key === 'common.cancel') return 'Cancel';
      if (key === 'common.apply') return 'Apply';
      return key;
    },
  }),
}));

jest.mock('@lodev09/react-native-true-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  const TrueSheet = React.forwardRef(({ children }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: mockSheetPresent,
      dismiss: mockSheetDismiss,
    }));

    return <View>{children}</View>;
  });

  return { TrueSheet };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  return {
    GestureHandlerRootView: ({ children }: any) => <View>{children}</View>,
    Pressable,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
  },
  NotificationFeedbackType: {
    Warning: 'warning',
    Success: 'success',
    Error: 'error',
  },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'user-1' },
  }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  useUpdateHomeScreenLists: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

jest.mock('@/src/components/ui/AnimatedCheck', () => ({
  AnimatedCheck: ({ visible }: { visible: boolean }) =>
    visible ? require('react').createElement('AnimatedCheck') : null,
}));

jest.mock('@/src/components/ui/PremiumBadge', () => ({
  PremiumBadge: () => null,
}));

describe('HomeScreenCustomizationModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMutateAsync.mockResolvedValue(undefined);
    mockPremiumState.isPremium = true;
    mockPremiumState.isLoading = false;
  });

  it('uses resolved selections so stale deleted custom lists are not counted or rendered', async () => {
    const rawSelections: HomeScreenListItem[] = [
      { id: 'deleted-list', type: 'custom', label: 'Deleted List' },
      { id: 'kept-list', type: 'custom', label: 'Old Kept Name' },
    ];
    const customLists = [{ id: 'kept-list', name: 'Kept List' }];
    const resolvedHomeScreenLists = normalizeHomeScreenSelections(rawSelections, customLists);
    const ref = createRef<HomeScreenCustomizationModalRef>();
    const { getByTestId, getByText, queryByTestId } = render(
      <HomeScreenCustomizationModal
        ref={ref}
        resolvedHomeScreenLists={resolvedHomeScreenLists}
        customLists={customLists}
      />
    );

    await act(async () => {
      await ref.current?.present();
    });

    expect(getByText('1/6 selected')).toBeTruthy();
    expect(queryByTestId('home-customization-row-deleted-list')).toBeNull();
    expect(getByTestId('home-customization-row-kept-list').props.accessibilityState.checked).toBe(
      true
    );
  });

  it('does not dismiss or route to premium while trailer access is still verifying', async () => {
    mockPremiumState.isPremium = false;
    mockPremiumState.isLoading = true;

    const ref = createRef<HomeScreenCustomizationModalRef>();
    const { getByTestId } = render(
      <HomeScreenCustomizationModal
        ref={ref}
        resolvedHomeScreenLists={[]}
        customLists={[]}
      />
    );

    await act(async () => {
      await ref.current?.present();
    });

    fireEvent.press(getByTestId('home-customization-row-latest-trailers'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockSheetDismiss).not.toHaveBeenCalled();
  });
});
