import type { UpcomingRelease } from '@/src/hooks/useUpcomingReleases';
import {
  buildCalendarPresentation,
  buildCalendarPresentations,
  filterUpcomingReleases,
} from '@/src/utils/calendarViewModel';

function createRelease({
  id,
  mediaType = 'movie',
  title = `Release ${id}`,
  releaseDate,
  sourceLists = ['watchlist'],
  isReminder = false,
  nextEpisode,
}: {
  id: number;
  mediaType?: 'movie' | 'tv';
  title?: string;
  releaseDate: Date;
  sourceLists?: string[];
  isReminder?: boolean;
  nextEpisode?: {
    seasonNumber: number;
    episodeNumber: number;
    episodeName?: string;
  };
}): UpcomingRelease {
  return {
    id,
    mediaType,
    title,
    posterPath: null,
    backdropPath: null,
    releaseDate,
    nextEpisode,
    isReminder,
    sourceLists,
    uniqueKey:
      mediaType === 'tv' && nextEpisode
        ? `tv-${id}-s${nextEpisode.seasonNumber}-e${nextEpisode.episodeNumber}`
        : `${mediaType}-${id}`,
  };
}

const LABELS = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  thisWeek: 'This Week',
  nextWeek: 'Next Week',
  movies: 'Movies',
  tvShows: 'TV Shows',
};

describe('calendarViewModel', () => {
  it('filters releases by media type and selected sources', () => {
    const releases = [
      createRelease({
        id: 1,
        releaseDate: new Date(2026, 0, 10),
        sourceLists: ['watchlist'],
      }),
      createRelease({
        id: 2,
        mediaType: 'tv',
        releaseDate: new Date(2026, 0, 11),
        sourceLists: ['favorites'],
        nextEpisode: { seasonNumber: 1, episodeNumber: 2, episodeName: 'Pilot' },
      }),
      createRelease({
        id: 3,
        releaseDate: new Date(2026, 0, 12),
        sourceLists: [],
        isReminder: true,
      }),
    ];

    expect(
      filterUpcomingReleases(releases, {
        mediaFilter: 'tv',
        selectedSources: ['favorites'],
      }).map((release) => release.id)
    ).toEqual([2]);

    expect(
      filterUpcomingReleases(releases, {
        mediaFilter: 'all',
        selectedSources: ['reminders'],
      }).map((release) => release.id)
    ).toEqual([3]);
  });

  it('builds temporal tabs and row anchors for soonest mode', () => {
    const referenceDate = new Date(2026, 0, 10);
    const releases = [
      createRelease({ id: 1, releaseDate: new Date(2026, 0, 10) }),
      createRelease({ id: 2, releaseDate: new Date(2026, 0, 11) }),
      createRelease({
        id: 3,
        mediaType: 'tv',
        title: 'Show One',
        releaseDate: new Date(2026, 0, 12),
        sourceLists: ['currently-watching'],
        nextEpisode: { seasonNumber: 1, episodeNumber: 3, episodeName: 'Episode 3' },
      }),
      createRelease({
        id: 3,
        mediaType: 'tv',
        title: 'Show One',
        releaseDate: new Date(2026, 0, 13),
        sourceLists: ['currently-watching'],
        nextEpisode: { seasonNumber: 1, episodeNumber: 4, episodeName: 'Episode 4' },
      }),
      createRelease({ id: 4, releaseDate: new Date(2026, 0, 18) }),
      createRelease({ id: 5, releaseDate: new Date(2026, 1, 3) }),
    ];

    const presentation = buildCalendarPresentation({
      releases,
      sortMode: 'soonest',
      labels: LABELS,
      locale: 'en-US',
      referenceDate,
    });

    expect(presentation.rows.map((row) => row.type)).toEqual([
      'section-header',
      'single-release',
      'single-release',
      'grouped-release',
      'single-release',
      'section-header',
      'single-release',
    ]);
    expect(presentation.temporalTabs.map((tab) => tab.label)).toEqual([
      'Today',
      'Tomorrow',
      'This Week',
      'Next Week',
      'February 2026',
    ]);
    expect(presentation.temporalTabAnchors).toEqual({
      today: 1,
      tomorrow: 2,
      'this-week': 3,
      'next-week': 4,
      'month-2026-02': 6,
    });
  });

  it('groups TV rows per month in soonest mode and across months in alphabetical mode', () => {
    const releases = [
      createRelease({
        id: 7,
        mediaType: 'tv',
        title: 'Shared Show',
        releaseDate: new Date(2026, 0, 12),
        sourceLists: ['currently-watching'],
        nextEpisode: { seasonNumber: 1, episodeNumber: 1, episodeName: 'One' },
      }),
      createRelease({
        id: 7,
        mediaType: 'tv',
        title: 'Shared Show',
        releaseDate: new Date(2026, 1, 2),
        sourceLists: ['currently-watching'],
        nextEpisode: { seasonNumber: 1, episodeNumber: 2, episodeName: 'Two' },
      }),
    ];

    const soonestPresentation = buildCalendarPresentation({
      releases,
      sortMode: 'soonest',
      labels: LABELS,
      locale: 'en-US',
      referenceDate: new Date(2026, 0, 10),
    });
    const alphabeticalPresentation = buildCalendarPresentation({
      releases,
      sortMode: 'alphabetical',
      labels: LABELS,
      locale: 'en-US',
      referenceDate: new Date(2026, 0, 10),
    });

    expect(soonestPresentation.totalContentCount).toBe(2);
    expect(alphabeticalPresentation.totalContentCount).toBe(1);
  });

  it('builds type sections with movies first and TV shows second', () => {
    const releases = [
      createRelease({
        id: 9,
        mediaType: 'tv',
        title: 'Show Later',
        releaseDate: new Date(2026, 0, 12),
        sourceLists: ['currently-watching'],
        nextEpisode: { seasonNumber: 1, episodeNumber: 3, episodeName: 'Three' },
      }),
      createRelease({
        id: 1,
        mediaType: 'movie',
        title: 'Movie First',
        releaseDate: new Date(2026, 0, 11),
      }),
    ];

    const presentation = buildCalendarPresentation({
      releases,
      sortMode: 'type',
      labels: LABELS,
      locale: 'en-US',
      referenceDate: new Date(2026, 0, 10),
    });

    expect(presentation.rows.map((row) => row.type)).toEqual([
      'section-header',
      'single-release',
      'section-header',
      'single-release',
    ]);
    const sectionTitles = presentation.rows
      .filter((row) => row.type === 'section-header')
      .map((row) => row.title);
    expect(sectionTitles).toEqual(['Movies', 'TV Shows']);
  });

  it('builds cached presentations for all, movie, and tv views from one release set', () => {
    const releases = [
      createRelease({
        id: 1,
        mediaType: 'movie',
        releaseDate: new Date(2026, 0, 11),
      }),
      createRelease({
        id: 2,
        mediaType: 'movie',
        releaseDate: new Date(2026, 0, 12),
      }),
      createRelease({
        id: 3,
        mediaType: 'tv',
        releaseDate: new Date(2026, 0, 13),
        sourceLists: ['currently-watching'],
        nextEpisode: { seasonNumber: 1, episodeNumber: 1, episodeName: 'Pilot' },
      }),
    ];

    const presentations = buildCalendarPresentations({
      releases,
      sortMode: 'soonest',
      labels: LABELS,
      locale: 'en-US',
      referenceDate: new Date(2026, 0, 10),
    });

    expect(presentations.all.totalContentCount).toBe(3);
    expect(presentations.movie.totalContentCount).toBe(2);
    expect(presentations.tv.totalContentCount).toBe(1);
  });
});
