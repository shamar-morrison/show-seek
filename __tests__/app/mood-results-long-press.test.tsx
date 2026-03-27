import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

let latestMediaItem: any = null;
const mockPresent = jest.fn();
const mockDismiss = jest.fn();
const mockToastShow = jest.fn();
const mockUseMoodDiscovery = jest.fn();
const mockUsePosterOverrides = jest.fn();
const mockUseAccountRequired = jest.fn();
const mockSetOptions = jest.fn();
const mockBack = jest.fn();

const movieItem = {
  id: 101,
  title: 'Long Press Movie',
  original_title: 'Long Press Movie',
  overview: 'movie overview',
  poster_path: '/movie-poster.jpg',
  backdrop_path: '/movie-backdrop.jpg',
  release_date: '2025-01-01',
  vote_average: 7.2,
  vote_count: 100,
  popularity: 50,
  genre_ids: [1, 2],
  video: false,
  adult: false,
  original_language: 'en',
};

const tvItem = {
  id: 202,
  name: 'Long Press Show',
  original_name: 'Long Press Show',
  overview: 'tv overview',
  poster_path: '/tv-poster.jpg',
  backdrop_path: '/tv-backdrop.jpg',
  first_air_date: '2024-02-02',
  vote_average: 8.1,
  vote_count: 150,
  popularity: 60,
  genre_ids: [3, 4],
  origin_country: ['US'],
  original_language: 'en',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

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

jest.mock('expo-router', () => {
  const React = require('react');

  return {
    useLocalSearchParams: () => ({ moodId: 'calm' }),
    useNavigation: () => ({ setOptions: mockSetOptions }),
    useRouter: () => ({ back: mockBack }),
    useFocusEffect: (effect: () => void | (() => void)) => {
      React.useEffect(() => effect(), [effect]);
    },
  };
});

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

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => mockUsePosterOverrides(),
}));

jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockUseAccountRequired(),
}));

jest.mock('@/src/components/cards/MovieCard', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');

  return {
    MovieCard: ({ movie, onLongPress }: any) =>
      React.createElement(
        Pressable,
        {
          testID: `movie-card-${movie.id}`,
          onLongPress: () => onLongPress?.(movie),
        },
        React.createElement(Text, null, movie.title)
      ),
  };
});

jest.mock('@/src/components/cards/TVShowCard', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');

  return {
    TVShowCard: ({ show, onLongPress }: any) =>
      React.createElement(
        Pressable,
        {
          testID: `tv-card-${show.id}`,
          onLongPress: () => onLongPress?.(show),
        },
        React.createElement(Text, null, show.name)
      ),
  };
});

jest.mock('@/src/components/ui/LoadingSkeleton', () => ({
  MovieCardSkeleton: () => null,
}));

jest.mock('@/src/components/AddToListModal', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');

  const AddToListModal = React.forwardRef(({ mediaItem, onDismiss }: any, ref: any) => {
    latestMediaItem = mediaItem;
    React.useImperativeHandle(ref, () => ({
      present: mockPresent,
      dismiss: mockDismiss,
    }));

    return React.createElement(
      View,
      null,
      React.createElement(Text, { testID: 'add-to-list-modal' }, mediaItem?.title || ''),
      React.createElement(
        Pressable,
        { testID: 'dismiss-add-to-list-modal', onPress: onDismiss },
        React.createElement(Text, null, 'Dismiss')
      )
    );
  });

  AddToListModal.displayName = 'AddToListModal';

  return { __esModule: true, default: AddToListModal };
});

jest.mock('@/src/components/ui/Toast', () => {
  const React = require('react');

  const Toast = React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      show: mockToastShow,
    }));
    return null;
  });

  Toast.displayName = 'Toast';

  return { __esModule: true, default: Toast };
});

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    FlashList: (props: any) => {
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

describe('MoodResultsScreen long press add-to-list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestMediaItem = null;
    mockUsePosterOverrides.mockReturnValue({
      overrides: {},
      resolvePosterPath: (_mediaType: string, _mediaId: number, fallbackPosterPath: string | null) =>
        fallbackPosterPath,
    });
    mockUseMoodDiscovery.mockImplementation(({ mediaType }: { mediaType: 'movie' | 'tv' }) => ({
      data: mediaType === 'movie' ? [movieItem] : [tvItem],
      isLoading: false,
      isError: false,
      error: null,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: jest.fn(),
      refetch: jest.fn(),
    }));
    mockUseAccountRequired.mockReturnValue(jest.fn(() => false));
  });

  it('opens AddToListModal for authenticated long press on a movie card', async () => {
    const { getByTestId } = render(<MoodResultsScreen />);

    fireEvent(getByTestId('movie-card-101'), 'longPress');

    await waitFor(() => {
      expect(getByTestId('add-to-list-modal')).toBeTruthy();
      expect(mockPresent).toHaveBeenCalledTimes(1);
    });

    expect(latestMediaItem).toEqual({
      id: 101,
      media_type: 'movie',
      title: 'Long Press Movie',
      name: undefined,
      poster_path: '/movie-poster.jpg',
      vote_average: 7.2,
      release_date: '2025-01-01',
      first_air_date: undefined,
      genre_ids: [1, 2],
    });
  });

  it('opens AddToListModal for authenticated long press on a TV card', async () => {
    const { getByText, getByTestId } = render(<MoodResultsScreen />);

    fireEvent.press(getByText('discover.tvShows'));

    await waitFor(() => {
      expect(getByTestId('tv-card-202')).toBeTruthy();
    });

    fireEvent(getByTestId('tv-card-202'), 'longPress');

    await waitFor(() => {
      expect(getByTestId('add-to-list-modal')).toBeTruthy();
      expect(mockPresent).toHaveBeenCalledTimes(1);
    });

    expect(latestMediaItem).toEqual({
      id: 202,
      media_type: 'tv',
      title: 'Long Press Show',
      name: 'Long Press Show',
      poster_path: '/tv-poster.jpg',
      vote_average: 8.1,
      release_date: '2024-02-02',
      first_air_date: '2024-02-02',
      genre_ids: [3, 4],
    });
  });

  it('blocks long press when account access is required', async () => {
    const accountRequiredGuard = jest.fn(() => true);
    mockUseAccountRequired.mockReturnValue(accountRequiredGuard);

    const { getByTestId, queryByTestId } = render(<MoodResultsScreen />);

    fireEvent(getByTestId('movie-card-101'), 'longPress');

    expect(accountRequiredGuard).toHaveBeenCalledTimes(1);
    expect(mockPresent).not.toHaveBeenCalled();
    expect(queryByTestId('add-to-list-modal')).toBeNull();
  });

  it('clears the selected media item when the modal is dismissed', async () => {
    const { getByTestId, queryByTestId } = render(<MoodResultsScreen />);

    fireEvent(getByTestId('movie-card-101'), 'longPress');

    await waitFor(() => {
      expect(getByTestId('add-to-list-modal')).toBeTruthy();
    });

    fireEvent.press(getByTestId('dismiss-add-to-list-modal'));

    await waitFor(() => {
      expect(queryByTestId('add-to-list-modal')).toBeNull();
    });
  });
});
