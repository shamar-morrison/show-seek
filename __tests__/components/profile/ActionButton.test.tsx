import { ActionButton } from '@/src/components/profile/ActionButton';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Text, View } from 'react-native';

// Mock lucide-react-native
jest.mock('lucide-react-native', () => ({
  Star: ({ color, size, testID }: { color: string; size: number; testID?: string }) => {
    const { View } = require('react-native');
    return <View testID={testID || 'star-icon'} accessibilityLabel={`star-${color}`} />;
  },
}));

// Mock PremiumBadge
jest.mock('@/src/components/ui/PremiumBadge', () => ({
  PremiumBadge: () => {
    const { Text } = require('react-native');
    return <Text testID="premium-badge">Premium</Text>;
  },
}));

describe('ActionButton', () => {
  const mockOnPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with label', () => {
    const { getByText } = render(<ActionButton label="Test Action" onPress={mockOnPress} />);
    expect(getByText('Test Action')).toBeTruthy();
  });

  it('should call onPress when pressed', () => {
    const { getByTestId } = render(<ActionButton label="Test Action" onPress={mockOnPress} />);
    fireEvent.press(getByTestId('action-button-test-action'));
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('should render with icon', () => {
    const { Star } = require('lucide-react-native');
    const { getByTestId } = render(
      <ActionButton icon={Star} label="Rate App" onPress={mockOnPress} />
    );
    expect(getByTestId('star-icon')).toBeTruthy();
  });

  it('should render with custom icon', () => {
    const CustomIcon = () => <View testID="custom-icon" />;
    const { getByTestId } = render(
      <ActionButton customIcon={<CustomIcon />} label="Custom" onPress={mockOnPress} />
    );
    expect(getByTestId('custom-icon')).toBeTruthy();
  });

  it('should show ActivityIndicator when loading', () => {
    const { queryByTestId, getByTestId } = render(
      <ActionButton label="Loading Action" onPress={mockOnPress} loading={true} />
    );
    // Spinner should be visible when loading
    expect(getByTestId('action-button-spinner')).toBeTruthy();
    // Icon should not be visible when loading
    expect(queryByTestId('star-icon')).toBeNull();
  });

  it('should be disabled when loading', () => {
    const { getByTestId } = render(
      <ActionButton label="Loading Action" onPress={mockOnPress} loading={true} />
    );
    // When loading, the button should be disabled
    fireEvent.press(getByTestId('action-button-loading-action'));
    expect(mockOnPress).not.toHaveBeenCalled();
  });

  it('should render with badge', () => {
    const Badge = () => <Text testID="custom-badge">Connected</Text>;
    const { getByTestId } = render(
      <ActionButton label="With Badge" onPress={mockOnPress} badge={<Badge />} />
    );
    expect(getByTestId('custom-badge')).toBeTruthy();
  });

  describe('premium feature gating', () => {
    it('should show premium badge when isPremiumFeature=true and isPremium=false', () => {
      const { getByTestId } = render(
        <ActionButton
          label="Premium Feature"
          onPress={mockOnPress}
          isPremiumFeature={true}
          isPremium={false}
        />
      );
      expect(getByTestId('premium-badge')).toBeTruthy();
    });

    it('should not show premium badge when isPremium=true', () => {
      const { queryByTestId } = render(
        <ActionButton
          label="Premium Feature"
          onPress={mockOnPress}
          isPremiumFeature={true}
          isPremium={true}
        />
      );
      expect(queryByTestId('premium-badge')).toBeNull();
    });

    it('should still be pressable when locked (to navigate to premium)', () => {
      const { getByTestId } = render(
        <ActionButton
          label="Premium Feature"
          onPress={mockOnPress}
          isPremiumFeature={true}
          isPremium={false}
        />
      );
      fireEvent.press(getByTestId('action-button-premium-feature'));
      expect(mockOnPress).toHaveBeenCalled();
    });
  });

  describe('danger variant', () => {
    it('should render with danger styling', () => {
      const { getByText } = render(
        <ActionButton label="Delete" onPress={mockOnPress} variant="danger" />
      );
      expect(getByText('Delete')).toBeTruthy();
    });
  });
});
