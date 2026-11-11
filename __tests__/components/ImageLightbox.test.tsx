import ImageLightbox from '@/src/components/ImageLightbox';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

const mockToastShow = jest.fn();
let mockAttachToastRef = true;

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

jest.mock('@/src/components/profile/ProfileBackgroundButton', () => ({
  ProfileBackgroundButton: ({ image, onChoose }: any) => {
    const { Pressable } = require('react-native');
    return (
      <Pressable testID="profile-background-button" image={image} onPress={() => onChoose(image)} />
    );
  },
}));

let capturedSetBackdrop: any = null;
jest.mock('@/src/components/profile/SetProfileBackdrop', () => ({
  SetProfileBackdrop: (props: any) => {
    const { View } = require('react-native');
    capturedSetBackdrop = props;
    return <View testID="set-profile-backdrop" />;
  },
}));

jest.mock('@/src/components/ui/Toast', () => {
  const React = require('react');
  const MockToast = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () =>
      mockAttachToastRef
        ? {
            show: mockToastShow,
          }
        : null
    );
    return React.createElement('MockToast', props);
  });
  MockToast.displayName = 'MockToast';

  return {
    __esModule: true,
    default: MockToast,
  };
});

describe('ImageLightbox', () => {
  const mockOnClose = jest.fn();
  const mockOnShowToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockToastShow.mockClear();
    mockAttachToastRef = true;
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (MediaLibrary.saveToLibraryAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
      uri: 'file:///cache/lightbox-image-0.jpg',
    });
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('renders download button when visible with images', () => {
    const { getByTestId } = render(
      <ImageLightbox visible onClose={mockOnClose} images={['https://example.com/image-1.jpg']} />
    );

    expect(getByTestId('image-lightbox-download-button')).toBeTruthy();
  });

  it('renders close button in the header outside the photo area', () => {
    const { getByTestId } = render(
      <ImageLightbox visible onClose={mockOnClose} images={['https://example.com/image-1.jpg']} />
    );

    const closeButton = getByTestId('image-lightbox-close-button');
    expect(closeButton).toBeTruthy();
    fireEvent.press(closeButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('shows a position counter when there are multiple images', () => {
    const { getByTestId } = render(
      <ImageLightbox
        visible
        onClose={mockOnClose}
        images={['https://example.com/image-1.jpg', 'https://example.com/image-2.jpg']}
      />
    );

    expect(getByTestId('image-lightbox-counter').props.children.join('')).toBe('1 / 2');
  });

  it('only loads images next to the current one', () => {
    const images = Array.from({ length: 30 }, (_, index) => `https://example.com/${index}.jpg`);
    const { UNSAFE_getAllByType } = render(
      <ImageLightbox visible onClose={mockOnClose} images={images} initialIndex={10} />
    );

    const loaded = UNSAFE_getAllByType('Image' as any).map((node: any) => node.props.source.uri);
    expect(loaded).toEqual([8, 9, 10, 11, 12].map((index) => `https://example.com/${index}.jpg`));
  });

  it('shows the counter at the top and the actions in a labelled bar at the bottom', () => {
    const images = Array.from({ length: 30 }, (_, index) => `https://example.com/${index}.jpg`);
    const { getByTestId, getByText, queryByTestId } = render(
      <ImageLightbox visible onClose={mockOnClose} images={images} />
    );

    expect(getByTestId('image-lightbox-counter').props.children.join('')).toBe('1 / 30');
    expect(queryByTestId('image-lightbox-dots')).toBeNull();
    expect(
      within(getByTestId('image-lightbox-actions')).getByTestId('image-lightbox-download-button')
    ).toBeTruthy();
    expect(getByText('Download')).toBeTruthy();
  });

  it('opens on the tapped image again after being closed and reopened', () => {
    const images = ['https://example.com/a.jpg', 'https://example.com/b.jpg'];
    const { getByTestId, rerender } = render(
      <ImageLightbox visible onClose={mockOnClose} images={images} initialIndex={1} />
    );
    fireEvent(getByTestId('image-lightbox-scrollview'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });
    expect(getByTestId('image-lightbox-counter').props.children.join('')).toBe('1 / 2');

    rerender(
      <ImageLightbox visible={false} onClose={mockOnClose} images={images} initialIndex={1} />
    );
    rerender(<ImageLightbox visible onClose={mockOnClose} images={images} initialIndex={1} />);

    expect(getByTestId('image-lightbox-counter').props.children.join('')).toBe('2 / 2');
  });

  it('puts the profile backdrop button in the bottom bar, only for images given a TMDB path', () => {
    const images = ['https://example.com/a.jpg', 'https://example.com/b.jpg'];
    const backgrounds = [{ path: '/a.jpg', kind: 'poster' as const }, null];
    const { getByTestId, queryByTestId, rerender } = render(
      <ImageLightbox
        visible
        onClose={mockOnClose}
        images={images}
        profileBackgrounds={backgrounds}
      />
    );

    expect(
      within(getByTestId('image-lightbox-actions')).getByTestId('profile-background-button').props
        .image
    ).toEqual(backgrounds[0]);

    rerender(
      <ImageLightbox
        visible
        onClose={mockOnClose}
        images={images}
        profileBackgrounds={backgrounds}
        initialIndex={1}
      />
    );
    rerender(
      <ImageLightbox
        visible={false}
        onClose={mockOnClose}
        images={images}
        profileBackgrounds={backgrounds}
        initialIndex={1}
      />
    );
    rerender(
      <ImageLightbox
        visible
        onClose={mockOnClose}
        images={images}
        profileBackgrounds={backgrounds}
        initialIndex={1}
      />
    );
    expect(queryByTestId('profile-background-button')).toBeNull();
  });

  describe('positioning the profile backdrop', () => {
    const images = ['https://example.com/a.jpg'];
    const backgrounds = [{ path: '/a.jpg', kind: 'backdrop' as const }];
    const renderViewer = () =>
      render(
        <ImageLightbox
          visible
          onClose={mockOnClose}
          images={images}
          profileBackgrounds={backgrounds}
        />
      );

    beforeEach(() => {
      capturedSetBackdrop = null;
    });

    it('opens over the viewer for the chosen image', () => {
      const utils = renderViewer();
      expect(utils.queryByTestId('set-profile-backdrop')).toBeNull();

      fireEvent.press(utils.getByTestId('profile-background-button'));

      expect(utils.getByTestId('set-profile-backdrop')).toBeTruthy();
      expect(capturedSetBackdrop.image).toEqual(backgrounds[0]);
    });

    it('closes back to the viewer, showing the saved message', () => {
      const utils = renderViewer();
      fireEvent.press(utils.getByTestId('profile-background-button'));

      act(() => capturedSetBackdrop.onClose('Set as your profile backdrop'));

      expect(utils.queryByTestId('set-profile-backdrop')).toBeNull();
      expect(mockToastShow).toHaveBeenCalledWith('Set as your profile backdrop');
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it("makes Android's back button leave positioning before the viewer", () => {
      const utils = renderViewer();
      const modal = () => utils.UNSAFE_getByType('Modal' as never);
      fireEvent.press(utils.getByTestId('profile-background-button'));

      act(() => modal().props.onRequestClose());
      expect(utils.queryByTestId('set-profile-backdrop')).toBeNull();
      expect(mockOnClose).not.toHaveBeenCalled();

      act(() => modal().props.onRequestClose());
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });
  });

  it('has no profile background button without TMDB paths', () => {
    const { queryByTestId } = render(
      <ImageLightbox visible onClose={mockOnClose} images={['https://example.com/a.jpg']} />
    );
    expect(queryByTestId('profile-background-button')).toBeNull();
  });

  it('hides the position counter for a single image', () => {
    const { queryByTestId } = render(
      <ImageLightbox visible onClose={mockOnClose} images={['https://example.com/image-1.jpg']} />
    );

    expect(queryByTestId('image-lightbox-counter')).toBeNull();
  });

  it('downloads and saves image on successful flow', async () => {
    render(
      <ImageLightbox
        visible
        onClose={mockOnClose}
        images={['https://example.com/image-1.jpg']}
        onShowToast={mockOnShowToast}
      />
    );

    fireEvent.press(screen.getByTestId('image-lightbox-download-button'));

    await waitFor(() => {
      expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true);
      expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
        'https://example.com/image-1.jpg',
        'file:///cache/lightbox-image-0.jpg'
      );
      expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith(
        'file:///cache/lightbox-image-0.jpg'
      );
      expect(mockToastShow).toHaveBeenCalledWith('Saved to gallery!');
      expect(mockOnShowToast).not.toHaveBeenCalled();
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///cache/lightbox-image-0.jpg', {
        idempotent: true,
      });
    });
  });

  it('shows permission denied toast and does not download when permission is denied', async () => {
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    render(
      <ImageLightbox
        visible
        onClose={mockOnClose}
        images={['https://example.com/image-1.jpg']}
        onShowToast={mockOnShowToast}
      />
    );

    fireEvent.press(screen.getByTestId('image-lightbox-download-button'));

    await waitFor(() => {
      expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
      expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled();
      expect(mockToastShow).toHaveBeenCalledWith('Permission to access gallery was denied');
      expect(mockOnShowToast).not.toHaveBeenCalled();
    });
  });

  it('shows failure toast when download fails', async () => {
    (FileSystem.downloadAsync as jest.Mock).mockRejectedValue(new Error('Download failed'));

    render(
      <ImageLightbox
        visible
        onClose={mockOnClose}
        images={['https://example.com/image-1.jpg']}
        onShowToast={mockOnShowToast}
      />
    );

    fireEvent.press(screen.getByTestId('image-lightbox-download-button'));

    await waitFor(() => {
      expect(mockToastShow).toHaveBeenCalledWith('Failed to save to gallery');
      expect(mockOnShowToast).not.toHaveBeenCalled();
    });
  });

  it('uses the current index image from downloadImages when provided', async () => {
    const images = ['https://example.com/large-1.jpg', 'https://example.com/large-2.jpg'];
    const downloadImages = [
      'https://example.com/original-1.jpg',
      'https://example.com/original-2.jpg',
    ];

    render(
      <ImageLightbox
        visible
        onClose={mockOnClose}
        images={images}
        downloadImages={downloadImages}
        initialIndex={0}
        onShowToast={mockOnShowToast}
      />
    );

    fireEvent(screen.getByTestId('image-lightbox-scrollview'), 'onMomentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 375 } },
    });

    fireEvent.press(screen.getByTestId('image-lightbox-download-button'));

    await waitFor(() => {
      expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
        'https://example.com/original-2.jpg',
        'file:///cache/lightbox-image-1.jpg'
      );
    });
  });

  it('falls back to display image when downloadImages entry is missing', async () => {
    const images = ['https://example.com/large-1.jpg', 'https://example.com/large-2.jpg'];
    const downloadImages = ['https://example.com/original-1.jpg', ''];

    render(
      <ImageLightbox
        visible
        onClose={mockOnClose}
        images={images}
        downloadImages={downloadImages}
        initialIndex={1}
        onShowToast={mockOnShowToast}
      />
    );

    fireEvent.press(screen.getByTestId('image-lightbox-download-button'));

    await waitFor(() => {
      expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
        'https://example.com/large-2.jpg',
        'file:///cache/lightbox-image-1.jpg'
      );
    });
  });

  it('falls back to onShowToast when internal modal toast ref is unavailable', async () => {
    mockAttachToastRef = false;
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    render(
      <ImageLightbox
        visible
        onClose={mockOnClose}
        images={['https://example.com/image-1.jpg']}
        onShowToast={mockOnShowToast}
      />
    );

    fireEvent.press(screen.getByTestId('image-lightbox-download-button'));

    await waitFor(() => {
      expect(mockToastShow).not.toHaveBeenCalled();
      expect(mockOnShowToast).toHaveBeenCalledWith('Permission to access gallery was denied');
    });
  });
});
