import React from 'react';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CALENDAR_SOURCES_STORAGE_KEY } from '@/src/utils/calendarViewModel';

const mockReleaseCalendar = jest.fn();
const mockRefresh = jest.fn().mockResolvedValue(undefined);
const mockSetOptions = jest.fn();
let latestSortModalProps: any = null;
let latestSourceFilterModalProps: any = null;

const mockPremiumState = {
  isPremium: false,
  isLoading: false,
};

const mockAuthState = {
  loading: false,
};

const mockListsState = {
  data: [],
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

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/hooks/useUpcomingReleases', () => ({
  useUpcomingReleases: () => mockUpcomingState,
}));

jest.mock('@/src/hooks/useLists', () => ({
  useLists: () => mockListsState,
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
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    latestSortModalProps = null;
    latestSourceFilterModalProps = null;
    mockPremiumState.isPremium = false;
    mockPremiumState.isLoading = false;
    mockAuthState.loading = false;
    mockListsState.data = [];
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

  async function renderCalendarAndWait() {
    const result = render(<CalendarScreen />);
    await waitFor(() => expect(mockReleaseCalendar).toHaveBeenCalled());
    return result;
  }

  it('passes filtered releases and free-preview props for free users', async () => {
    await renderCalendarAndWait();

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

  it('passes full-access props for premium users', async () => {
    mockPremiumState.isPremium = true;

    await renderCalendarAndWait();

    expect(mockReleaseCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        previewLimit: undefined,
      })
    );
  });

  it('passes refresh props to the release calendar', async () => {
    const { queryAllByTestId } = await renderCalendarAndWait();

    expect(mockReleaseCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        refreshing: false,
        onRefresh: mockRefresh,
      })
    );
    expect(queryAllByTestId('calendar-sort-modal-host')).toHaveLength(1);
    expect(queryAllByTestId('calendar-source-filter-modal-host')).toHaveLength(1);
  });

  it('reuses cached presentations when the media tabs change', async () => {
    const { getByTestId } = await renderCalendarAndWait();
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
    const screen = await renderCalendarAndWait();

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

    const screen = await renderCalendarAndWait();

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

  it('renders cached releases while enrichment is still loading', async () => {
    mockUpcomingState.isLoadingEnrichment = true;

    const { getByTestId, getByText } = await renderCalendarAndWait();

    expect(getByTestId('release-calendar')).toBeTruthy();
    expect(getByText('Updating TV episodes...')).toBeTruthy();
  });

  it('does not gate content on auth resolution', async () => {
    // Auth state is already resolved by the route-level gates before this
    // screen mounts, so a pending auth flag must not block content here.
    mockAuthState.loading = true;

    const screen = await renderCalendarAndWait();

    expect(screen.getByTestId('release-calendar')).toBeTruthy();
    expect(screen.queryByTestId('calendar-loading')).toBeNull();
  });

  it('shows the genuine empty state when there is no data, regardless of auth', async () => {
    const screen = await renderCalendarAndWait();

    mockUpcomingState.allReleases = [];
    mockAuthState.loading = true;
    screen.rerender(<CalendarScreen />);

    // No releases and nothing loading: empty state, not skeleton — auth
    // plays no role in this decision anymore
    expect(screen.getByText('No upcoming releases found')).toBeTruthy();
    expect(screen.queryByTestId('calendar-loading')).toBeNull();

    mockUpcomingState.allReleases = [
      createRelease({ id: 1, mediaType: 'movie', sourceLists: ['watchlist'] }),
    ];
    mockAuthState.loading = false;
    screen.rerender(<CalendarScreen />);

    await waitFor(() => expect(screen.getByTestId('release-calendar')).toBeTruthy());
    expect(screen.queryByTestId('calendar-loading')).toBeNull();
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

  it('hydrates a saved source selection instead of the defaults', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(['favorites']));

    await renderCalendarAndWait();

    expect(mockReleaseCalendar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        presentations: expect.objectContaining({
          all: expect.objectContaining({ totalContentCount: 1 }),
        }),
      })
    );
    await waitFor(() =>
      expect(
        renderLatestHeader().getByTestId('calendar-source-filter-active-indicator')
      ).toBeTruthy()
    );
  });

  it('does not write back the hydrated value on mount', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(['favorites']));

    await renderCalendarAndWait();

    // Hydration applied the saved value: the save effect must recognize it
    // as already-persisted (same reference) and stay silent
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('does not write on mount when there is nothing saved', async () => {
    await renderCalendarAndWait();

    // Defaults with no stored value: nothing user-driven happened, so the
    // absent key (which already means defaults) is left alone
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('keeps a user edit made while hydration is still in flight', async () => {
    // Read resolves quickly, lists take longer: the user edits inside the
    // window where the stored value is known but hydration is still waiting
    // on lists. Stored ['watchlist', 'favorites'] (2 releases) must NOT
    // clobber the user's ['reminders'] (1 release).
    let resolveGetItem!: (value: string | null) => void;
    (AsyncStorage.getItem as jest.Mock).mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          resolveGetItem = resolve;
        })
    );
    mockListsState.isLoading = true;

    const screen = render(<CalendarScreen />);

    await act(async () => {
      resolveGetItem(JSON.stringify(['watchlist', 'favorites']));
    });

    // Stored value is read but lists are still pending: user edits now
    await act(async () => {
      latestSourceFilterModalProps.onApply(['reminders']);
      latestSourceFilterModalProps.onClose();
    });

    // Lists settle -> hydration becomes eligible and must bail, keeping the
    // user's fresher choice instead of the stale persisted value
    mockListsState.isLoading = false;
    screen.rerender(<CalendarScreen />);

    await waitFor(() =>
      expect(mockReleaseCalendar).toHaveBeenLastCalledWith(
        expect.objectContaining({
          presentations: expect.objectContaining({
            all: expect.objectContaining({ totalContentCount: 1 }),
          }),
        })
      )
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      CALENDAR_SOURCES_STORAGE_KEY,
      JSON.stringify(['reminders'])
    );
  });

  it('drops unknown saved IDs but keeps the rest', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify(['watchlist', 'deleted-list'])
    );

    await renderCalendarAndWait();

    expect(mockReleaseCalendar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        presentations: expect.objectContaining({
          all: expect.objectContaining({ totalContentCount: 1 }),
        }),
      })
    );
  });

  it('falls back to defaults for a corrupt saved selection', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('not-json{{{');

    await renderCalendarAndWait();

    expect(mockReleaseCalendar).toHaveBeenLastCalledWith(
      expect.objectContaining({
        presentations: expect.objectContaining({
          all: expect.objectContaining({ totalContentCount: 4 }),
        }),
      })
    );
  });

  it('persists source selection changes to AsyncStorage', async () => {
    // Note: no renderLatestHeader() here — mounting a second tree would
    // silently disable subsequent fireEvents on the main tree (RNTL v13
    // only dispatches events for the most recently rendered root).
    await renderCalendarAndWait();

    await act(async () => {
      latestSourceFilterModalProps.onApply(['reminders']);
      latestSourceFilterModalProps.onClose();
    });

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        CALENDAR_SOURCES_STORAGE_KEY,
        JSON.stringify(['reminders'])
      )
    );
  });

  it('persists defaults again after Clear Filters resets the selection', async () => {
    const screen = await renderCalendarAndWait();

    await act(async () => {
      latestSourceFilterModalProps.onApply(['reminders']);
      latestSourceFilterModalProps.onClose();
    });

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        CALENDAR_SOURCES_STORAGE_KEY,
        JSON.stringify(['reminders'])
      )
    );

    (AsyncStorage.setItem as jest.Mock).mockClear();

    await act(async () => {
      latestSourceFilterModalProps.onApply([]);
      latestSourceFilterModalProps.onClose();
    });

    await waitFor(() => expect(screen.getByText('No releases match these filters')).toBeTruthy());

    fireEvent.press(screen.getByText('Clear Filters'));

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        CALENDAR_SOURCES_STORAGE_KEY,
        JSON.stringify(['watchlist', 'favorites', 'currently-watching', 'reminders'])
      )
    );
  });
});
