jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: ({ testID, style }: { testID?: string; style?: unknown }) => {
    const { View } = require('react-native');
    return <View testID={testID || 'media-image'} style={style} />;
  },
}));

jest.mock('@/src/api/tmdb', () => {
  const actual = jest.requireActual('@/src/api/tmdb');
  return {
    ...actual,
    getImageUrl: (path: string | null) => (path ? `https://image.tmdb.org/t/p${path}` : null),
  };
});

import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { UpNextEpisodeSection } from '@/src/components/detail/UpNextEpisodeSection';
import type { UpNextEpisode } from '@/src/components/detail/types';

const baseEpisode: UpNextEpisode = {
  id: 101,
  name: 'Freedom Day',
  overview: 'Overview',
  air_date: '2023-05-04',
  episode_number: 1,
  season_number: 1,
  still_path: '/still.jpg',
};

describe('UpNextEpisodeSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the up next label, title, and season/episode subtitle', () => {
    const { getByText, getByTestId } = render(
      <UpNextEpisodeSection episode={baseEpisode} onEpisodePress={jest.fn()} />
    );

    expect(getByTestId('up-next-episode-card')).toBeTruthy();
    expect(getByText('Up Next')).toBeTruthy();
    expect(getByText('Freedom Day')).toBeTruthy();
    expect(getByText('S1E1 • May 4, 2023')).toBeTruthy();
  });

  it('calls onEpisodePress with season and episode numbers when pressed', () => {
    const onEpisodePress = jest.fn();
    const { getByTestId } = render(
      <UpNextEpisodeSection episode={baseEpisode} onEpisodePress={onEpisodePress} />
    );

    fireEvent.press(getByTestId('up-next-episode-card'));

    expect(onEpisodePress).toHaveBeenCalledTimes(1);
    expect(onEpisodePress).toHaveBeenCalledWith(1, 1);
  });

  it('renders without a still image when still_path is null', () => {
    const { getByTestId, queryByTestId } = render(
      <UpNextEpisodeSection
        episode={{ ...baseEpisode, still_path: null }}
        onEpisodePress={jest.fn()}
      />
    );

    expect(getByTestId('up-next-episode-card')).toBeTruthy();
    expect(queryByTestId('media-image')).toBeNull();
  });

  it('shows TBA when air date is missing', () => {
    const { getByText } = render(
      <UpNextEpisodeSection
        episode={{ ...baseEpisode, air_date: null }}
        onEpisodePress={jest.fn()}
      />
    );

    expect(getByText('S1E1 • TBA')).toBeTruthy();
  });

  it('uses the user accent color for the card outline and label', () => {
    const { getByTestId, getByText } = render(
      <UpNextEpisodeSection episode={baseEpisode} onEpisodePress={jest.fn()} />
    );

    // Global AccentColorProvider mock resolves accentColor to #6B46C1 (107, 70, 193),
    // and the border uses it faded to 50% opacity
    const cardStyle = StyleSheet.flatten(getByTestId('up-next-episode-card').props.style);
    expect(cardStyle.borderColor).toBe('rgba(107, 70, 193, 0.5)');

    const labelStyle = StyleSheet.flatten(getByText('Up Next').props.style);
    expect(labelStyle.color).toBe('#6B46C1');
  });

  it('renders a faded chevron affordance at the end of the card', () => {
    const { getAllByTestId } = render(
      <UpNextEpisodeSection episode={baseEpisode} onEpisodePress={jest.fn()} />
    );

    // Lucide propagates testID to its inner Svg, so match all and assert on the outer icon
    const chevrons = getAllByTestId('up-next-chevron');
    expect(chevrons.length).toBeGreaterThan(0);
    const chevronStyle = StyleSheet.flatten(chevrons[0].props.style);
    expect(chevronStyle.opacity).toBe(0.6);
  });

  it('uses the compact still dimensions', () => {
    const { getByTestId } = render(
      <UpNextEpisodeSection episode={baseEpisode} onEpisodePress={jest.fn()} />
    );

    const stillStyle = StyleSheet.flatten(getByTestId('media-image').props.style);
    expect(stillStyle.width).toBe(101);
    expect(stillStyle.height).toBe(57);
  });
});
