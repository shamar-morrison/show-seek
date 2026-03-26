import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';

const mockReleaseCalendar = jest.fn();
const mockRefresh = jest.fn().mockResolvedValue(undefined);
const mockSetOptions = jest.fn();
let latestSortModalProps: any = null;
let latestSourceFilterModalProps: any = null;

const mockPremiumState = {
  isPremium: false,
  isLoading: false,
};

const createRelease = ({
  id,
  mediaType = 'movie',
  sourceLists = ['watchlist'],
  isReminder = false,
}: {
  id: number;
  mediaType?: 'movie' | 'tv';
  sourceLists?: string[];
  isReminder?: boolean;
}) => ({
  id,
  mediaType,
  title: `Release ${id}`,
  posterPath: null,
  backdropPath: null,
  releaseDate: new Date(2026, 1, 10 + id),
  isReminder,
  sourceLists,
  uniqueKey: `${mediaType}-${id}`,
});

const mockUpcomingState = {
  sections: [],
  allReleases: [
    createRelease({ id: 1, mediaType: 'movie', sourceLists: ['watchlist'] }),
    createRelease({ id: 2, mediaType: 'tv', sourceLists: ['currently-watching'] }),
    createRelease({ id: 3, mediaType: 'movie', sourceLists: [], isReminder: true }),
    createRelease({ id: 4, mediaType: 'movie', sourceLists: ['favorites'] }),
  ],
  isLoading: false,
  isLoadingEnrichment: false,
  isRefreshing: false,
  refresh: mockRefresh,
  error: null,
};

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => mockPremiumState,
}));

jest.mock('@/src/hooks/useUpcomingReleases', () => ({
  useUpcomingReleases: () => mockUpcomingState,
}));

jest.mock('@/src/components/calendar/ReleaseCalendar', () => ({
  ReleaseCalendar: (props: any) => {
    const React = require('react');
    const { View } = require('react-native');
    mockReleaseCalendar(props);
    return React.createElement(View, { testID: 'release-calendar' });
  },
}));

jest.mock('@/src/components/calendar/ReleaseCalendarSkeleton', () => ({
  ReleaseCalendarSkeleton: () => {
    const React = require('react');
    const { View } = require('react-native');

    return React.createElement(View, { testID: 'calendar-loading' });
  },
}));

jest.mock('@/src/components/calendar/CalendarSortModal', () => ({
  CalendarSortModal: ({ visible, onApply, onClose }: any) => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');
    latestSortModalProps = { visible, onApply, onClose };

    return React.createElement(
      View,
      { testID: 'calendar-sort-modal-host' },
      visible
        ? React.createElement(
            Pressable,
            {
              testID: 'apply-alphabetical-sort',
              onPress: () => {
                onApply('alphabetical');
                onClose();
              },
            },
            React.createElement(Text, null, 'Apply Alphabetical')
          )
        : null
    );
  },
}));

jest.mock('@/src/components/calendar/CalendarSourceFilterModal', () => ({
  CalendarSourceFilterModal: ({ visible, onApply, onClose }: any) => {
    const React = require('react');
    const { Pressable, Text, View } = require('react-native');
    latestSourceFilterModalProps = { visible, onApply, onClose };

    return React.createElement(
      View,
      { testID: 'calendar-source-filter-modal-host' },
      visible
        ? React.createElement(
            View,
            null,
            React.createElement(
              Pressable,
              {
                testID: 'apply-reminder-filter',
                onPress: () => {
                  onApply(['reminders']);
                  onClose();
                },
              },
              React.createElement(Text, null, 'Apply Reminder Filter')
            ),
            React.createElement(
              Pressable,
              {
                testID: 'apply-empty-filter',
                onPress: () => {
                  onApply([]);
                  onClose();
                },
              },
              React.createElement(Text, null, 'Apply Empty Filter')
            )
          )
        : null
    );
  },
}));

jest.mock('@/src/components/ui/InlineUpdatingIndicator', () => ({
  InlineUpdatingIndicator: ({ message }: { message: string }) => {
    const React = require('react');
    const { Text } = require('react-native');

    return React.createElement(Text, null, message);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useNavigation: () => ({
    setOptions: mockSetOptions,
  }),
}));

import CalendarScreen from '@/app/(tabs)/home/calendar';

function renderLatestHeader() {
  const latestOptions = mockSetOptions.mock.calls[mockSetOptions.mock.calls.length - 1]?.[0];
  if (!latestOptions?.headerRight) {
    throw new Error('Expected headerRight to be configured');
  }

  return render(latestOptions.headerRight());
}

describe('CalendarScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefresh.mockClear();
    latestSortModalProps = null;
    latestSourceFilterModalProps = null;
    mockPremiumState.isPremium = false;
    mockPremiumState.isLoading = false;
    mockUpcomingState.allReleases = [
      createRelease({ id: 1, mediaType: 'movie', sourceLists: ['watchlist'] }),
      createRelease({ id: 2, mediaType: 'tv', sourceLists: ['currently-watching'] }),
      createRelease({ id: 3, mediaType: 'movie', sourceLists: [], isReminder: true }),
      createRelease({ id: 4, mediaType: 'movie', sourceLists: ['favorites'] }),
    ];
    mockUpcomingState.isLoading = false;
    mockUpcomingState.isLoadingEnrichment = false;
    mockUpcomingState.isRefreshing = false;
    mockUpcomingState.refresh = mockRefresh;
  });

  it('passes filtered releases and free-preview props for free users', () => {
    render(<CalendarScreen />);

    expect(mockReleaseCalendar).toHaveBeenCalledTimes(1);
    expect(mockReleaseCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        activeMediaFilter: 'all',
        previewLimit: 3,
        presentations: expect.objectContaining({
          all: expect.objectContaining({ totalContentCount: 4 }),
          movie: expect.objectContaining({ totalContentCount: 3 }),
          tv: expect.objectContaining({ totalContentCount: 1 }),
        }),
      })
    );
  });

  it('passes full-access props for premium users', () => {
    mockPremiumState.isPremium = true;

    render(<CalendarScreen />);

    expect(mockReleaseCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        previewLimit: undefined,
      })
    );
  });

  it('passes refresh props to the release calendar', () => {
    const { queryAllByTestId } = render(<CalendarScreen />);

    expect(mockReleaseCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshing: false,
        onRefresh: mockRefresh,
      })
    );
    expect(queryAllByTestId('calendar-sort-modal-host')).toHaveLength(1);
    expect(queryAllByTestId('calendar-source-filter-modal-host')).toHaveLength(1);
  });

  it('reuses cached presentations when the media tabs change', () => {
    const { getByTestId } = render(<CalendarScreen />);
    const initialProps = mockReleaseCalendar.mock.calls[mockReleaseCalendar.mock.calls.length - 1][0];

    fireEvent.press(getByTestId('calendar-media-filter-tab-tv'));

    expect(mockReleaseCalendar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        activeMediaFilter: 'tv',
        presentations: initialProps.presentations,
      })
    );
  });

  it('opens the sort control from the header and updates the sort mode', async () => {
    const screen = render(<CalendarScreen />);

    const header = renderLatestHeader();
    fireEvent.press(header.getByTestId('calendar-sort-button'));
    await waitFor(() => expect(latestSortModalProps?.visible).toBe(true));

    await act(async () => {
      latestSortModalProps.onApply('alphabetical');
      latestSortModalProps.onClose();
    });

    await waitFor(() =>
      expect(mockReleaseCalendar).toHaveBeenLastCalledWith(
        expect.objectContaining({
          presentations: expect.objectContaining({
            all: expect.objectContaining({ temporalTabs: [] }),
          }),
        })
      )
    );

    await waitFor(() =>
      expect(renderLatestHeader().getByTestId('calendar-sort-active-indicator')).toBeTruthy()
    );
    await waitFor(() => expect(screen.queryByTestId('apply-alphabetical-sort')).toBeNull());
  });

  it('opens the source filter from the header and can produce the filtered empty state', async () => {
    mockUpcomingState.allReleases = [
      createRelease({ id: 1, mediaType: 'movie', sourceLists: ['watchlist'] }),
    ];

    const screen = render(<CalendarScreen />);

    const header = renderLatestHeader();
    fireEvent.press(header.getByTestId('calendar-source-filter-button'));
    await waitFor(() => expect(latestSourceFilterModalProps?.visible).toBe(true));

    await act(async () => {
      latestSourceFilterModalProps.onApply([]);
      latestSourceFilterModalProps.onClose();
    });

    await waitFor(() => expect(screen.getByText('No releases match these filters')).toBeTruthy());

    await waitFor(() =>
      expect(renderLatestHeader().getByTestId('calendar-source-filter-active-indicator')).toBeTruthy()
    );
  });

  it('renders cached releases while enrichment is still loading', () => {
    mockUpcomingState.isLoadingEnrichment = true;

    const { getByTestId, getByText } = render(<CalendarScreen />);

    expect(getByTestId('release-calendar')).toBeTruthy();
    expect(getByText('Updating TV episodes...')).toBeTruthy();
  });

  it('keeps showing skeleton loading while the first result set is enriching', () => {
    mockUpcomingState.allReleases = [];
    mockUpcomingState.isLoadingEnrichment = true;

    const { getByTestId, getByText, queryAllByTestId, queryByTestId } = render(<CalendarScreen />);

    expect(getByTestId('calendar-loading')).toBeTruthy();
    expect(getByText('Updating TV episodes...')).toBeTruthy();
    expect(queryByTestId('release-calendar')).toBeNull();
    expect(mockReleaseCalendar).not.toHaveBeenCalled();
    expect(queryAllByTestId('calendar-sort-modal-host')).toHaveLength(1);
    expect(queryAllByTestId('calendar-source-filter-modal-host')).toHaveLength(1);
  });
});
