import MediaMoreTitlesScreen from '@/src/screens/MediaMoreTitlesScreen';
import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockFetchNextPage = jest.fn();
const mockIsAccountRequired = jest.fn(() => false);
const mockPresent = jest.fn();
let capturedGridProps: any = null;
let mockMoreTitles: any;

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: '550', title: 'Fight Club' }),
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));
jest.mock('@/src/context/TabContext', () => ({ useCurrentTab: () => 'home' }));
jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockIsAccountRequired,
}));
jest.mock('@/src/hooks/useContentFilter', () => ({
  useContentFilter: (items: { id: number }[]) => items.filter((item) => item.id !== 999),
}));
const mockGetListsForMedia = jest.fn((id: number, _type: string) =>
  id === 1 ? ['watchlist', 'favorites'] : []
);
jest.mock('@/src/hooks/useListMembership', () => ({
  useListMembership: () => ({ getListsForMedia: mockGetListsForMedia }),
}));
jest.mock('@/src/hooks/useMoreTitles', () => ({
  useMoreTitles: (...args: unknown[]) => mockMoreTitles(...args),
}));
jest.mock('@/src/components/library/MediaGrid', () => ({
  MediaGrid: (props: any) => {
    capturedGridProps = props;
    return null;
  },
}));
jest.mock('@/src/components/AddToListModal', () => {
  const React = require('react');
  const Modal = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ present: mockPresent }));
    const { View } = require('react-native');
    return <View testID="add-to-list" mediaItem={props.mediaItem} />;
  });
  return { __esModule: true, default: Modal };
});
jest.mock('@/src/components/ui/Toast', () => {
  const React = require('react');
  return { __esModule: true, default: React.forwardRef(() => null) };
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: { Medium: 'm' } }));

const movie = (id: number, title: string) => ({
  id,
  title,
  poster_path: `/${id}.jpg`,
  vote_average: 7.5,
  release_date: '2010-07-16',
  genre_ids: [18],
});

describe('MediaMoreTitlesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedGridProps = null;
    mockMoreTitles = jest.fn(() => ({
      items: [movie(1, 'Black Swan'), movie(999, 'Hidden'), movie(2, 'Drive')],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: mockFetchNextPage,
    }));
  });

  it.each([
    ['similar', 'movie', 'Similar Movies'],
    ['similar', 'tv', 'Similar TV Shows'],
    ['recommendations', 'movie', 'You May Also Like'],
  ] as const)('titles %s for a %s "%s" over the title', (kind, mediaType, heading) => {
    const { getByText } = render(<MediaMoreTitlesScreen kind={kind} mediaType={mediaType} />);

    expect(getByText(heading)).toBeTruthy();
    expect(getByText('Fight Club')).toBeTruthy();
    expect(mockMoreTitles).toHaveBeenCalledWith(kind, mediaType, 550);
  });

  it('shows the titles that pass the content filters', () => {
    render(<MediaMoreTitlesScreen kind="similar" mediaType="movie" />);

    expect(capturedGridProps.items.map((item: any) => item.title)).toEqual(['Black Swan', 'Drive']);
    expect(capturedGridProps.items[0]).toEqual(
      expect.objectContaining({ id: 1, media_type: 'movie', release_date: '2010-07-16' })
    );
  });

  it('loads the next page near the end, but not while one is loading or after the last', () => {
    const { rerender } = render(<MediaMoreTitlesScreen kind="similar" mediaType="movie" />);
    capturedGridProps.onEndReached();
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);

    mockMoreTitles = jest.fn(() => ({
      items: [],
      isLoading: false,
      isError: false,
      hasNextPage: true,
      isFetchingNextPage: true,
      fetchNextPage: mockFetchNextPage,
    }));
    rerender(<MediaMoreTitlesScreen kind="similar" mediaType="movie" />);
    capturedGridProps.onEndReached();
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
    expect(capturedGridProps.isFetchingMore).toBe(true);
  });

  it('shows which of your lists each title is in, like the rows on the detail page', () => {
    render(<MediaMoreTitlesScreen kind="recommendations" mediaType="movie" />);

    expect(capturedGridProps.getListIds(capturedGridProps.items[0])).toEqual([
      'watchlist',
      'favorites',
    ]);
    expect(capturedGridProps.getListIds(capturedGridProps.items[1])).toEqual([]);
    expect(mockGetListsForMedia).toHaveBeenCalledWith(1, 'movie');
  });

  it('opens a title in the current tab', () => {
    render(<MediaMoreTitlesScreen kind="similar" mediaType="tv" />);
    capturedGridProps.onItemPress({ id: 1396, media_type: 'tv' });
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/home/tv/1396');
  });

  it('adds a long-pressed title to a list, or asks guests to sign in', () => {
    const { getByTestId } = render(<MediaMoreTitlesScreen kind="similar" mediaType="movie" />);

    act(() => capturedGridProps.onItemLongPress(capturedGridProps.items[0]));
    expect(getByTestId('add-to-list').props.mediaItem).toEqual(
      expect.objectContaining({ id: 1, title: 'Black Swan' })
    );
    expect(getByTestId('add-to-list').props.mediaItem).not.toHaveProperty('addedAt');
    expect(mockPresent).toHaveBeenCalled();

    mockIsAccountRequired.mockReturnValueOnce(true);
    const guest = render(<MediaMoreTitlesScreen kind="similar" mediaType="movie" />);
    act(() => capturedGridProps.onItemLongPress(capturedGridProps.items[0]));
    expect(guest.queryByTestId('add-to-list')).toBeNull();
  });

  it('offers a retry when nothing could load', () => {
    const refetch = jest.fn();
    mockMoreTitles = jest.fn(() => ({
      items: [],
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    }));
    const { getByText } = render(
      <MediaMoreTitlesScreen kind="recommendations" mediaType="movie" />
    );
    expect(getByText("Couldn't load these titles")).toBeTruthy();
  });

  it('goes back from the header', () => {
    const { getByLabelText } = render(<MediaMoreTitlesScreen kind="similar" mediaType="movie" />);
    fireEvent.press(getByLabelText('Go Back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
