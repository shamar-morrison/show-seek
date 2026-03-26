import { fireEvent, renderWithProviders } from '@/__tests__/utils/test-utils';
import { ReleaseCalendar } from '@/src/components/calendar/ReleaseCalendar';
import type { UpcomingRelease } from '@/src/hooks/useUpcomingReleases';
import {
  buildCalendarPresentations,
  type CalendarSortMode,
} from '@/src/utils/calendarViewModel';
import { act, within } from '@testing-library/react-native';
import React from 'react';

const mockPush = jest.fn();
const mockScrollToIndex = jest.fn((params: any) => Promise.resolve(params));
const mockScrollToEnd = jest.fn((params: any) => Promise.resolve(params));
const mockScrollToOffset = jest.fn();
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
        scrollToOffset: mockScrollToOffset,
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
  ReleaseCalendarSkeleton: ({ showMediaFilterRow = true }: { showMediaFilterRow?: boolean }) => {
    const React = require('react');
    const { View } = require('react-native');

    return React.createElement(View, {
      testID: showMediaFilterRow ? 'calendar-loading' : 'calendar-loading-content-only',
    });
  },
}));

const LABELS = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  thisWeek: 'This Week',
  nextWeek: 'Next Week',
  movies: 'Movies',
  tvShows: 'TV Shows',
};

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

function createPresentations(
  releases: UpcomingRelease[],
  {
    sortMode = 'soonest',
    previewLimit,
  }: {
    sortMode?: CalendarSortMode;
    previewLimit?: number;
  } = {}
) {
  return buildCalendarPresentations({
    releases,
    sortMode,
    previewLimit,
    labels: LABELS,
    locale: 'en-US',
    referenceDate: new Date(2026, 1, 10),
  });
}

function flushProgressiveRender() {
  act(() => {
    jest.runOnlyPendingTimers();
  });
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
    const presentations = createPresentations(releases, { previewLimit: 3 });

    const { getByTestId, queryAllByTestId } = renderWithProviders(
      <ReleaseCalendar presentations={presentations} previewLimit={3} />
    );
    flushProgressiveRender();

    const calendarList = getByTestId('release-calendar-section-list-all');
    const renderedRows = calendarList.props.data as Array<{ type: string }>;

    expect(
      renderedRows.filter((row) => row.type === 'single-release' || row.type === 'grouped-release')
    ).toHaveLength(3);
    expect(queryAllByTestId(/release-calendar-temporal-tabs-all-tab-/)).toHaveLength(3);
  });

  it('does not render a sticky releasing-today banner in soonest mode', () => {
    const releases = [createRelease({ id: 1, day: 10 }), createRelease({ id: 2, day: 12 })];
    const presentations = createPresentations(releases);

    const { getByTestId } = renderWithProviders(<ReleaseCalendar presentations={presentations} />);
    flushProgressiveRender();

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
    const presentations = createPresentations(releases);

    const { getByTestId } = renderWithProviders(<ReleaseCalendar presentations={presentations} />);
    flushProgressiveRender();

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

  it('keeps repeated taps on the selected temporal tab idempotent after tab switches', () => {
    const releases = [createRelease({ id: 1, day: 10 }), createRelease({ id: 2, day: 18 })];
    const presentations = createPresentations(releases);

    const { getByTestId, rerender } = renderWithProviders(
      <ReleaseCalendar presentations={presentations} activeMediaFilter="all" />
    );
    flushProgressiveRender();

    const tab = getByTestId('release-calendar-temporal-tabs-all-tab-next-week');

    fireEvent.press(tab);
    fireEvent.press(tab);

    expect(mockScrollToIndex).toHaveBeenCalledTimes(1);

    rerender(<ReleaseCalendar presentations={presentations} activeMediaFilter="movie" />);
    flushProgressiveRender();
    rerender(<ReleaseCalendar presentations={presentations} activeMediaFilter="all" />);
    flushProgressiveRender();

    fireEvent.press(getByTestId('release-calendar-temporal-tabs-all-tab-next-week'));

    expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
  });

  it('restores per-media scroll offsets and temporal tab state when switching tabs', () => {
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
    const presentations = createPresentations(releases);

    const { getByTestId, rerender } = renderWithProviders(
      <ReleaseCalendar presentations={presentations} activeMediaFilter="all" />
    );
    flushProgressiveRender();

    mockScrollToOffset.mockClear();

    fireEvent.scroll(getByTestId('release-calendar-section-list-all'), {
      nativeEvent: { contentOffset: { y: 120 } },
    });
    fireEvent.press(getByTestId('release-calendar-temporal-tabs-all-tab-next-week'));

    rerender(<ReleaseCalendar presentations={presentations} activeMediaFilter="movie" />);
    expect(getByTestId('calendar-loading-content-only')).toBeTruthy();
    flushProgressiveRender();
    expect(mockScrollToOffset).toHaveBeenLastCalledWith({ offset: 0, animated: false });

    rerender(<ReleaseCalendar presentations={presentations} activeMediaFilter="all" />);
    expect(getByTestId('calendar-loading-content-only')).toBeTruthy();
    flushProgressiveRender();
    expect(mockScrollToOffset).toHaveBeenLastCalledWith({ offset: 120, animated: false });

    fireEvent.press(getByTestId('release-calendar-temporal-tabs-all-tab-next-week'));

    expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
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
    const presentations = createPresentations(releases);

    const { getByTestId } = renderWithProviders(<ReleaseCalendar presentations={presentations} />);
    flushProgressiveRender();

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

  it('renders readable metadata inside the dark content panel for single and grouped headers', () => {
    const releases = [
      createRelease({
        id: 111,
        day: 12,
        mediaType: 'tv',
        title: 'Single Show',
        nextEpisode: { seasonNumber: 3, episodeNumber: 7, episodeName: 'A Better Title' },
      }),
      createRelease({
        id: 222,
        day: 13,
        mediaType: 'tv',
        title: 'Grouped Show',
        nextEpisode: { seasonNumber: 1, episodeNumber: 1, episodeName: 'Start' },
      }),
      createRelease({
        id: 222,
        day: 14,
        mediaType: 'tv',
        title: 'Grouped Show',
        nextEpisode: { seasonNumber: 1, episodeNumber: 2, episodeName: 'Continue' },
      }),
    ];
    const presentations = createPresentations(releases);

    const { getByTestId } = renderWithProviders(<ReleaseCalendar presentations={presentations} />);
    flushProgressiveRender();

    const singleContent = within(
      getByTestId('release-calendar-single-content-tv-111-s3-e7-all')
    );
    expect(singleContent.getByText('Single Show')).toBeTruthy();
    expect(singleContent.getByText('Season 3 Episode 7')).toBeTruthy();
    expect(singleContent.getByText('A Better Title')).toBeTruthy();

    const groupedContent = within(getByTestId('release-calendar-group-content-tv-222-2026-02-all'));
    expect(groupedContent.getByText('Grouped Show')).toBeTruthy();
    expect(groupedContent.getByText('2 upcoming episodes')).toBeTruthy();
  });

  it('renders episode names for single and grouped TV rows', () => {
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
    const presentations = createPresentations(releases);

    const { getByText } = renderWithProviders(<ReleaseCalendar presentations={presentations} />);
    flushProgressiveRender();

    expect(getByText('The Episode Name')).toBeTruthy();
    expect(getByText('One')).toBeTruthy();
    expect(getByText('Two')).toBeTruthy();
  });

  it('shows a content-only skeleton before rendering a new media tab', () => {
    const releases = [
      createRelease({ id: 1, day: 10, mediaType: 'movie' }),
      createRelease({
        id: 2,
        day: 11,
        mediaType: 'tv',
        nextEpisode: { seasonNumber: 1, episodeNumber: 1, episodeName: 'Pilot' },
      }),
    ];
    const presentations = createPresentations(releases);

    const { getByTestId, queryByTestId, rerender } = renderWithProviders(
      <ReleaseCalendar presentations={presentations} activeMediaFilter="all" />
    );
    flushProgressiveRender();

    rerender(<ReleaseCalendar presentations={presentations} activeMediaFilter="tv" />);

    expect(getByTestId('calendar-loading-content-only')).toBeTruthy();
    expect(queryByTestId('release-calendar-section-list-tv')).toBeNull();

    flushProgressiveRender();

    expect(getByTestId('release-calendar-section-list-tv')).toBeTruthy();
  });

  it('shows the upgrade overlay automatically when previewing a truncated list', () => {
    const releases = [createRelease({ id: 1, day: 10 }), createRelease({ id: 2, day: 11 })];
    const presentations = createPresentations(releases, { previewLimit: 1 });
    const onUpgradePress = jest.fn();

    const { getByTestId } = renderWithProviders(
      <ReleaseCalendar
        presentations={presentations}
        previewLimit={1}
        onUpgradePress={onUpgradePress}
      />
    );
    flushProgressiveRender();

    fireEvent.press(getByTestId('release-calendar-upgrade-button-all'));

    expect(onUpgradePress).toHaveBeenCalledTimes(1);
  });

  it('renders the calendar skeleton while loading', () => {
    const presentations = createPresentations([]);

    const { getByTestId } = renderWithProviders(
      <ReleaseCalendar presentations={presentations} isLoading />
    );

    expect(getByTestId('calendar-loading')).toBeTruthy();
  });

  it('passes pull-to-refresh props through to the FlashList', () => {
    const onRefresh = jest.fn();
    const presentations = createPresentations([createRelease({ id: 1, day: 10 })]);

    const { getByTestId } = renderWithProviders(
      <ReleaseCalendar presentations={presentations} refreshing={true} onRefresh={onRefresh} />
    );
    flushProgressiveRender();
    const calendarList = getByTestId('release-calendar-section-list-all');

    expect(calendarList.props.refreshing).toBe(true);
    expect(calendarList.props.onRefresh).toBe(onRefresh);
  });
});
