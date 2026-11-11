import MediaPhotosScreen from '@/src/screens/MediaPhotosScreen';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

const mockUseQuery = jest.fn();
const mockBack = jest.fn();
let capturedLightboxProps: any = null;

jest.mock('@tanstack/react-query', () => ({
  useQuery: (args: any) => mockUseQuery(args),
}));

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: '550', title: 'Fight Club' }),
  useRouter: () => ({ back: mockBack }),
}));

jest.mock('@/src/components/ui/MediaImage', () => ({
  MediaImage: () => null,
}));

jest.mock('@/src/components/ImageLightbox', () => ({
  __esModule: true,
  default: (props: any) => {
    capturedLightboxProps = props;
    return null;
  },
}));

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

const posters = [{ file_path: '/p1.jpg' }, { file_path: '/p2.jpg' }, { file_path: '/p3.jpg' }];
const backdrops = [{ file_path: '/b1.jpg' }, { file_path: '/b2.jpg' }];

describe('MediaPhotosScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedLightboxProps = null;
    mockUseQuery.mockReturnValue({
      data: { posters, backdrops },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
  });

  it('loads the images with the same query as the detail page', () => {
    render(<MediaPhotosScreen mediaType="tv" />);
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['tv', 550, 'images'], enabled: true })
    );
  });

  it('shows the title and both tabs with their counts, posters first', () => {
    const { getByText, getByTestId, queryByTestId } = render(
      <MediaPhotosScreen mediaType="movie" />
    );

    expect(getByText('Fight Club')).toBeTruthy();
    expect(getByText('Posters (3)')).toBeTruthy();
    expect(getByText('Backdrops (2)')).toBeTruthy();
    expect(getByTestId('media-photo-2')).toBeTruthy();
    expect(queryByTestId('media-photo-3')).toBeNull();
  });

  it('switches to backdrops', () => {
    const { getByTestId, queryByTestId } = render(<MediaPhotosScreen mediaType="movie" />);

    fireEvent.press(getByTestId('media-photos-tab-backdrops'));

    expect(getByTestId('media-photo-1')).toBeTruthy();
    expect(queryByTestId('media-photo-2')).toBeNull();
    expect(getByTestId('media-photos-tab-backdrops').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it("opens the tapped photo in the viewer with the tab's photos", () => {
    const { getByTestId } = render(<MediaPhotosScreen mediaType="movie" />);
    expect(capturedLightboxProps.visible).toBe(false);

    fireEvent.press(getByTestId('media-photos-tab-backdrops'));
    fireEvent.press(getByTestId('media-photo-1'));

    expect(capturedLightboxProps.visible).toBe(true);
    expect(capturedLightboxProps.initialIndex).toBe(1);
    expect(capturedLightboxProps.images).toEqual([
      expect.stringContaining('/b1.jpg'),
      expect.stringContaining('/b2.jpg'),
    ]);
    expect(capturedLightboxProps.downloadImages[1]).toContain('/original/b2.jpg');

    capturedLightboxProps.onClose();
  });

  it('says so when a tab has no photos', () => {
    mockUseQuery.mockReturnValue({
      data: { posters: [], backdrops },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    const { getByText } = render(<MediaPhotosScreen mediaType="movie" />);

    expect(getByText('No posters yet')).toBeTruthy();
  });

  it('offers a retry when the photos fail to load', () => {
    const refetch = jest.fn();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    });
    const { getByText } = render(<MediaPhotosScreen mediaType="movie" />);

    expect(getByText("Couldn't load the photos")).toBeTruthy();
  });
});
