import type { Movie } from '@/src/api/tmdb';
import { MovieCard } from '@/src/components/cards/MovieCard';
import { render } from '@testing-library/react-native';
import React from 'react';
import { TouchableOpacity } from 'react-native';

const mockPush = jest.fn();
const mockUsePreferences = jest.fn();
const mockResolvePosterPath = jest.fn();

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

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    overrides: {},
    resolvePosterPath: (...args: unknown[]) => mockResolvePosterPath(...args),
  }),
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
    mockResolvePosterPath.mockImplementation((_mediaType, _mediaId, fallbackPosterPath) => {
      return fallbackPosterPath as string | null;
    });
    mockUsePreferences.mockReturnValue({
      preferences: { dataSaver: false, showOriginalTitles: false },
    });
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

  it('applies container style overrides after defaults', () => {
    const { UNSAFE_getByType } = render(
      <MovieCard
        movie={movie}
        width={120}
        showListBadge={false}
        containerStyle={{ marginRight: 0, marginBottom: 10 }}
      />
    );

    const touchable = UNSAFE_getByType(TouchableOpacity);
    const styleEntries = Array.isArray(touchable.props.style)
      ? touchable.props.style.filter(Boolean)
      : [touchable.props.style];

    expect(styleEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ marginRight: 0, marginBottom: 10 }),
        expect.objectContaining({ width: 120 }),
      ])
    );
  });

  it('resolves poster path with media identity', () => {
    render(<MovieCard movie={movie} showListBadge={false} />);

    expect(mockResolvePosterPath).toHaveBeenCalledWith('movie', 123, '/poster.jpg');
  });

  it('prefers posterPathOverride when provided', () => {
    render(<MovieCard movie={movie} showListBadge={false} posterPathOverride="/override.jpg" />);

    expect(mockResolvePosterPath).not.toHaveBeenCalled();
  });
});
