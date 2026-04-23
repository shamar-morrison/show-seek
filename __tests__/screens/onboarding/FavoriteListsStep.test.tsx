import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/src/api/tmdb', () => ({
  TMDB_IMAGE_SIZES: {
    backdrop: {
      medium: '/w780',
    },
  },
  getImageUrl: (path: string | null, size: string) =>
    path ? `https://image.tmdb.org/t/p${size}${path}` : null,
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-reanimated', () => {
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

import FavoriteListsStep from '@/src/screens/onboarding/FavoriteListsStep';
import type { HomeScreenListItem } from '@/src/types/preferences';

describe('FavoriteListsStep', () => {
  it('renders home list cards as accessible selectable buttons', () => {
    const selectedLists: HomeScreenListItem[] = [
      { id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' },
    ];

    const { getByLabelText, queryByLabelText } = render(
      <FavoriteListsStep selectedLists={selectedLists} onSelect={jest.fn()} />
    );

    const selectedCard = getByLabelText('Trending Movies');
    const unselectedCard = getByLabelText('Popular Movies');

    expect(selectedCard.props.accessibilityRole).toBe('button');
    expect(selectedCard.props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(unselectedCard.props.accessibilityState).toEqual({ selected: false, disabled: false });
    expect(queryByLabelText('Latest Trailers')).toBeNull();
  });

  it('calls onSelect with the existing tmdb list shape when a card is pressed', () => {
    const onSelect = jest.fn();
    const { getByLabelText } = render(<FavoriteListsStep selectedLists={[]} onSelect={onSelect} />);

    fireEvent.press(getByLabelText('Trending TV Shows'));

    expect(onSelect).toHaveBeenCalledWith([
      { id: 'trending-tv', type: 'tmdb', label: 'Trending TV Shows' },
    ]);
  });

  it('disables unselected cards when the max selection count is reached', () => {
    const selectedLists: HomeScreenListItem[] = [
      { id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' },
      { id: 'trending-tv', type: 'tmdb', label: 'Trending TV Shows' },
      { id: 'popular-movies', type: 'tmdb', label: 'Popular Movies' },
      { id: 'top-rated-movies', type: 'tmdb', label: 'Top Rated' },
      { id: 'upcoming-movies', type: 'tmdb', label: 'Upcoming Movies' },
      { id: 'latest-trailers', type: 'tmdb', label: 'Latest Trailers' },
    ];
    const onSelect = jest.fn();

    const { getByLabelText } = render(
      <FavoriteListsStep selectedLists={selectedLists} onSelect={onSelect} />
    );

    const disabledCard = getByLabelText('Upcoming TV Shows');

    expect(disabledCard.props.accessibilityState).toEqual({ selected: false, disabled: true });

    fireEvent.press(disabledCard);

    expect(onSelect).not.toHaveBeenCalled();
  });
});
