import PersonDetailScreen from '@/src/screens/PersonDetailScreen';
import { render } from '@testing-library/react-native';
import React from 'react';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockGetListsForMedia = jest.fn();
const mockUseQuery = jest.fn();

const mockMovie = {
  id: 101,
  title: 'Known Movie',
  original_title: 'Known Movie',
  overview: 'Movie overview',
  poster_path: '/movie.jpg',
  backdrop_path: null,
  release_date: '2024-01-01',
  vote_average: 8.4,
  vote_count: 1200,
  popularity: 250,
  genre_ids: [18],
  video: false,
  adult: false,
  original_language: 'en',
};

const mockTVShow = {
  id: 202,
  name: 'Known TV Show',
  original_name: 'Known TV Show',
  overview: 'TV overview',
  poster_path: '/tv.jpg',
  backdrop_path: null,
  first_air_date: '2023-01-01',
  vote_average: 7.9,
  vote_count: 900,
  popularity: 180,
  genre_ids: [18],
  original_language: 'en',
};

const mockPerson = {
  id: 99,
  name: 'Test Person',
  profile_path: null,
  known_for_department: 'Acting',
  popularity: 100,
  biography: 'Biography',
  birthday: null,
  deathday: null,
  place_of_birth: null,
  also_known_as: [],
  external_ids: {
    facebook_id: null,
    instagram_id: null,
    twitter_id: null,
    tiktok_id: null,
    youtube_id: null,
  },
};

jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  Stack.Screen = () => null;

  return {
    Stack,
    useLocalSearchParams: () => ({ id: '99' }),
    useRouter: () => ({
      push: mockPush,
      back: mockBack,
    }),
  };
});

jest.mock('@tanstack/react-query', () => ({
  useQuery: (args: any) => mockUseQuery(args),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = () => React.createElement(View, null);
  return {
    ArrowLeft: Icon,
    ArrowRight: Icon,
    Calendar: Icon,
    Facebook: Icon,
    Heart: Icon,
    Instagram: Icon,
    MapPin: Icon,
    Music2: Icon,
    Star: Icon,
    Twitter: Icon,
    Youtube: Icon,
  };
});

jest.mock('@/src/components/ui/AnimatedScrollHeader', () => ({
  AnimatedScrollHeader: () => null,
}));

jest.mock('@/src/components/ui/ExpandableText', () => ({
  ExpandableText: () => null,
}));

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { testID: 'media-image' });
  },
}));

jest.mock('@/src/components/ui/ListMembershipBadge', () => ({
  ListMembershipBadge: () => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { testID: 'list-membership-badge' });
  },
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'user-1' },
    isGuest: false,
  }),
}));

jest.mock('@/src/context/GuestAccessContext', () => ({
  useGuestAccess: () => ({
    requireAccount: jest.fn(),
  }),
}));

jest.mock('@/src/context/TabContext', () => ({
  useCurrentTab: () => 'discover',
}));

jest.mock('@/src/hooks/useAnimatedScrollHeader', () => ({
  useAnimatedScrollHeader: () => ({
    scrollY: 0,
    scrollViewProps: {},
  }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({
    preferences: {
      showOriginalTitles: false,
    },
  }),
}));

jest.mock('@/src/hooks/useListMembership', () => ({
  useListMembership: () => ({
    getListsForMedia: mockGetListsForMedia,
  }),
}));

jest.mock('@/src/hooks/useFavoritePersons', () => ({
  useIsPersonFavorited: () => ({
    isFavorited: false,
    isLoading: false,
  }),
  useAddFavoritePerson: () => ({
    isPending: false,
    mutateAsync: jest.fn(),
  }),
  useRemoveFavoritePerson: () => ({
    isPending: false,
    mutateAsync: jest.fn(),
  }),
}));

describe('PersonDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseQuery.mockImplementation(({ queryKey }: { queryKey: unknown[] }) => {
      const creditKey = queryKey[2];

      if (creditKey === 'movie-credits') {
        return {
          data: { cast: [mockMovie], crew: [] },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        };
      }

      if (creditKey === 'tv-credits') {
        return {
          data: { cast: [mockTVShow], crew: [] },
          isLoading: false,
          isError: false,
          refetch: jest.fn(),
        };
      }

      return {
        data: mockPerson,
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      };
    });
  });

  it('shows list indicators on known-for movie and TV cards when list membership exists', () => {
    mockGetListsForMedia.mockImplementation((mediaId: number, mediaType: 'movie' | 'tv') => {
      if (mediaId === 101 && mediaType === 'movie') return ['watchlist'];
      if (mediaId === 202 && mediaType === 'tv') return ['favorites'];
      return [];
    });

    const { getAllByTestId } = render(<PersonDetailScreen />);

    expect(getAllByTestId('list-membership-badge')).toHaveLength(2);
  });

  it('does not show list indicators when known-for items are not in any list', () => {
    mockGetListsForMedia.mockReturnValue([]);

    const { queryAllByTestId } = render(<PersonDetailScreen />);

    expect(queryAllByTestId('list-membership-badge')).toHaveLength(0);
  });
});
