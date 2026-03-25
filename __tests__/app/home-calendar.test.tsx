import React from 'react';
import { render } from '@testing-library/react-native';

const mockReleaseCalendar = jest.fn();
const mockRefresh = jest.fn().mockResolvedValue(undefined);
let mockProgressiveReady = true;

const mockPremiumState = {
  isPremium: false,
  isLoading: false,
};

const createRelease = (id: number) => ({
  id,
  mediaType: 'movie' as const,
  title: `Release ${id}`,
  posterPath: null,
  backdropPath: null,
  releaseDate: new Date(2026, 1, 10 + id),
  isReminder: false,
  sourceLists: ['watchlist'],
  uniqueKey: `release-${id}`,
});

const mockUpcomingState = {
  sections: [
    {
      title: 'February 2026',
      data: [createRelease(1)],
    },
  ],
  allReleases: [createRelease(1), createRelease(2), createRelease(3), createRelease(4)],
  isLoading: false,
  isLoadingEnrichment: false,
  isRefreshing: false,
  refresh: mockRefresh,
  error: null,
};

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
}));

jest.mock('@/src/hooks/useUpcomingReleases', () => ({
  useUpcomingReleases: () => mockUpcomingState,
}));

jest.mock('@/src/hooks/useProgressiveRender', () => ({
  useProgressiveRender: () => ({ isReady: mockProgressiveReady }),
}));

jest.mock('@/src/components/calendar/ReleaseCalendar', () => ({
  ReleaseCalendar: (props: any) => {
    mockReleaseCalendar(props);
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { testID: 'release-calendar' });
  },
}));

jest.mock('@/src/components/ui/InlineUpdatingIndicator', () => ({
  InlineUpdatingIndicator: ({ message }: { message: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, message);
  },
}));

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { testID: 'calendar-loading' });
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

import CalendarScreen from '@/app/(tabs)/home/calendar';

describe('CalendarScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefresh.mockClear();
    mockProgressiveReady = true;
    mockPremiumState.isPremium = false;
    mockPremiumState.isLoading = false;
    mockUpcomingState.sections = [
      {
        title: 'February 2026',
        data: [createRelease(1)],
      },
    ];
    mockUpcomingState.allReleases = [
      createRelease(1),
      createRelease(2),
      createRelease(3),
      createRelease(4),
    ];
    mockUpcomingState.isLoading = false;
    mockUpcomingState.isLoadingEnrichment = false;
    mockUpcomingState.isRefreshing = false;
    mockUpcomingState.refresh = mockRefresh;
  });

  it('passes free-preview props for signed-in free users', () => {
    render(<CalendarScreen />);

    expect(mockReleaseCalendar).toHaveBeenCalledTimes(1);
    expect(mockReleaseCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        previewLimit: 3,
        showUpgradeOverlay: true,
      })
    );
  });

  it('passes full-access props for premium users', () => {
    mockPremiumState.isPremium = true;

    render(<CalendarScreen />);

    expect(mockReleaseCalendar).toHaveBeenCalledTimes(1);
    expect(mockReleaseCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        previewLimit: undefined,
        showUpgradeOverlay: false,
      })
    );
  });

  it('passes refresh props to the release calendar', () => {
    render(<CalendarScreen />);

    expect(mockReleaseCalendar).toHaveBeenCalledTimes(1);
    expect(mockReleaseCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshing: false,
        onRefresh: mockRefresh,
      })
    );
  });

  it('renders cached releases while enrichment is still loading', () => {
    mockUpcomingState.isLoadingEnrichment = true;

    const { getByTestId, getByText } = render(<CalendarScreen />);

    expect(getByTestId('release-calendar')).toBeTruthy();
    expect(getByText('Updating TV episodes...')).toBeTruthy();
  });

  it('defers cached calendar rendering until progressive render is ready', () => {
    mockProgressiveReady = false;

    const { getByTestId, queryByTestId } = render(<CalendarScreen />);

    expect(getByTestId('calendar-loading')).toBeTruthy();
    expect(queryByTestId('release-calendar')).toBeNull();
  });

  it('keeps showing loading while initial enrichment is building the first result set', () => {
    mockUpcomingState.sections = [];
    mockUpcomingState.allReleases = [];
    mockUpcomingState.isLoadingEnrichment = true;

    const { getByTestId, getByText, queryByTestId } = render(<CalendarScreen />);

    expect(getByTestId('calendar-loading')).toBeTruthy();
    expect(getByText('Updating TV episodes...')).toBeTruthy();
    expect(queryByTestId('release-calendar')).toBeNull();
    expect(mockReleaseCalendar).not.toHaveBeenCalled();
  });
});
