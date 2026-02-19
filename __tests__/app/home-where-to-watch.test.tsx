import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return {
    ...actual,
    FlatList: ({ data = [], renderItem, keyExtractor, ...rest }: any) => (
      <actual.View {...rest}>
        {data.map((item: any, index: number) => (
          <actual.View key={keyExtractor ? keyExtractor(item, index) : index}>
            {renderItem({ item, index })}
          </actual.View>
        ))}
      </actual.View>
    ),
  };
});

const mockPush = jest.fn();
const mockRefetchLists = jest.fn();
const mockRequireAccount = jest.fn();

const mockAuthState = {
  user: { uid: 'user-1', isAnonymous: false } as null | { uid: string; isAnonymous?: boolean },
  isGuest: false,
};

const mockPremiumState = {
  isPremium: true,
};

const mockListsState = {
  data: [
    {
      id: 'watchlist',
      name: 'Should Watch',
      items: {
        101: {
          id: 101,
          media_type: 'movie',
          title: 'Movie A',
          poster_path: null,
          vote_average: 7,
          release_date: '2024-01-01',
          addedAt: 1,
        },
        202: {
          id: 202,
          media_type: 'tv',
          title: 'Show B',
          name: 'Show B',
          poster_path: null,
          vote_average: 8,
          release_date: '2023-01-01',
          addedAt: 1,
        },
      },
      createdAt: 1,
    },
  ],
  isLoading: false,
  isError: false,
  error: null as Error | null,
  refetch: mockRefetchLists,
};

const mockEnrichmentState = {
  providerMap: new Map<string, any>([
    [
      'movie-101',
      {
        flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png', display_priority: 1 }],
        rent: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/apple.png', display_priority: 2 }],
      },
    ],
    [
      'tv-202',
      {
        buy: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png', display_priority: 1 }],
      },
    ],
  ]),
  isLoadingEnrichment: false,
  enrichmentProgress: 1,
};

const mockMovieProviders = [
  { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png', display_priority: 1 },
  { provider_id: 2, provider_name: 'Apple TV', logo_path: '/apple.png', display_priority: 2 },
];

const mockTvProviders = [
  { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png', display_priority: 1 },
];

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockPush(...args),
  }),
}));

jest.mock('@/src/hooks/useLists', () => ({
  useLists: () => mockListsState,
}));

jest.mock('@/src/hooks/useWatchProviderEnrichment', () => ({
  useWatchProviderEnrichment: () => mockEnrichmentState,
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/context/GuestAccessContext', () => ({
  useGuestAccess: () => ({
    requireAccount: mockRequireAccount,
  }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#E50914' }),
}));

jest.mock('@/src/context/RegionProvider', () => ({
  useRegion: () => ({ region: 'US' }),
}));

jest.mock('@shopify/flash-list', () => {
  const { View } = require('react-native');
  return {
    FlashList: ({ data, renderItem, keyExtractor, ...rest }: any) => (
      <View {...rest}>
        {data.map((item: any, index: number) => (
          <View key={keyExtractor ? keyExtractor(item, index) : index}>
            {renderItem({ item, index })}
          </View>
        ))}
      </View>
    ),
  };
});

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('expo-blur', () => ({
  BlurView: 'BlurView',
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: jest.fn(() => undefined),
  }),
  useQuery: ({ queryKey }: any) => {
    if (!Array.isArray(queryKey) || queryKey.length !== 3 || queryKey[0] !== 'watch-providers-catalog') {
      throw new Error(`Unexpected queryKey shape in useQuery mock: ${JSON.stringify(queryKey)}`);
    }

    const mediaType = queryKey[2];
    if (mediaType === 'movie') {
      return { data: mockMovieProviders, isLoading: false };
    }
    if (mediaType === 'tv') {
      return { data: mockTvProviders, isLoading: false };
    }
    return { data: [], isLoading: false };
  },
}));

import WhereToWatchScreen from '@/app/(tabs)/home/where-to-watch';

describe('WhereToWatchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefetchLists.mockReset();
    mockRequireAccount.mockReset();
    mockAuthState.user = { uid: 'user-1', isAnonymous: false };
    mockAuthState.isGuest = false;
    mockPremiumState.isPremium = true;
    mockListsState.data = [
      {
        id: 'watchlist',
        name: 'Should Watch',
        items: {
          101: {
            id: 101,
            media_type: 'movie',
            title: 'Movie A',
            poster_path: null,
            vote_average: 7,
            release_date: '2024-01-01',
            addedAt: 1,
          },
          202: {
            id: 202,
            media_type: 'tv',
            title: 'Show B',
            name: 'Show B',
            poster_path: null,
            vote_average: 8,
            release_date: '2023-01-01',
            addedAt: 1,
          },
        },
        createdAt: 1,
      },
    ];
    mockListsState.isLoading = false;
    mockListsState.isError = false;
    mockListsState.error = null;
    mockEnrichmentState.isLoadingEnrichment = false;
    mockEnrichmentState.providerMap = new Map<string, any>([
      [
        'movie-101',
        {
          flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png', display_priority: 1 }],
          rent: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/apple.png', display_priority: 2 }],
        },
      ],
      [
        'tv-202',
        {
          buy: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png', display_priority: 1 }],
        },
      ],
    ]);
  });

  it('shows initial empty state and disables service selector before list selection', () => {
    const { getByText, getByTestId } = render(<WhereToWatchScreen />);

    expect(getByText('Choose a list')).toBeTruthy();
    expect(getByTestId('where-to-watch-service-selector').props.disabled).toBe(true);
  });

  it('blocks guest users from opening the list modal and prompts sign in', () => {
    mockAuthState.user = { uid: 'guest-user', isAnonymous: true };
    mockAuthState.isGuest = true;

    const { getByTestId, UNSAFE_getAllByType } = render(<WhereToWatchScreen />);

    fireEvent.press(getByTestId('where-to-watch-list-selector'));

    const [listModal] = UNSAFE_getAllByType(require('react-native').Modal);

    expect(mockRequireAccount).toHaveBeenCalledTimes(1);
    expect(listModal.props.visible).toBe(false);
  });

  it('shows list options when list modal is opened and data exists', () => {
    const { getByTestId, getByText } = render(<WhereToWatchScreen />);

    fireEvent.press(getByTestId('where-to-watch-list-selector'));

    expect(getByText('Should Watch')).toBeTruthy();
    expect(getByText('2 items')).toBeTruthy();
  });

  it('shows loading state in list modal while lists are loading', () => {
    mockListsState.isLoading = true;

    const { getByTestId, getByText } = render(<WhereToWatchScreen />);

    fireEvent.press(getByTestId('where-to-watch-list-selector'));

    expect(getByText('Loading...')).toBeTruthy();
  });

  it('shows error state in list modal and retries list fetch', () => {
    mockListsState.isError = true;
    mockListsState.error = new Error('Network failed');

    const { getByTestId, getByText } = render(<WhereToWatchScreen />);

    fireEvent.press(getByTestId('where-to-watch-list-selector'));

    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText('Network failed')).toBeTruthy();

    fireEvent.press(getByTestId('where-to-watch-list-retry-button'));
    expect(mockRefetchLists).toHaveBeenCalledTimes(1);
  });

  it('shows empty-state message in list modal when there are no lists', () => {
    mockListsState.data = [];

    const { getByTestId, queryByTestId } = render(<WhereToWatchScreen />);

    fireEvent.press(getByTestId('where-to-watch-list-selector'));

    expect(getByTestId('where-to-watch-empty-state')).toBeTruthy();
    expect(queryByTestId('where-to-watch-list-option-watchlist')).toBeNull();
  });

  it('shows enrichment indicator while provider enrichment is loading', async () => {
    mockEnrichmentState.isLoadingEnrichment = true;

    const { getByTestId, findByText } = render(<WhereToWatchScreen />);

    fireEvent.press(getByTestId('where-to-watch-list-selector'));
    fireEvent.press(getByTestId('where-to-watch-list-option-watchlist'));

    expect(await findByText('Updating availability...')).toBeTruthy();
  });

  it('filters results by flatrate only and excludes non-matching providers after enrichment', async () => {
    const { getByTestId, getByText, queryByText } = render(<WhereToWatchScreen />);

    fireEvent.press(getByTestId('where-to-watch-list-selector'));
    fireEvent.press(getByTestId('where-to-watch-list-option-watchlist'));

    fireEvent.press(getByTestId('where-to-watch-service-selector'));

    expect(getByText('Netflix')).toBeTruthy();
    expect(queryByText('Apple TV')).toBeNull();

    fireEvent.press(getByTestId('where-to-watch-service-option-8'));

    await waitFor(() => {
      expect(getByText('Movie A')).toBeTruthy();
    });

    expect(queryByText('Show B')).toBeNull();
  });

  it('shows premium overlay for free users and routes to premium on CTA press', () => {
    mockPremiumState.isPremium = false;

    const { getByTestId } = render(<WhereToWatchScreen />);

    fireEvent.press(getByTestId('where-to-watch-list-selector'));
    fireEvent.press(getByTestId('where-to-watch-list-option-watchlist'));

    expect(getByTestId('where-to-watch-premium-overlay')).toBeTruthy();

    fireEvent.press(getByTestId('where-to-watch-upgrade-button'));
    expect(mockPush).toHaveBeenCalledWith('/premium');
  });
});
