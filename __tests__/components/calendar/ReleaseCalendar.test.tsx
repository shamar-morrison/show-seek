import { renderWithProviders } from '@/__tests__/utils/test-utils';
import { ReleaseCalendar } from '@/src/components/calendar/ReleaseCalendar';
import { ReleaseSection, UpcomingRelease } from '@/src/hooks/useUpcomingReleases';
import React from 'react';

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    overrides: {},
    resolvePosterPath: (_mediaType: 'movie' | 'tv', _mediaId: number, fallbackPosterPath: string | null) =>
      fallbackPosterPath,
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

describe('ReleaseCalendar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('limits the list to first 3 releases and limits date strip to preview dates', () => {
    const sections = createSections();
    const { getByTestId, queryAllByTestId } = renderWithProviders(
      <ReleaseCalendar sections={sections} previewLimit={3} />
    );

    const sectionList = getByTestId('release-calendar-section-list');
    const renderedSections = sectionList.props.sections as ReleaseSection[];
    const renderedReleases = renderedSections.flatMap((section) => section.data);

    expect(renderedReleases).toHaveLength(3);
    expect(renderedReleases.map((release) => release.uniqueKey)).toEqual([
      'release-1',
      'release-2',
      'release-3',
    ]);

    expect(queryAllByTestId(/release-calendar-date-item-/)).toHaveLength(3);
  });

  it('shows overlay only when configured', () => {
    const sections = createSections();
    const { getByTestId, rerender } = renderWithProviders(
      <ReleaseCalendar sections={sections} previewLimit={3} showUpgradeOverlay />
    );

    const sectionListWithOverlay = getByTestId('release-calendar-section-list');
    const overlayFooter = sectionListWithOverlay.props.ListFooterComponent;
    expect(overlayFooter).toBeTruthy();
    expect(overlayFooter.props.testID).toBe('release-calendar-upgrade-overlay');

    rerender(<ReleaseCalendar sections={sections} previewLimit={3} showUpgradeOverlay={false} />);

    const sectionListWithoutOverlay = getByTestId('release-calendar-section-list');
    expect(sectionListWithoutOverlay.props.ListFooterComponent).toBeNull();
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

    const sectionList = getByTestId('release-calendar-section-list');
    const overlayFooter = sectionList.props.ListFooterComponent;
    const upgradeButton = findNodeByTestId(overlayFooter, 'release-calendar-upgrade-button');

    expect(upgradeButton).toBeTruthy();
    upgradeButton.props.onPress();

    expect(onUpgradePress).toHaveBeenCalledTimes(1);
  });
});
