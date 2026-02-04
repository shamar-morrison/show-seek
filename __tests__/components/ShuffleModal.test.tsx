import { ListMediaItem } from '@/src/services/ListService';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

// Mock react-native-svg before other modules that depend on it
jest.mock('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  G: 'G',
  Line: 'Line',
  Polyline: 'Polyline',
  Polygon: 'Polygon',
}));

// Mock lucide-react-native icons
jest.mock('lucide-react-native', () => ({
  Shuffle: () => 'Shuffle',
  Star: () => 'Star',
  X: () => 'X',
}));

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: {
    Success: 'success',
  },
}));

// Mock expo-image
jest.mock('expo-image', () => ({
  Image: 'Image',
}));

// Mock ModalBackground to avoid expo-blur import
jest.mock('@/src/components/ui/ModalBackground', () => ({
  ModalBackground: () => null,
}));

// Mock Reanimated for testing (v4 compatible)
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    default: {
      View: View,
      createAnimatedComponent: (component: any) => component,
    },
    useSharedValue: (initial: any) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    withTiming: (value: any) => value,
    withSequence: (...args: any[]) => args[args.length - 1],
    Easing: {
      out: (fn: any) => fn,
      exp: (t: number) => t,
    },
  };
});

// Import after mocks are set up
import ShuffleModal from '@/src/components/ShuffleModal';

const createMockItem = (id: number, title: string): ListMediaItem => ({
  id,
  title,
  poster_path: `/poster${id}.jpg`,
  media_type: 'movie',
  vote_average: 7.5,
  release_date: '2024-01-01',
  addedAt: Date.now(),
});

const mockItems: ListMediaItem[] = [
  createMockItem(1, 'Movie One'),
  createMockItem(2, 'Movie Two'),
  createMockItem(3, 'Movie Three'),
];

describe('ShuffleModal', () => {
  const mockOnClose = jest.fn();
  const mockOnViewDetails = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders modal with visible false (modal closed state)', () => {
    // Note: In React Native testing, Modal with visible=false still renders
    // but the modal content is hidden. We verify the component doesn't crash.
    const { getByTestId } = render(
      <ShuffleModal
        visible={false}
        items={mockItems}
        onClose={mockOnClose}
        onViewDetails={mockOnViewDetails}
      />
    );

    // Modal is rendered but hidden - component should still be stable
    expect(getByTestId('shuffle-close-button')).toBeTruthy();
  });

  it('renders modal content when visible is true', () => {
    const { getByTestId, getByText } = render(
      <ShuffleModal
        visible={true}
        items={mockItems}
        onClose={mockOnClose}
        onViewDetails={mockOnViewDetails}
      />
    );

    expect(getByText('Shuffle')).toBeTruthy();
    expect(getByTestId('shuffle-close-button')).toBeTruthy();
  });

  it('calls onClose when close button is pressed', () => {
    const { getByTestId } = render(
      <ShuffleModal
        visible={true}
        items={mockItems}
        onClose={mockOnClose}
        onViewDetails={mockOnViewDetails}
      />
    );

    fireEvent.press(getByTestId('shuffle-close-button'));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('has a spin again button', () => {
    const { getByTestId } = render(
      <ShuffleModal
        visible={true}
        items={mockItems}
        onClose={mockOnClose}
        onViewDetails={mockOnViewDetails}
      />
    );

    expect(getByTestId('shuffle-spin-again-button')).toBeTruthy();
  });

  it('renders with empty items array', () => {
    const { getByText } = render(
      <ShuffleModal
        visible={true}
        items={[]}
        onClose={mockOnClose}
        onViewDetails={mockOnViewDetails}
      />
    );

    expect(getByText('Shuffle')).toBeTruthy();
  });
});
