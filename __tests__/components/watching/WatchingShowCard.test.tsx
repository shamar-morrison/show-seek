import { InProgressShow } from '@/src/types/episodeTracking';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/src/context/TabContext', () => ({
  useCurrentTab: () => 'library',
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#E50914' }),
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    resolvePosterPath: (_type: string, _id: number, path: string | null) => path,
  }),
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: 'MediaImage',
}));

jest.mock('@/src/components/ui/AnimatedCheck', () => ({
  AnimatedCheck: () => null,
}));

jest.mock('@/src/components/ui/AppIcon', () => ({
  AppIcon: (props: any) => {
    const { View } = require('react-native');
    return <View testID="app-icon" {...props} />;
  },
}));

const mockT: any = (key: string, options?: any) => {
  if (key === 'watching.next') return 'Next';
  if (key === 'watching.nextEpisode') return `${options?.seasonEpisode} · ${options?.title}`;
  if (key === 'media.seasonEpisode') return `S${options?.season}E${options?.episode}`;
  if (key === 'watching.caughtUp') return 'Caught up';
  if (key === 'watching.seriesComplete') return 'Series complete';
  if (key === 'watching.timeRemainingMinutes') return `${options?.count}m left`;
  if (key === 'watching.timeRemainingHoursMinutes') return `${options?.hours}h ${options?.minutes}m left`;
  if (key === 'watching.skipped') return `${options?.count} skipped`;
  return key;
};

const { WatchingShowCard } = require('@/src/components/watching/WatchingShowCard');

describe('WatchingShowCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseShow: InProgressShow = {
    tvShowId: 101,
    tvShowName: 'Test Show',
    posterPath: '/poster.jpg',
    backdropPath: '/backdrop.jpg',
    lastUpdated: 1000,
    percentage: 50,
    timeRemaining: 45,
    isHidden: false,
    showEnded: false,
    lastWatchedEpisode: { season: 1, episode: 2, title: 'Episode 2' },
    nextEpisode: null,
  };

  it('renders correctly and navigates to season for unwatched aired episodes', () => {
    const show: InProgressShow = {
      ...baseShow,
      percentage: 50,
      timeRemaining: 45,
      nextEpisode: {
        kind: 'unwatched',
        season: 1,
        episode: 3,
        title: 'Episode 3',
      },
    };

    const { getByText, queryByTestId } = render(<WatchingShowCard show={show} t={mockT} />);

    expect(getByText('Test Show')).toBeTruthy();
    expect(getByText('Next')).toBeTruthy();
    expect(getByText(/S1E3 · Episode 3/)).toBeTruthy();
    expect(getByText('45m left')).toBeTruthy();
    // Play icon should be visible
    expect(queryByTestId('app-icon')).toBeTruthy();

    fireEvent.press(getByText('Test Show'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/library/tv/101/seasons?season=1');
  });

  it('renders correctly and navigates to generic seasons screen for upcoming episodes', () => {
    const show: InProgressShow = {
      ...baseShow,
      percentage: 80,
      timeRemaining: 0,
      nextEpisode: {
        kind: 'upcoming',
        season: 2,
        episode: 1,
        title: 'Season 2 Premiere',
      },
    };

    const { getByText, queryByText, queryByTestId } = render(<WatchingShowCard show={show} t={mockT} />);

    expect(getByText('Test Show')).toBeTruthy();
    expect(getByText('Next')).toBeTruthy();
    expect(getByText(/S2E1 · Season 2 Premiere/)).toBeTruthy();
    // timeRemaining should be hidden for upcoming
    expect(queryByText(/left/)).toBeNull();
    // Play icon should be hidden for upcoming
    expect(queryByTestId('app-icon')).toBeNull();

    fireEvent.press(getByText('Test Show'));
    // Should route to generic seasons screen (no season param)
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/library/tv/101/seasons');
  });

  it('renders Series complete and navigates to show detail page for complete series', () => {
    const show: InProgressShow = {
      ...baseShow,
      percentage: 100,
      timeRemaining: 0,
      showEnded: true,
      nextEpisode: {
        kind: 'complete',
      },
    };

    const { getByText, queryByText, queryByTestId } = render(<WatchingShowCard show={show} t={mockT} />);

    expect(getByText('Test Show')).toBeTruthy();
    expect(getByText('Series complete')).toBeTruthy();
    // "Next" label should NOT be present for complete
    expect(queryByText('Next')).toBeNull();
    // timeRemaining should be hidden
    expect(queryByText(/left/)).toBeNull();
    // Play icon should be hidden
    expect(queryByTestId('app-icon')).toBeNull();

    fireEvent.press(getByText('Test Show'));
    // Should route to show detail page
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/library/tv/101');
  });

  it('shows how many episodes were skipped next to the episode after the furthest one', () => {
    const show: InProgressShow = {
      ...baseShow,
      skippedCount: 1,
      nextEpisode: { kind: 'unwatched', season: 1, episode: 7, title: 'Episode 7' },
    };

    const { getByText, getByTestId } = render(<WatchingShowCard show={show} t={mockT} />);

    expect(getByText(/S1E7 · Episode 7/)).toBeTruthy();
    expect(getByTestId('watching-card-skipped')).toHaveTextContent(' · 1 skipped');

    fireEvent.press(getByText('Test Show'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/library/tv/101/seasons?season=1');
  });

  it('keeps the skipped count on a show counted as complete', () => {
    const show: InProgressShow = {
      ...baseShow,
      percentage: 80,
      showEnded: true,
      skippedCount: 2,
      nextEpisode: { kind: 'complete' },
    };

    const { getByText, getByTestId } = render(<WatchingShowCard show={show} t={mockT} />);

    expect(getByText('Series complete')).toBeTruthy();
    expect(getByTestId('watching-card-skipped')).toHaveTextContent(' · 2 skipped');
  });

  it('shows no skipped count without skipped episodes, or for an unavailable show', () => {
    const next = { kind: 'unwatched' as const, season: 1, episode: 3, title: 'Episode 3' };
    const { queryByTestId, rerender } = render(
      <WatchingShowCard show={{ ...baseShow, nextEpisode: next }} t={mockT} />
    );
    expect(queryByTestId('watching-card-skipped')).toBeNull();

    rerender(<WatchingShowCard show={{ ...baseShow, skippedCount: 0, nextEpisode: next }} t={mockT} />);
    expect(queryByTestId('watching-card-skipped')).toBeNull();

    rerender(
      <WatchingShowCard
        show={{ ...baseShow, skippedCount: 3, isUnavailable: true, nextEpisode: null }}
        t={mockT}
      />
    );
    expect(queryByTestId('watching-card-skipped')).toBeNull();
  });
});
