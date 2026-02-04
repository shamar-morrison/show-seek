// Mock lucide-react-native before any imports
jest.mock('lucide-react-native', () => ({
  ChevronDown: ({ testID }: { testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID || 'chevron-down-icon'} />;
  },
  ChevronRight: ({ testID }: { testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID || 'chevron-right-icon'} />;
  },
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: {
    Success: 'success',
    Error: 'error',
  },
}));

// Mock Alert
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

// Mock seasonScreenStyles
jest.mock('@/src/components/tv/seasonScreenStyles', () => ({
  seasonScreenStyles: {
    seasonContainer: {},
    seasonHeader: {},
    seasonPoster: {},
    seasonInfo: {},
    seasonTitle: {},
    seasonMeta: {},
    seasonProgressContainer: {},
    seasonOverview: {},
    seasonActions: {},
    markAllButton: {},
    markAllText: {},
    episodesContainer: {},
    seasonFullOverview: {},
  },
}));

// Mock EpisodeItem
jest.mock('@/src/components/tv/EpisodeItem', () => ({
  EpisodeItem: ({ episode, onPress }: { episode: { name: string }; onPress: () => void }) => {
    const { Text, TouchableOpacity } = require('react-native');
    return (
      <TouchableOpacity onPress={onPress} testID={`episode-${episode.name}`}>
        <Text>{episode.name}</Text>
      </TouchableOpacity>
    );
  },
}));

// Mock MediaImage
jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: ({ testID }: { testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID || 'media-image'} />;
  },
}));

// Mock ProgressBar
jest.mock('@/src/components/ui/ProgressBar', () => ({
  ProgressBar: () => {
    const { View } = require('react-native');
    return <View testID="progress-bar" />;
  },
}));

// Mock useSeasonProgress
jest.mock('@/src/hooks/useEpisodeTracking', () => ({
  useSeasonProgress: () => ({
    progress: { watchedCount: 3, totalAiredCount: 10 },
  }),
}));

import { fireEvent, renderWithProviders } from '@/__tests__/utils/test-utils';
import { SeasonItem, SeasonItemProps, SeasonWithEpisodes } from '@/src/components/tv/SeasonItem';
import React from 'react';
import { useTranslation } from 'react-i18next';

// Get the mock t function
const { t: mockT } = useTranslation();

const mockSeason: SeasonWithEpisodes = {
  id: 1,
  season_number: 1,
  name: 'Season 1',
  overview: 'The first season',
  air_date: '2020-01-15',
  poster_path: '/poster.jpg',
  episode_count: 10,
  episodes: [
    {
      id: 101,
      episode_number: 1,
      name: 'Pilot',
      overview: 'The first episode',
      air_date: '2020-01-15',
      still_path: '/still.jpg',
      vote_average: 8.5,
      runtime: 45,
      season_number: 1,
    },
    {
      id: 102,
      episode_number: 2,
      name: 'Episode 2',
      overview: 'The second episode',
      air_date: '2020-01-22',
      still_path: '/still2.jpg',
      vote_average: 8.7,
      runtime: 42,
      season_number: 1,
    },
  ],
};

const defaultProps: SeasonItemProps = {
  season: mockSeason,
  tvId: 100,
  showName: 'Test Show',
  showPosterPath: '/show-poster.jpg',
  isExpanded: false,
  onToggle: jest.fn(),
  onEpisodePress: jest.fn(),
  onMarkWatched: jest.fn(),
  onMarkUnwatched: jest.fn(),
  onMarkAllWatched: jest.fn(),
  episodeTracking: null,
  markWatchedPending: false,
  markUnwatchedPending: false,
  markWatchedVariables: undefined,
  markUnwatchedVariables: undefined,
  formatDate: (date) => date || 'TBA',
  ratings: undefined,
  showStatus: 'Returning Series',
  autoAddToWatching: false,
  listMembership: {},
  firstAirDate: '2020-01-15',
  voteAverage: 8.5,
  markPreviousEpisodesWatched: false,
  t: mockT,
};

describe('SeasonItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders season header correctly', () => {
    const { getByText } = renderWithProviders(<SeasonItem {...defaultProps} />);

    expect(getByText('Season 1')).toBeTruthy();
    expect(getByText(/10 Episodes/)).toBeTruthy();
  });

  it('calls onToggle when header is pressed', () => {
    const onToggle = jest.fn();
    const { getByText } = renderWithProviders(<SeasonItem {...defaultProps} onToggle={onToggle} />);

    fireEvent.press(getByText('Season 1'));
    expect(onToggle).toHaveBeenCalled();
  });

  it('shows episodes when expanded', () => {
    const { getByText } = renderWithProviders(<SeasonItem {...defaultProps} isExpanded={true} />);

    expect(getByText('Pilot')).toBeTruthy();
    expect(getByText('Episode 2')).toBeTruthy();
  });

  it('does not show episodes when collapsed', () => {
    const { queryByText } = renderWithProviders(
      <SeasonItem {...defaultProps} isExpanded={false} />
    );

    expect(queryByText('Pilot')).toBeNull();
  });

  it('calls onEpisodePress when an episode is pressed', () => {
    const onEpisodePress = jest.fn();
    const { getByTestId } = renderWithProviders(
      <SeasonItem {...defaultProps} isExpanded={true} onEpisodePress={onEpisodePress} />
    );

    fireEvent.press(getByTestId('episode-Pilot'));
    expect(onEpisodePress).toHaveBeenCalled();
  });

  it('shows Mark All button when expanded with aired episodes', () => {
    const { getByText } = renderWithProviders(<SeasonItem {...defaultProps} isExpanded={true} />);

    expect(getByText('Mark all')).toBeTruthy();
  });

  it('shows progress bar when there is progress', () => {
    const { getByTestId } = renderWithProviders(<SeasonItem {...defaultProps} />);

    expect(getByTestId('progress-bar')).toBeTruthy();
  });

  it('uses fallback name when season name is not provided', () => {
    const seasonWithoutName = {
      ...mockSeason,
      name: '',
    };

    const { getByText } = renderWithProviders(
      <SeasonItem {...defaultProps} season={seasonWithoutName} />
    );

    expect(getByText('Season 1')).toBeTruthy();
  });
});
