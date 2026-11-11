import MediaVideosScreen from '@/src/screens/MediaVideosScreen';
import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockUseQuery = jest.fn();
let capturedPlayerProps: any = null;

jest.mock('@tanstack/react-query', () => ({
  useQuery: (args: any) => mockUseQuery(args),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: '1399', title: 'Game of Thrones' }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));

jest.mock('@/src/components/VideoPlayerModal', () => ({
  __esModule: true,
  default: (props: any) => {
    capturedPlayerProps = props;
    return null;
  },
}));

// The real header needs safe-area insets; a plain input is enough to drive the search.
jest.mock('@/src/components/ui/SearchableHeader', () => {
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    SearchableHeader: ({ searchQuery, onSearchChange, onClose, placeholder }: any) => (
      <View>
        <TextInput
          testID="videos-search-input"
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder={placeholder}
        />
        <Pressable testID="videos-search-close" onPress={onClose}>
          <Text>close</Text>
        </Pressable>
      </View>
    ),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@shopify/flash-list', () => {
  const { View } = require('react-native');
  return {
    FlashList: (props: any) => (
      <View testID={props.testID}>
        {(props.data || []).map((item: any, index: number) => (
          <View key={props.keyExtractor(item, index)}>
            {props.renderItem({ item, index, target: 'Cell' })}
          </View>
        ))}
      </View>
    ),
  };
});

const videos = [
  { id: '1', key: 'trailer1', name: 'Official Trailer', site: 'YouTube', type: 'Trailer' },
  { id: '2', key: 'teaser1', name: 'Teaser', site: 'YouTube', type: 'Teaser' },
  {
    id: '3',
    key: 'bts1',
    name: 'Making Of',
    site: 'YouTube',
    type: 'Behind the Scenes',
    published_at: '2019-04-14T16:00:00.000Z',
  },
  { id: '4', key: 'trailer2', name: 'Season 8 Trailer', site: 'YouTube', type: 'Trailer' },
];

const loaded = (data: unknown) => ({ data, isLoading: false, isError: false, refetch: jest.fn() });

describe('MediaVideosScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedPlayerProps = null;
    const globalAny = global as any;
    globalAny.requestAnimationFrame = (callback: (timestamp: number) => void) => {
      callback(0);
      return 1;
    };
    globalAny.cancelAnimationFrame = jest.fn();
    mockUseQuery.mockReturnValue(loaded(videos));
  });

  it('loads the videos with the same query as the detail page', () => {
    render(<MediaVideosScreen mediaType="tv" />);
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['tv', 1399, 'videos'], enabled: true })
    );
  });

  it('shows a tab per type with counts, starting on the first', () => {
    const { getByText, getByTestId, queryByTestId } = render(<MediaVideosScreen mediaType="tv" />);

    expect(getByText('Game of Thrones')).toBeTruthy();
    expect(getByText('Trailers (2)')).toBeTruthy();
    expect(getByText('Teasers (1)')).toBeTruthy();
    expect(getByText('Behind the Scenes (1)')).toBeTruthy();
    expect(getByTestId('media-video-trailer1')).toBeTruthy();
    expect(getByTestId('media-video-trailer2')).toBeTruthy();
    expect(queryByTestId('media-video-teaser1')).toBeNull();
  });

  it('keeps the tab row from bouncing at the edges, which swallowed taps on the end tabs', () => {
    const { getByTestId } = render(<MediaVideosScreen mediaType="tv" />);

    expect(getByTestId('media-videos-tabs').props).toEqual(
      expect.objectContaining({
        horizontal: true,
        bounces: false,
        alwaysBounceHorizontal: false,
        overScrollMode: 'never',
      })
    );
  });

  it('switches type and shows the publish date', () => {
    const { getByTestId, getByText, queryByTestId } = render(<MediaVideosScreen mediaType="tv" />);

    fireEvent.press(getByTestId('media-videos-tab-Behind the Scenes'));

    expect(getByTestId('media-video-bts1')).toBeTruthy();
    expect(queryByTestId('media-video-trailer1')).toBeNull();
    expect(getByText('Apr. 14, 2019')).toBeTruthy();
  });

  it('plays the tapped video', () => {
    const { getByTestId } = render(<MediaVideosScreen mediaType="movie" />);
    expect(capturedPlayerProps.visible).toBe(false);

    fireEvent.press(getByTestId('media-video-trailer2'));

    expect(capturedPlayerProps).toEqual(
      expect.objectContaining({ visible: true, videoKey: 'trailer2', title: 'Season 8 Trailer' })
    );
  });

  describe('search', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const search = (utils: ReturnType<typeof render>, query: string) => {
      fireEvent.press(utils.getByTestId('media-videos-search-button'));
      expect(utils.getByPlaceholderText('Search videos…')).toBeTruthy();
      fireEvent.changeText(utils.getByTestId('videos-search-input'), query);
      act(() => {
        jest.advanceTimersByTime(200);
      });
    };

    it('filters every tab at once, ignoring case and accents, and stays on the tab', () => {
      const utils = render(<MediaVideosScreen mediaType="tv" />);

      search(utils, 'SÉASON');

      expect(utils.getByText('Trailers (1)')).toBeTruthy();
      expect(utils.getByText('Teasers (0)')).toBeTruthy();
      expect(utils.getByText('Behind the Scenes (0)')).toBeTruthy();
      expect(utils.getByTestId('media-video-trailer2')).toBeTruthy();
      expect(utils.queryByTestId('media-video-trailer1')).toBeNull();
    });

    it('dims tabs with no matches', () => {
      const utils = render(<MediaVideosScreen mediaType="tv" />);
      search(utils, 'making');

      const style = (testID: string) =>
        Object.assign({}, ...[utils.getByTestId(testID).props.style].flat(Infinity));
      expect(style('media-videos-tab-Teaser').opacity).toBe(0.5);
      expect(style('media-videos-tab-Behind the Scenes').opacity).toBeUndefined();
    });

    it('says when the current tab has no matches', () => {
      const utils = render(<MediaVideosScreen mediaType="tv" />);
      search(utils, 'making');

      expect(utils.getByText('No matches in Trailers')).toBeTruthy();
      fireEvent.press(utils.getByTestId('media-videos-tab-Behind the Scenes'));
      expect(utils.getByTestId('media-video-bts1')).toBeTruthy();
    });

    it('brings everything back when the search is closed', () => {
      const utils = render(<MediaVideosScreen mediaType="tv" />);
      search(utils, 'making');

      fireEvent.press(utils.getByTestId('videos-search-close'));

      expect(utils.getByText('Trailers (2)')).toBeTruthy();
      expect(utils.getByTestId('media-video-trailer1')).toBeTruthy();
    });
  });

  it('says so when there are no videos', () => {
    mockUseQuery.mockReturnValue(loaded([]));
    const { getByText } = render(<MediaVideosScreen mediaType="movie" />);
    expect(getByText('No videos yet')).toBeTruthy();
  });

  it('shows an error with retry when loading fails', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch: jest.fn(),
    });
    const { getByText } = render(<MediaVideosScreen mediaType="movie" />);
    expect(getByText("Couldn't load the videos")).toBeTruthy();
  });
});
