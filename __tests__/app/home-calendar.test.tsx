import React from 'react';
import { render } from '@testing-library/react-native';

const mockReleaseCalendar = jest.fn();

const mockAuthState = {
  user: { uid: 'user-1', isAnonymous: false } as { uid?: string; isAnonymous?: boolean } | null,
};

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
  error: null,
};

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
}));

jest.mock('@/src/hooks/useUpcomingReleases', () => ({
  useUpcomingReleases: () => mockUpcomingState,
}));

jest.mock('@/src/components/calendar/ReleaseCalendar', () => ({
  ReleaseCalendar: (props: any) => {
    mockReleaseCalendar(props);
    return null;
  },
}));

jest.mock('@/src/components/ui/FullScreenLoading', () => ({
  FullScreenLoading: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

import CalendarScreen from '@/app/(tabs)/home/calendar';

describe('CalendarScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { uid: 'user-1', isAnonymous: false };
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
  });

  it('shows sign-in prompt for guests', () => {
    mockAuthState.user = null;

    const { getByText } = render(<CalendarScreen />);

    expect(getByText('Sign in to see your calendar')).toBeTruthy();
    expect(mockReleaseCalendar).not.toHaveBeenCalled();
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
});
