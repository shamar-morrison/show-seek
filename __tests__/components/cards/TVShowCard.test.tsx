import type { TVShow } from '@/src/api/tmdb';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { TouchableOpacity } from 'react-native';

const mockPush = jest.fn();
const mockUsePreferences = jest.fn();
const mockResolvePosterPath = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

jest.mock('@/src/hooks/useNavigation', () => ({
  useCurrentTab: () => 'home',
}));

const mockGetListsForListItem = jest.fn((_item: unknown) => [] as string[]);

jest.mock('@/src/hooks/useListMembership', () => ({
  useListMembership: () => ({
    getListsForMedia: () => [],
    getListsForListItem: (item: unknown) => mockGetListsForListItem(item),
  }),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => mockUsePreferences(),
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    overrides: {},
    resolvePosterPath: (...args: unknown[]) => mockResolvePosterPath(...args),
  }),
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: (props: any) => {
    const React = require('react');
    return React.createElement('Image', props);
  },
}));

jest.mock('@/src/components/ui/ListMembershipBadge', () => ({
  ListMembershipBadge: () => null,
}));

const { TVShowCard } = require('@/src/components/cards/TVShowCard');

describe('TVShowCard', () => {
  const show: TVShow = {
    id: 321,
    name: 'Localized Show',
    original_name: 'Original Show',
    overview: 'Test overview',
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    first_air_date: '2024-01-01',
    vote_average: 7.5,
    vote_count: 1000,
    popularity: 100,
    genre_ids: [18, 80],
    original_language: 'ja',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockResolvePosterPath.mockImplementation((_mediaType, _mediaId, fallbackPosterPath) => {
      return fallbackPosterPath as string | null;
    });
    mockUsePreferences.mockReturnValue({
      preferences: { dataSaver: false, showOriginalTitles: false },
    });
  });

  it('stands for one episode: shows its label, opens it and checks its own list membership', () => {
    const { getByText, queryByText, UNSAFE_getByType } = render(
      <TVShowCard show={show} seasonNumber={2} episodeNumber={12} entryLabel="S2E12 · Phoenix" />
    );

    expect(getByText('S2E12 · Phoenix')).toBeTruthy();
    expect(queryByText('7.5')).toBeNull();
    expect(mockGetListsForListItem).toHaveBeenCalledWith({
      id: 321,
      media_type: 'episode',
      season_number: 2,
      episode_number: 12,
    });
    expect(mockResolvePosterPath).toHaveBeenCalledWith('episode', 321, '/poster.jpg');

    fireEvent.press(UNSAFE_getByType(TouchableOpacity));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/home/tv/321/season/2/episode/12');
  });

  it('stands for one season when only a season number is given', () => {
    render(<TVShowCard show={show} seasonNumber={0} entryLabel="Specials" />);

    expect(mockGetListsForListItem).toHaveBeenCalledWith({
      id: 321,
      media_type: 'season',
      season_number: 0,
    });
  });

  it('does not render NaN for an invalid release date and still shows the rating', () => {
    const invalidDateShow = {
      ...show,
      first_air_date: 'not-a-date',
    };

    const { getByText, queryByText } = render(
      <TVShowCard show={invalidDateShow} showListBadge={false} />
    );

    expect(queryByText('NaN')).toBeNull();
    expect(getByText('7.5')).toBeTruthy();
  });

  it('applies container style overrides after defaults', () => {
    const { UNSAFE_getByType } = render(
      <TVShowCard
        show={show}
        width={130}
        showListBadge={false}
        containerStyle={{ marginRight: 0, marginBottom: 12 }}
      />
    );

    const touchable = UNSAFE_getByType(TouchableOpacity);
    const styleEntries = Array.isArray(touchable.props.style)
      ? touchable.props.style.filter(Boolean)
      : [touchable.props.style];

    expect(styleEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ marginRight: 0, marginBottom: 12 }),
        expect.objectContaining({ width: 130 }),
      ])
    );
  });

  it('resolves poster path with media identity', () => {
    render(<TVShowCard show={show} showListBadge={false} />);

    expect(mockResolvePosterPath).toHaveBeenCalledWith('tv', 321, '/poster.jpg');
  });

  it('prefers posterPathOverride when provided', () => {
    render(<TVShowCard show={show} showListBadge={false} posterPathOverride="/override.jpg" />);

    expect(mockResolvePosterPath).not.toHaveBeenCalled();
  });

  it('forwards long press with the TV show payload', () => {
    const onLongPress = jest.fn();
    const { UNSAFE_getByType } = render(
      <TVShowCard show={show} showListBadge={false} onLongPress={onLongPress} />
    );
    const touchable = UNSAFE_getByType(TouchableOpacity);

    fireEvent(touchable, 'longPress');

    expect(onLongPress).toHaveBeenCalledWith(show);
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.press(touchable);

    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.press(touchable);

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/home/tv/321');
  });
});
