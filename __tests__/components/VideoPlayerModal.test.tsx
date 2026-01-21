import TrailerPlayer from '@/src/components/VideoPlayerModal';
import { render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Linking } from 'react-native';

// Mock Linking
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  return {
    ...RN,
    Linking: {
      openURL: jest.fn(() => Promise.resolve()),
    },
    Alert: {
      alert: jest.fn(),
    },
  };
});

describe('TrailerPlayer (VideoPlayerModal)', () => {
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should not open URL when not visible', () => {
    render(<TrailerPlayer visible={false} onClose={mockOnClose} videoKey="abc123" />);

    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('should not open URL when videoKey is null', () => {
    render(<TrailerPlayer visible={true} onClose={mockOnClose} videoKey={null} />);

    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('should open YouTube URL when visible with valid videoKey', async () => {
    render(<TrailerPlayer visible={true} onClose={mockOnClose} videoKey="abc123" />);

    await waitFor(() => {
      expect(Linking.openURL).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc123');
    });
  });

  it('should call onClose after opening URL', async () => {
    render(<TrailerPlayer visible={true} onClose={mockOnClose} videoKey="abc123" />);

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should return null (no rendered content)', () => {
    const { toJSON } = render(
      <TrailerPlayer visible={false} onClose={mockOnClose} videoKey="abc123" />
    );

    expect(toJSON()).toBeNull();
  });
});
