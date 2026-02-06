import ImageLightbox from '@/src/components/ImageLightbox';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

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
    (FileSystem.downloadAsync as jest.Mock).mockResolvedValue({
      uri: 'file:///cache/lightbox-image-0.jpg',
    });
    (MediaLibrary.saveToLibraryAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('renders download button when visible with images', () => {
    const { getByTestId } = render(
      <ImageLightbox visible onClose={mockOnClose} images={['https://example.com/image-1.jpg']} />
    );

    expect(getByTestId('image-lightbox-download-button')).toBeTruthy();
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
      expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalled();
      expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
        'https://example.com/image-1.jpg',
        'file:///cache/lightbox-image-0.jpg'
      );
      expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith('file:///cache/lightbox-image-0.jpg');
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
    const downloadImages = ['https://example.com/original-1.jpg', 'https://example.com/original-2.jpg'];

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
