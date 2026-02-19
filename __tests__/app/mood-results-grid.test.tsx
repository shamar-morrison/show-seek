import { render } from '@testing-library/react-native';
import React from 'react';

let capturedFlashListProps: any = null;
const mockMovieCard = jest.fn();
const mockTVShowCard = jest.fn();
const mockMovieCardSkeleton = jest.fn();
const mockUseMoodDiscovery = jest.fn();
const mockSetOptions = jest.fn();
const mockBack = jest.fn();

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const AnimatedView = ({ children, ...props }: any) =>
    React.createElement('Animated.View', props, children);

  return {
    __esModule: true,
    default: {
      View: AnimatedView,
    },
    useSharedValue: (value: number) => ({ value }),
    withSpring: (value: number) => value,
    useAnimatedStyle: (factory: () => any) => factory(),
  };
});

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ moodId: 'calm' }),
  useNavigation: () => ({ setOptions: mockSetOptions }),
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@/src/constants/moods', () => ({
  getMoodById: () => ({
    id: 'calm',
    translationKey: 'mood.calm',
    emoji: ':)',
    color: '#22a6f2',
  }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#22a6f2' }),
}));

jest.mock('@/src/hooks/useMoodDiscovery', () => ({
  useMoodDiscovery: (...args: any[]) => mockUseMoodDiscovery(...args),
}));

jest.mock('@/src/components/cards/MovieCard', () => ({
  MovieCard: (props: any) => {
    mockMovieCard(props);
    return null;
  },
}));

jest.mock('@/src/components/cards/TVShowCard', () => ({
  TVShowCard: (props: any) => {
    mockTVShowCard(props);
    return null;
  },
}));

jest.mock('@/src/components/ui/LoadingSkeleton', () => ({
  MovieCardSkeleton: (props: any) => {
    mockMovieCardSkeleton(props);
    return null;
  },
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    FlashList: (props: any) => {
      capturedFlashListProps = props;
      const data = props.data || [];

      return React.createElement(
        React.Fragment,
        null,
        props.ListHeaderComponent,
        data.map((item: any, index: number) =>
          React.createElement(View, { key: `${item.id}-${index}` }, props.renderItem({ item, index }))
        ),
        props.ListFooterComponent
      );
    },
  };
});

import MoodResultsScreen from '@/app/(tabs)/home/mood-results';
import { SPACING } from '@/src/constants/theme';
import { getGridMetrics } from '@/src/utils/gridLayout';

const flattenStyle = (style: any): Record<string, any> => {
  if (!style) return {};
  if (Array.isArray(style)) {
    return style.reduce<Record<string, any>>((acc, entry) => ({ ...acc, ...flattenStyle(entry) }), {});
  }
  if (typeof style === 'object') return style;
  return {};
};

describe('MoodResultsScreen grid layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedFlashListProps = null;
    mockUseMoodDiscovery.mockReturnValue({
      data: [
        {
          id: 101,
          title: 'Grid Movie',
          original_title: 'Grid Movie',
          overview: 'overview',
          poster_path: '/poster.jpg',
          backdrop_path: '/backdrop.jpg',
          release_date: '2025-01-01',
          vote_average: 7.2,
          vote_count: 100,
          popularity: 50,
          genre_ids: [1],
          video: false,
          adult: false,
          original_language: 'en',
        },
      ],
      isLoading: false,
      isError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: jest.fn(),
      refetch: jest.fn(),
    });
  });

  it('passes computed width and spacing overrides to cards and list content', () => {
    render(<MoodResultsScreen />);

    const expected = getGridMetrics(375, 2, SPACING.m, SPACING.l);
    const movieCardProps = mockMovieCard.mock.calls[0]?.[0];

    expect(movieCardProps).toBeTruthy();
    expect(movieCardProps.width).toBe(expected.itemWidth);
    expect(movieCardProps.containerStyle).toEqual(
      expect.objectContaining({
        marginRight: 0,
        marginHorizontal: expected.itemHorizontalMargin,
        marginBottom: SPACING.m,
      })
    );

    expect(capturedFlashListProps).toBeTruthy();
    const contentStyle = flattenStyle(capturedFlashListProps.contentContainerStyle);
    expect(contentStyle.paddingHorizontal).toBe(expected.listPaddingHorizontal);
  });
});
