import CollectionScreen from '@/src/screens/CollectionScreen';
import { render } from '@testing-library/react-native';
import React from 'react';

const mockUseQuery = jest.fn();
let mockProgressiveReady = true;

jest.mock('@tanstack/react-query', () => ({
  useQuery: (args: any) => mockUseQuery(args),
}));

jest.mock('@/src/hooks/useProgressiveRender', () => ({
  useProgressiveRender: () => ({ isReady: mockProgressiveReady }),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: '10' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock('@/src/context/TabContext', () => ({ useCurrentTab: () => 'home' }));
jest.mock('@/src/context/PremiumContext', () => ({ usePremium: () => ({ isPremium: true }) }));
jest.mock('@/src/hooks/useAccountRequired', () => ({ useAccountRequired: () => () => false }));
jest.mock('@/src/hooks/usePreferences', () => ({ usePreferences: () => ({ preferences: {} }) }));
jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    resolvePosterPath: (_t: string, _id: number, path: string) => path,
  }),
}));
jest.mock('@/src/hooks/useCollectionTracking', () => ({
  useCollectionTracking: () => ({
    tracking: null,
    isTracked: false,
    watchedCount: 0,
    totalMovies: 0,
    percentage: 0,
    isLoading: false,
  }),
  useCanTrackMoreCollections: () => ({
    canTrackMore: true,
    maxFreeCollections: 2,
    isPremiumLoading: false,
  }),
  useStartCollectionTracking: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStopCollectionTracking: () => ({ mutate: jest.fn(), isPending: false }),
}));
// Like the movie and TV screen tests: the skeleton's looping shimmer doesn't run under Jest.
jest.mock('@/src/components/collection/CollectionScreenSkeleton', () => ({
  CollectionScreenSkeleton: () => {
    const { View } = require('react-native');
    return <View testID="collection-skeleton" />;
  },
}));
jest.mock('@/src/components/ui/MediaImage', () => ({ MediaImage: () => null }));
jest.mock('@/src/components/ui/AnimatedScrollHeader', () => ({ AnimatedScrollHeader: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

const collection = {
  id: 10,
  name: 'Star Wars Collection',
  overview: 'A galaxy far, far away.',
  backdrop_path: '/b.jpg',
  parts: [
    { id: 1, title: 'A New Hope', release_date: '1977-05-25', poster_path: null, vote_average: 8 },
  ],
};

describe('CollectionScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProgressiveReady = true;
    mockUseQuery.mockReturnValue({ data: collection, isLoading: false, isError: false });
  });

  it('shows the skeleton for the first tick even when the collection is cached', () => {
    mockProgressiveReady = false;
    const { getByTestId, queryByText } = render(<CollectionScreen />);

    expect(getByTestId('collection-skeleton')).toBeTruthy();
    expect(queryByText('A New Hope')).toBeNull();
  });

  it('shows the skeleton, not a spinner, while the collection loads', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { getByTestId } = render(<CollectionScreen />);

    expect(getByTestId('collection-skeleton')).toBeTruthy();
  });

  it('shows the collection once ready', () => {
    const { getByText, queryByTestId } = render(<CollectionScreen />);

    expect(queryByTestId('collection-skeleton')).toBeNull();
    expect(getByText('A New Hope')).toBeTruthy();
  });
});
