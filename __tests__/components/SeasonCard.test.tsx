import type { Season } from '@/src/api/tmdb';
import { SeasonCard } from '@/src/components/SeasonCard';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

// Mock the dependencies
jest.mock('@/src/api/tmdb', () => ({
  getImageUrl: jest.fn((path: string) => `https://image.tmdb.org${path}`),
  TMDB_IMAGE_SIZES: {
    poster: { small: 'w185' },
  },
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: ({ source, style }: { source: { uri: string }; style: object }) => {
    const { View } = require('react-native');
    return <View testID="media-image" accessibilityLabel={source.uri} style={style} />;
  },
}));

jest.mock('@/src/components/ui/ProgressBar', () => ({
  ProgressBar: ({ current, total }: { current: number; total: number }) => {
    const { View, Text } = require('react-native');
    return (
      <View testID="progress-bar">
        <Text>{`${current}/${total}`}</Text>
      </View>
    );
  },
}));

jest.mock('@/src/hooks/useEpisodeTracking', () => ({
  useShowEpisodeTracking: jest.fn(() => ({
    data: null,
  })),
}));

// Mock constants
jest.mock('@/src/constants/theme', () => ({
  ACTIVE_OPACITY: 0.7,
  BORDER_RADIUS: { m: 8 },
  COLORS: { text: '#fff', textSecondary: '#888' },
  FONT_SIZE: { s: 14, xs: 12 },
  SPACING: { m: 16, s: 8, xs: 4 },
}));

describe('SeasonCard', () => {
  const mockOnPress = jest.fn();

  const createMockSeason = (overrides?: Partial<Season>): Season => ({
    id: 1,
    season_number: 1,
    name: 'Season 1',
    episode_count: 10,
    air_date: '2024-01-15',
    overview: 'Season overview',
    poster_path: '/poster.jpg',
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display season name', () => {
    const season = createMockSeason({ name: 'Season 1' });
    const { getByText } = render(
      <SeasonCard tvShowId={123} season={season} onPress={mockOnPress} />
    );

    expect(getByText('Season 1')).toBeTruthy();
  });

  it('should display episode count in plural form', () => {
    const season = createMockSeason({ episode_count: 10 });
    const { getByText } = render(
      <SeasonCard tvShowId={123} season={season} onPress={mockOnPress} />
    );

    expect(getByText('10 Episodes')).toBeTruthy();
  });

  it('should display episode count in singular form', () => {
    const season = createMockSeason({ episode_count: 1 });
    const { getByText } = render(
      <SeasonCard tvShowId={123} season={season} onPress={mockOnPress} />
    );

    expect(getByText('1 Episode')).toBeTruthy();
  });

  it('should call onPress with season number when pressed', () => {
    const season = createMockSeason({ season_number: 3 });
    const { root } = render(<SeasonCard tvShowId={123} season={season} onPress={mockOnPress} />);

    fireEvent.press(root);

    expect(mockOnPress).toHaveBeenCalledWith(3);
  });

  it('should render the poster image', () => {
    const season = createMockSeason({ poster_path: '/test-poster.jpg' });
    const { getByTestId } = render(
      <SeasonCard tvShowId={123} season={season} onPress={mockOnPress} />
    );

    const image = getByTestId('media-image');
    expect(image).toBeTruthy();
  });

  it('should not show progress bar when no episode tracking data', () => {
    const season = createMockSeason();
    const { queryByTestId } = render(
      <SeasonCard tvShowId={123} season={season} onPress={mockOnPress} />
    );

    expect(queryByTestId('progress-bar')).toBeNull();
  });
});
