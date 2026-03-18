import { render } from '@testing-library/react-native';
import React from 'react';
import type { TVShow } from '@/src/api/tmdb';

const mockUseQuery = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({
    accentColor: '#E50914',
  }),
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
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

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    FlashList: ({ data = [], renderItem, ...props }: any) =>
      React.createElement(
        View,
        props,
        data.map((item: any, index: number) =>
          React.createElement(View, { key: item.id }, renderItem({ item, index }))
        )
      ),
  };
});

import TVShowsStep from '@/src/screens/onboarding/TVShowsStep';

describe('TVShowsStep', () => {
  const show: TVShow = {
    id: 123,
    name: 'The Sample Show',
    original_name: 'Original Sample Show',
    overview: 'A show used for testing.',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    first_air_date: '2024-01-01',
    vote_average: 8.1,
    vote_count: 42,
    popularity: 100,
    genre_ids: [18],
    original_language: 'en',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: { results: [show] },
      isLoading: false,
    });
  });

  it('exposes the selected poster tile as an accessible button', () => {
    const { getByLabelText } = render(
      <TVShowsStep selectedShows={[show]} onSelect={jest.fn()} />
    );

    const button = getByLabelText(show.name);

    expect(button.props.accessibilityLabel).toBe(show.name);
    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityState).toEqual({ selected: true });
  });
});
