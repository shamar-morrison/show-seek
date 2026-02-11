import type { Movie } from '@/src/api/tmdb';
import { MovieCard } from '@/src/components/cards/MovieCard';
import { render } from '@testing-library/react-native';
import React from 'react';

const mockPush = jest.fn();
const mockUsePreferences = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: mockPush,
  },
}));

jest.mock('@/src/hooks/useNavigation', () => ({
  useCurrentTab: () => 'home',
}));

jest.mock('@/src/hooks/useListMembership', () => ({
  useListMembership: () => ({
    getListsForMedia: () => [],
  }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => mockUsePreferences(),
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: (props: any) => {
    const React = require('react');
    return React.createElement('Image', props);
  },
}));

jest.mock('@/src/components/ui/ListMembershipBadge', () => ({
  ListMembershipBadge: () => null,
}));

describe('MovieCard', () => {
  const movie: Movie = {
    id: 123,
    title: 'Localized Movie',
    original_title: 'Original Movie',
    overview: 'Test overview',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    release_date: '2024-01-01',
    vote_average: 8.2,
    vote_count: 1000,
    popularity: 100,
    genre_ids: [28, 12],
    video: false,
    adult: false,
    original_language: 'ja',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows localized title when showOriginalTitles is disabled', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { dataSaver: false, showOriginalTitles: false },
    });

    const { getByText, queryByText } = render(<MovieCard movie={movie} showListBadge={false} />);

    expect(getByText('Localized Movie')).toBeTruthy();
    expect(queryByText('Original Movie')).toBeNull();
  });

  it('shows original title when showOriginalTitles is enabled', () => {
    mockUsePreferences.mockReturnValue({
      preferences: { dataSaver: false, showOriginalTitles: true },
    });

    const { getByText, queryByText } = render(<MovieCard movie={movie} showListBadge={false} />);

    expect(getByText('Original Movie')).toBeTruthy();
    expect(queryByText('Localized Movie')).toBeNull();
  });
});
