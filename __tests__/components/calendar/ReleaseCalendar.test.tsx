import { fireEvent, renderWithProviders } from '@/__tests__/utils/test-utils';
import { ReleaseCalendar } from '@/src/components/calendar/ReleaseCalendar';
import type { UpcomingRelease } from '@/src/hooks/useUpcomingReleases';
import React from 'react';

const mockPush = jest.fn();
const mockScrollToIndex = jest.fn((params: any) => Promise.resolve(params));
const mockScrollToEnd = jest.fn((params: any) => Promise.resolve(params));
const mockRecordInteraction = jest.fn();
const mockComputeVisibleIndices = jest.fn(() => ({
  startIndex: 0,
  endIndex: Number.MAX_SAFE_INTEGER,
}));

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');

  const FlashList = React.forwardRef(
    ({ data = [], renderItem, keyExtractor, ListFooterComponent, ...rest }: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        scrollToIndex: mockScrollToIndex,
        scrollToEnd: mockScrollToEnd,
        recordInteraction: mockRecordInteraction,
        computeVisibleIndices: mockComputeVisibleIndices,
      }));

      return React.createElement(
        View,
        {
          ...rest,
          data,
          renderItem,
          keyExtractor,
          ListFooterComponent,
        },
        [
          ...data.map((item: any, itemIndex: number) =>
            React.createElement(
              View,
              {
                key: keyExtractor ? keyExtractor(item, itemIndex) : `${itemIndex}`,
              },
              renderItem({ item, index: itemIndex, target: 'Cell' })
            )
          ),
          ListFooterComponent
            ? React.createElement(View, { key: 'footer' }, ListFooterComponent)
            : null,
        ]
      );
    }
  );

  FlashList.displayName = 'FlashList';

  return {
    FlashList,
    FlashListRef: {},
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    resolvePosterPath: (
      _mediaType: 'movie' | 'tv',
      _mediaId: number,
      fallbackPosterPath: string | null
    ) => fallbackPosterPath,
  }),
}));

jest.mock('@/src/components/calendar/ReleaseCalendarSkeleton', () => ({
  ReleaseCalendarSkeleton: () => {
    const React = require('react');
    const { View } = require('react-native');

    return React.createElement(View, { testID: 'calendar-loading' });
  },
}));

function createRelease({
  id,
  day,
  month = 1,
  mediaType = 'movie',
  title,
  nextEpisode,
}: {
  id: number;
  day: number;
  month?: number;
  mediaType?: 'movie' | 'tv';
  title?: string;
  nextEpisode?: {
    seasonNumber: number;
    episodeNumber: number;
    episodeName?: string;
  };
}): UpcomingRelease {
  return {
    id,
    mediaType,
    title: title ?? `${mediaType === 'movie' ? 'Movie' : 'TV'} ${id}`,
    posterPath: null,
    backdropPath: null,
    releaseDate: new Date(2026, month, day),
    nextEpisode,
    isReminder: false,
    sourceLists: mediaType === 'movie' ? ['watchlist'] : ['currently-watching'],
    uniqueKey:
      mediaType === 'tv' && nextEpisode
        ? `tv-${id}-s${nextEpisode.seasonNumber}-e${nextEpisode.episodeNumber}`
        : `${mediaType}-${id}`,
  };
}

describe('ReleaseCalendar', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.setSystemTime(new Date(2026, 1, 10));
    jest.clearAllMocks();
  });

  it('limits visible content rows and temporal tabs to the preview window', () => {
    const releases = [
      createRelease({ id: 1, day: 10 }),
      createRelease({ id: 2, day: 11 }),
      createRelease({ id: 3, day: 13 }),
      createRelease({ id: 4, day: 18 }),
      createRelease({ id: 5, day: 3, month: 2 }),
    ];

    const { getByTestId, queryAllByTestId } = renderWithProviders(
      <ReleaseCalendar releases={releases} sortMode="soonest" previewLimit={3} />
    );

    const calendarList = getByTestId('release-calendar-section-list-all');
    const renderedRows = calendarList.props.data as Array<{ type: string }>;

    expect(
      renderedRows.filter((row) => row.type === 'single-release' || row.type === 'grouped-release')
    ).toHaveLength(3);
    expect(queryAllByTestId(/release-calendar-temporal-tabs-all-tab-/)).toHaveLength(3);
  });

  it('does not render a sticky releasing-today banner in soonest mode', () => {
    const releases = [
      createRelease({ id: 1, day: 10 }),
      createRelease({ id: 2, day: 12 }),
    ];

    const { getByTestId } = renderWithProviders(
      <ReleaseCalendar releases={releases} sortMode="soonest" />
    );

    const calendarList = getByTestId('release-calendar-section-list-all');

    expect(calendarList.props.stickyHeaderIndices).toBeUndefined();
  });

  it('scrolls to the tapped temporal tab without changing the rendered row structure', () => {
    const releases = [
      createRelease({ id: 1, day: 10 }),
      createRelease({ id: 2, day: 11 }),
      createRelease({ id: 3, day: 13 }),
      createRelease({ id: 4, day: 18 }),
      createRelease({ id: 5, day: 3, month: 2 }),
    ];

    const { getByTestId } = renderWithProviders(
      <ReleaseCalendar releases={releases} sortMode="soonest" />
    );

    const calendarList = getByTestId('release-calendar-section-list-all');
    const initialRows = calendarList.props.data;

    fireEvent.press(getByTestId('release-calendar-temporal-tabs-all-tab-next-week'));

    const updatedCalendarList = getByTestId('release-calendar-section-list-all');

    expect(updatedCalendarList.props.data).toStrictEqual(initialRows);
    expect(mockRecordInteraction).toHaveBeenCalledTimes(1);
    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: 4,
      animated: true,
    });
  });

  it('keeps repeated taps on the selected temporal tab idempotent', () => {
    const releases = [
      createRelease({ id: 1, day: 10 }),
      createRelease({ id: 2, day: 18 }),
    ];

    const { getByTestId, rerender } = renderWithProviders(
      <ReleaseCalendar releases={releases} sortMode="soonest" />
    );

    const tab = getByTestId('release-calendar-temporal-tabs-all-tab-next-week');

    fireEvent.press(tab);
    fireEvent.press(tab);

    expect(mockScrollToIndex).toHaveBeenCalledTimes(1);

    rerender(<ReleaseCalendar releases={releases} sortMode="soonest" activeMediaFilter="movie" />);
    rerender(<ReleaseCalendar releases={releases} sortMode="soonest" activeMediaFilter="all" />);

    fireEvent.press(getByTestId('release-calendar-temporal-tabs-all-tab-next-week'));

    expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
  });

  it('preserves each media scene state when switching active tabs', () => {
    const releases = [
      createRelease({ id: 1, day: 10, mediaType: 'movie' }),
      createRelease({ id: 2, day: 18, mediaType: 'movie' }),
      createRelease({
        id: 3,
        day: 11,
        mediaType: 'tv',
        nextEpisode: { seasonNumber: 1, episodeNumber: 1, episodeName: 'Pilot' },
      }),
      createRelease({
        id: 4,
        day: 18,
        mediaType: 'tv',
        nextEpisode: { seasonNumber: 1, episodeNumber: 2, episodeName: 'Second' },
      }),
    ];

    const { getByTestId, rerender } = renderWithProviders(
      <ReleaseCalendar releases={releases} sortMode="soonest" activeMediaFilter="all" />
    );

    fireEvent.press(getByTestId('release-calendar-temporal-tabs-all-tab-next-week'));

    rerender(<ReleaseCalendar releases={releases} sortMode="soonest" activeMediaFilter="movie" />);

    fireEvent.press(getByTestId('release-calendar-temporal-tabs-movie-tab-next-week'));

    rerender(<ReleaseCalendar releases={releases} sortMode="soonest" activeMediaFilter="all" />);

    fireEvent.press(getByTestId('release-calendar-temporal-tabs-all-tab-next-week'));

    expect(mockScrollToIndex).toHaveBeenCalledTimes(2);
  });

  it('navigates grouped show headers to the TV show and grouped episodes to episode details', () => {
    const releases = [
      createRelease({
        id: 202,
        day: 12,
        mediaType: 'tv',
        nextEpisode: { seasonNumber: 2, episodeNumber: 3, episodeName: 'Third' },
      }),
      createRelease({
        id: 202,
        day: 13,
        mediaType: 'tv',
        nextEpisode: { seasonNumber: 2, episodeNumber: 4, episodeName: 'Fourth' },
      }),
    ];

    const { getByTestId } = renderWithProviders(
      <ReleaseCalendar releases={releases} sortMode="soonest" />
    );

    fireEvent.press(getByTestId('release-calendar-group-tv-202-2026-02-all'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/home/tv/[id]',
      params: { id: 202 },
    });

    fireEvent.press(getByTestId('release-calendar-grouped-episode-tv-202-s2-e3-all'));

    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/(tabs)/home/tv/[id]/season/[seasonNum]/episode/[episodeNum]',
      params: { id: 202, seasonNum: 2, episodeNum: 3 },
    });
  });

  it('does not render episode names for single or grouped TV rows', () => {
    const releases = [
      createRelease({
        id: 303,
        day: 12,
        mediaType: 'tv',
        nextEpisode: { seasonNumber: 1, episodeNumber: 5, episodeName: 'The Episode Name' },
      }),
      createRelease({
        id: 404,
        day: 13,
        mediaType: 'tv',
        nextEpisode: { seasonNumber: 2, episodeNumber: 1, episodeName: 'One' },
      }),
      createRelease({
        id: 404,
        day: 14,
        mediaType: 'tv',
        nextEpisode: { seasonNumber: 2, episodeNumber: 2, episodeName: 'Two' },
      }),
    ];

    const { queryByText } = renderWithProviders(
      <ReleaseCalendar releases={releases} sortMode="soonest" />
    );

    expect(queryByText('The Episode Name')).toBeNull();
    expect(queryByText('One')).toBeNull();
    expect(queryByText('Two')).toBeNull();
  });

  it('shows the upgrade overlay automatically when previewing a truncated list', () => {
    const releases = [
      createRelease({ id: 1, day: 10 }),
      createRelease({ id: 2, day: 11 }),
    ];
    const onUpgradePress = jest.fn();

    const { getByTestId } = renderWithProviders(
      <ReleaseCalendar
        releases={releases}
        sortMode="soonest"
        previewLimit={1}
        onUpgradePress={onUpgradePress}
      />
    );

    fireEvent.press(getByTestId('release-calendar-upgrade-button-all'));

    expect(onUpgradePress).toHaveBeenCalledTimes(1);
  });

  it('renders the calendar skeleton while loading', () => {
    const { getByTestId } = renderWithProviders(
      <ReleaseCalendar releases={[]} sortMode="soonest" isLoading />
    );

    expect(getByTestId('calendar-loading')).toBeTruthy();
  });

  it('passes pull-to-refresh props through to the FlashList', () => {
    const onRefresh = jest.fn();
    const releases = [createRelease({ id: 1, day: 10 })];

    const { getByTestId } = renderWithProviders(
      <ReleaseCalendar
        releases={releases}
        sortMode="soonest"
        refreshing={true}
        onRefresh={onRefresh}
      />
    );
    const calendarList = getByTestId('release-calendar-section-list-all');

    expect(calendarList.props.refreshing).toBe(true);
    expect(calendarList.props.onRefresh).toBe(onRefresh);
  });
});
