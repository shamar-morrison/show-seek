import { fireEvent, renderWithProviders } from '@/__tests__/utils/test-utils';
import { ReleaseCalendar } from '@/src/components/calendar/ReleaseCalendar';
import { ReleaseSection, UpcomingRelease } from '@/src/hooks/useUpcomingReleases';
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

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    overrides: {},
    resolvePosterPath: (
      _mediaType: 'movie' | 'tv',
      _mediaId: number,
      fallbackPosterPath: string | null
    ) => fallbackPosterPath,
  }),
}));

function createRelease(id: number, day: number): UpcomingRelease {
  return {
    id,
    mediaType: 'movie',
    title: `Release ${id}`,
    posterPath: null,
    backdropPath: null,
    releaseDate: new Date(2026, 1, day),
    isReminder: false,
    sourceLists: ['watchlist'],
    uniqueKey: `release-${id}`,
  };
}

function createTVRelease(
  id: number,
  day: number,
  nextEpisode?: { seasonNumber: number; episodeNumber: number }
): UpcomingRelease {
  return {
    id,
    mediaType: 'tv',
    title: `TV Release ${id}`,
    posterPath: null,
    backdropPath: null,
    releaseDate: new Date(2026, 1, day),
    nextEpisode,
    isReminder: false,
    sourceLists: ['currently-watching'],
    uniqueKey: `tv-release-${id}-${nextEpisode?.seasonNumber ?? 'none'}-${nextEpisode?.episodeNumber ?? 'none'}`,
  };
}

function createSections(): ReleaseSection[] {
  return [
    {
      title: 'February 2026',
      data: [createRelease(1, 10), createRelease(2, 12)],
    },
    {
      title: 'March 2026',
      data: [createRelease(3, 14), createRelease(4, 16)],
    },
  ];
}

function findNodeByTestId(node: any, testID: string): any {
  if (!node || typeof node !== 'object') return null;
  if (node.props?.testID === testID) return node;

  const children = node.props?.children;
  const childNodes = Array.isArray(children) ? children : [children];

  for (const child of childNodes) {
    const result = findNodeByTestId(child, testID);
    if (result) return result;
  }

  return null;
}

function findNodeByProp(node: any, propName: string): any {
  if (!node || typeof node !== 'object') return null;
  if (node.props?.[propName]) return node;

  const children = node.props?.children;
  const childNodes = Array.isArray(children) ? children : [children];

  for (const child of childNodes) {
    const result = findNodeByProp(child, propName);
    if (result) return result;
  }

  return null;
}

function triggerFirstReleasePress(calendarList: any) {
  const renderedRows = calendarList.props.data as Array<{
    type: string;
    release?: UpcomingRelease;
  }>;
  const firstReleaseRow = renderedRows.find((row) => row.type === 'release');
  if (!firstReleaseRow) {
    throw new Error('Expected at least one release row');
  }
  const firstReleaseIndex = renderedRows.indexOf(firstReleaseRow);
  const itemNode = calendarList.props.renderItem({
    item: firstReleaseRow,
    index: firstReleaseIndex,
    target: 'Cell',
  });
  const pressableNode = findNodeByProp(itemNode, 'onPress');
  if (!pressableNode) {
    throw new Error('Expected a pressable release node');
  }
  pressableNode.props.onPress(pressableNode.props.release);
}

describe('ReleaseCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('limits the list to first 3 releases and limits date strip to preview dates', () => {
    const sections = createSections();
    const { getByTestId, queryAllByTestId } = renderWithProviders(
      <ReleaseCalendar sections={sections} previewLimit={3} />
    );

    const calendarList = getByTestId('release-calendar-section-list');
    const renderedRows = calendarList.props.data as Array<{
      type: string;
      title?: string;
      release?: UpcomingRelease;
    }>;
    const renderedReleases = renderedRows
      .filter((row) => row.type === 'release')
      .map((row) => row.release as UpcomingRelease);

    expect(renderedReleases).toHaveLength(3);
    expect(renderedReleases.map((release) => release.uniqueKey)).toEqual([
      'release-1',
      'release-2',
      'release-3',
    ]);
    expect(renderedRows.map((row) => row.type)).toEqual([
      'month-header',
      'release',
      'release',
      'month-header',
      'release',
    ]);
    expect(
      renderedRows.filter((row) => row.type === 'month-header').map((row) => row.title)
    ).toEqual(['February 2026', 'March 2026']);

    expect(queryAllByTestId(/release-calendar-date-item-/)).toHaveLength(3);
  });

  it('shows overlay only when configured', () => {
    const sections = createSections();
    const { getByTestId, rerender } = renderWithProviders(
      <ReleaseCalendar sections={sections} previewLimit={3} showUpgradeOverlay />
    );

    const calendarListWithOverlay = getByTestId('release-calendar-section-list');
    const overlayFooter = calendarListWithOverlay.props.ListFooterComponent;
    expect(overlayFooter).toBeTruthy();
    expect(overlayFooter.props.testID).toBe('release-calendar-upgrade-overlay');

    rerender(<ReleaseCalendar sections={sections} previewLimit={3} showUpgradeOverlay={false} />);

    const calendarListWithoutOverlay = getByTestId('release-calendar-section-list');
    expect(calendarListWithoutOverlay.props.ListFooterComponent).toBeNull();
  });

  it('scrolls to the tapped date without rebuilding the row data', () => {
    const sections = createSections();
    const { getByTestId } = renderWithProviders(<ReleaseCalendar sections={sections} />);

    const calendarList = getByTestId('release-calendar-section-list');
    const initialRows = calendarList.props.data;

    fireEvent.press(getByTestId('release-calendar-date-item-2026-02-14'));

    const updatedCalendarList = getByTestId('release-calendar-section-list');

    expect(updatedCalendarList.props.data).toBe(initialRows);
    expect(mockRecordInteraction).toHaveBeenCalledTimes(1);
    expect(mockScrollToIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 4,
        animated: true,
      })
    );
    expect(mockScrollToIndex.mock.calls[0][0].viewPosition).toBeUndefined();
  });

  it('keeps repeated taps on the selected date idempotent', () => {
    const sections = createSections();
    const { getByTestId } = renderWithProviders(<ReleaseCalendar sections={sections} />);

    const dateItem = getByTestId('release-calendar-date-item-2026-02-14');

    fireEvent.press(dateItem);
    fireEvent.press(dateItem);

    expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
    expect(mockScrollToEnd).not.toHaveBeenCalled();
  });

  it('uses tail-aligned scroll params for the last date in the strip', () => {
    const sections = createSections();
    const { getByTestId } = renderWithProviders(<ReleaseCalendar sections={sections} />);

    fireEvent.press(getByTestId('release-calendar-date-item-2026-02-16'));

    expect(mockRecordInteraction).toHaveBeenCalledTimes(1);
    expect(mockScrollToIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 5,
        animated: true,
        viewPosition: 1,
      })
    );
    expect(mockScrollToEnd).not.toHaveBeenCalled();
  });

  it('does not enable clipped subview removal on the calendar list', () => {
    const sections = createSections();
    const { getByTestId } = renderWithProviders(<ReleaseCalendar sections={sections} />);

    const calendarList = getByTestId('release-calendar-section-list');

    expect(calendarList.props.removeClippedSubviews).toBeUndefined();
  });

  it('calls onUpgradePress when upgrade button is pressed', () => {
    const onUpgradePress = jest.fn();
    const sections = createSections();
    const { getByTestId } = renderWithProviders(
      <ReleaseCalendar
        sections={sections}
        previewLimit={3}
        showUpgradeOverlay
        onUpgradePress={onUpgradePress}
      />
    );

    const calendarList = getByTestId('release-calendar-section-list');
    const overlayFooter = calendarList.props.ListFooterComponent;
    const upgradeButton = findNodeByTestId(overlayFooter, 'release-calendar-upgrade-button');

    expect(upgradeButton).toBeTruthy();
    upgradeButton.props.onPress();

    expect(onUpgradePress).toHaveBeenCalledTimes(1);
  });

  it('navigates movie releases to movie details', () => {
    const sections: ReleaseSection[] = [
      {
        title: 'February 2026',
        data: [createRelease(101, 10)],
      },
    ];

    const { getByTestId } = renderWithProviders(<ReleaseCalendar sections={sections} />);
    const calendarList = getByTestId('release-calendar-section-list');

    triggerFirstReleasePress(calendarList);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/home/movie/[id]',
      params: { id: 101 },
    });
  });

  it('navigates TV releases with episode metadata to episode details', () => {
    const sections: ReleaseSection[] = [
      {
        title: 'February 2026',
        data: [createTVRelease(202, 12, { seasonNumber: 2, episodeNumber: 3 })],
      },
    ];

    const { getByTestId } = renderWithProviders(<ReleaseCalendar sections={sections} />);
    const calendarList = getByTestId('release-calendar-section-list');

    triggerFirstReleasePress(calendarList);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/home/tv/[id]/season/[seasonNum]/episode/[episodeNum]',
      params: { id: 202, seasonNum: 2, episodeNum: 3 },
    });
  });

  it('falls back to TV show details when episode metadata is missing', () => {
    const sections: ReleaseSection[] = [
      {
        title: 'February 2026',
        data: [createTVRelease(303, 14)],
      },
    ];

    const { getByTestId } = renderWithProviders(<ReleaseCalendar sections={sections} />);
    const calendarList = getByTestId('release-calendar-section-list');

    triggerFirstReleasePress(calendarList);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(tabs)/home/tv/[id]',
      params: { id: 303 },
    });
  });

  it('passes pull-to-refresh props through to the FlashList', () => {
    const onRefresh = jest.fn();
    const sections = createSections();

    const { getByTestId } = renderWithProviders(
      <ReleaseCalendar sections={sections} refreshing={true} onRefresh={onRefresh} />
    );
    const calendarList = getByTestId('release-calendar-section-list');

    expect(calendarList.props.refreshing).toBe(true);
    expect(calendarList.props.onRefresh).toBe(onRefresh);
  });
});
