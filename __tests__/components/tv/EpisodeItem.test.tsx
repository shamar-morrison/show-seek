// Mock lucide-react-native before any imports
jest.mock('lucide-react-native', () => ({
  Calendar: ({ testID }: { testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID || 'calendar-icon'} />;
  },
  Check: ({ testID }: { testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID || 'check-icon'} />;
  },
  Star: ({ testID }: { testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID || 'star-icon'} />;
  },
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
  },
}));

// Mock seasonScreenStyles
jest.mock('@/src/components/tv/seasonScreenStyles', () => ({
  seasonScreenStyles: {
    episodeCard: {},
    episodeStillContainer: {},
    watchedOverlay: {},
    episodeStill: {},
    episodeStillWatched: {},
    episodeInfo: {},
    episodeHeader: {},
    episodeNumber: {},
    ratingsContainer: {},
    episodeRating: {},
    ratingText: {},
    episodeTitle: {},
    episodeMeta: {},
    metaItem: {},
    metaText: {},
    episodeOverview: {},
    watchButton: {},
    watchedButton: {},
    disabledButton: {},
    watchButtonText: {},
  },
}));

// Mock MediaImage
jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: ({ testID }: { testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID || 'media-image'} />;
  },
}));

import { fireEvent, renderWithProviders } from '@/__tests__/utils/test-utils';
import { EpisodeItem, EpisodeItemProps } from '@/src/components/tv/EpisodeItem';
import React from 'react';
import { useTranslation } from 'react-i18next';

// Get the mock t function
const { t: mockT } = useTranslation();

const mockEpisode = {
  id: 1,
  episode_number: 1,
  name: 'Pilot',
  overview: 'The first episode',
  air_date: '2020-01-15',
  still_path: '/still.jpg',
  vote_average: 8.5,
  runtime: 45,
  season_number: 1,
};

const defaultProps: EpisodeItemProps = {
  episode: mockEpisode,
  seasonNumber: 1,
  tvId: 100,
  showName: 'Test Show',
  showPosterPath: '/poster.jpg',
  isWatched: false,
  isPending: false,
  hasAired: true,
  userRating: 0,
  formatDate: (date) => date || 'TBA',
  onPress: jest.fn(),
  onMarkWatched: jest.fn(),
  onMarkUnwatched: jest.fn(),
  autoAddToWatching: false,
  listMembership: {},
  t: mockT,
};

describe('EpisodeItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders episode information correctly', () => {
    const { getByText } = renderWithProviders(<EpisodeItem {...defaultProps} />);

    expect(getByText('Episode 1')).toBeTruthy();
    expect(getByText('Pilot')).toBeTruthy();
    expect(getByText('The first episode')).toBeTruthy();
  });

  it('shows "Mark as Watched" button for unwatched aired episodes', () => {
    const { getByText } = renderWithProviders(<EpisodeItem {...defaultProps} />);

    expect(getByText('Mark as Watched')).toBeTruthy();
  });

  it('shows "Mark as Unwatched" button for watched episodes', () => {
    const { getByText } = renderWithProviders(<EpisodeItem {...defaultProps} isWatched={true} />);

    expect(getByText('Mark as Unwatched')).toBeTruthy();
  });

  it('shows "Not Yet Aired" for future episodes', () => {
    const { getByText } = renderWithProviders(<EpisodeItem {...defaultProps} hasAired={false} />);

    expect(getByText('Not yet aired')).toBeTruthy();
  });

  it('calls onPress when episode is tapped', () => {
    const onPress = jest.fn();
    const { getByText } = renderWithProviders(<EpisodeItem {...defaultProps} onPress={onPress} />);

    fireEvent.press(getByText('Pilot'));
    expect(onPress).toHaveBeenCalled();
  });

  it('calls onMarkWatched when watch button is pressed for unwatched episode', () => {
    const onMarkWatched = jest.fn();
    const { getByText } = renderWithProviders(
      <EpisodeItem {...defaultProps} onMarkWatched={onMarkWatched} />
    );

    fireEvent.press(getByText('Mark as Watched'));
    expect(onMarkWatched).toHaveBeenCalled();
  });

  it('calls onMarkUnwatched when watch button is pressed for watched episode', () => {
    const onMarkUnwatched = jest.fn();
    const { getByText } = renderWithProviders(
      <EpisodeItem {...defaultProps} isWatched={true} onMarkUnwatched={onMarkUnwatched} />
    );

    fireEvent.press(getByText('Mark as Unwatched'));
    expect(onMarkUnwatched).toHaveBeenCalled();
  });

  it('displays runtime when available', () => {
    const { getByText } = renderWithProviders(<EpisodeItem {...defaultProps} />);

    expect(getByText('• 45m')).toBeTruthy();
  });
});
