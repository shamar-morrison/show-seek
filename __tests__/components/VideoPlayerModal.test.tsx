import TrailerPlayer from '@/src/components/VideoPlayerModal';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { useYouTubePlayer } from 'react-native-youtube-bridge';

describe('TrailerPlayer (VideoPlayerModal)', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly when visible with a valid videoKey', () => {
    const { getByTestId, getByText } = render(
      <TrailerPlayer
        visible={true}
        onClose={mockOnClose}
        videoKey="dQw4w9WgXcQ"
        title="Official Trailer"
      />
    );

    expect(getByText('Official Trailer')).toBeTruthy();
    expect(getByTestId('youtube-view')).toBeTruthy();
    expect(useYouTubePlayer).toHaveBeenCalledWith('dQw4w9WgXcQ', expect.objectContaining({
      autoplay: true,
      controls: true,
    }));
  });

  it('extracts video ID from a full YouTube URL', () => {
    const { getByTestId } = render(
      <TrailerPlayer
        visible={true}
        onClose={mockOnClose}
        videoKey="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
      />
    );

    expect(getByTestId('youtube-view')).toBeTruthy();
    expect(useYouTubePlayer).toHaveBeenCalledWith('dQw4w9WgXcQ', expect.any(Object));
  });

  it('displays unavailable message when videoKey is null', () => {
    const { queryByTestId, getByText } = render(
      <TrailerPlayer visible={true} onClose={mockOnClose} videoKey={null} />
    );

    expect(queryByTestId('youtube-view')).toBeNull();
    expect(getByText('No trailer available')).toBeTruthy();
  });

  it('calls onClose when close button is pressed', () => {
    const { getByTestId } = render(
      <TrailerPlayer visible={true} onClose={mockOnClose} videoKey="dQw4w9WgXcQ" />
    );

    fireEvent.press(getByTestId('trailer-player-close-button'));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is pressed', () => {
    const { getByTestId } = render(
      <TrailerPlayer visible={true} onClose={mockOnClose} videoKey="dQw4w9WgXcQ" />
    );

    fireEvent.press(getByTestId('trailer-player-backdrop'));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('does not render YouTube player when visible is false', () => {
    const { queryByTestId } = render(
      <TrailerPlayer visible={false} onClose={mockOnClose} videoKey="dQw4w9WgXcQ" />
    );

    expect(queryByTestId('youtube-view')).toBeNull();
  });
});
