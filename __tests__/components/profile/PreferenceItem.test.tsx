import { PreferenceItem } from '@/src/components/profile/PreferenceItem';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

// Mock PremiumBadge
jest.mock('@/src/components/ui/PremiumBadge', () => ({
  PremiumBadge: () => {
    const { Text } = require('react-native');
    return <Text testID="premium-badge">Premium</Text>;
  },
}));

describe('PreferenceItem', () => {
  const mockOnValueChange = jest.fn();
  const mockOnLockPress = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render label and subtitle', () => {
    const { getByText } = render(
      <PreferenceItem
        label="Auto Add to Watching"
        subtitle="Automatically add shows to your watching list"
        value={false}
        onValueChange={mockOnValueChange}
      />
    );
    expect(getByText('Auto Add to Watching')).toBeTruthy();
    expect(getByText('Automatically add shows to your watching list')).toBeTruthy();
  });

  it('should render switch with correct value', () => {
    const { getByTestId } = render(
      <PreferenceItem
        label="Test Preference"
        subtitle="Test description"
        value={true}
        onValueChange={mockOnValueChange}
      />
    );
    const switchComponent = getByTestId('preference-switch');
    expect(switchComponent.props.value).toBe(true);
  });

  it('should call onValueChange when switch is toggled', () => {
    const { getByTestId } = render(
      <PreferenceItem
        label="Test Preference"
        subtitle="Test description"
        value={false}
        onValueChange={mockOnValueChange}
      />
    );
    const switchComponent = getByTestId('preference-switch');
    fireEvent(switchComponent, 'onValueChange', true);
    expect(mockOnValueChange).toHaveBeenCalledWith(true);
  });

  it('should call onValueChange when item is pressed', () => {
    const { getByTestId } = render(
      <PreferenceItem
        label="Test Preference"
        subtitle="Test description"
        value={false}
        onValueChange={mockOnValueChange}
      />
    );
    fireEvent.press(getByTestId('preference-item'));
    expect(mockOnValueChange).toHaveBeenCalledWith(true);
  });

  it('should trigger haptic feedback on press', () => {
    const Haptics = require('expo-haptics');
    const { getByTestId } = render(
      <PreferenceItem
        label="Test Preference"
        subtitle="Test description"
        value={false}
        onValueChange={mockOnValueChange}
      />
    );
    fireEvent.press(getByTestId('preference-item'));
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  describe('loading state', () => {
    it('should show ActivityIndicator when loading', () => {
      const { queryByTestId } = render(
        <PreferenceItem
          label="Loading Preference"
          subtitle="Loading..."
          value={false}
          onValueChange={mockOnValueChange}
          loading={true}
        />
      );
      // Switch should not be visible when loading
      expect(queryByTestId('preference-switch')).toBeNull();
    });
  });

  describe('disabled state', () => {
    it('should still render switch when disabled', () => {
      const { getByTestId } = render(
        <PreferenceItem
          label="Disabled Preference"
          subtitle="Cannot change"
          value={false}
          onValueChange={mockOnValueChange}
          disabled={true}
        />
      );
      // Switch should still be present even when disabled
      expect(getByTestId('preference-switch')).toBeTruthy();
    });
  });

  describe('locked (premium) state', () => {
    it('should show premium badge when locked', () => {
      const { getByTestId } = render(
        <PreferenceItem
          label="Premium Feature"
          subtitle="Requires premium"
          value={false}
          onValueChange={mockOnValueChange}
          isLocked={true}
          onLockPress={mockOnLockPress}
        />
      );
      expect(getByTestId('premium-badge')).toBeTruthy();
    });

    it('should not show switch when locked', () => {
      const { queryByTestId } = render(
        <PreferenceItem
          label="Premium Feature"
          subtitle="Requires premium"
          value={false}
          onValueChange={mockOnValueChange}
          isLocked={true}
          onLockPress={mockOnLockPress}
        />
      );
      expect(queryByTestId('preference-switch')).toBeNull();
    });

    it('should call onLockPress when locked item is pressed', () => {
      const { getByTestId } = render(
        <PreferenceItem
          label="Premium Feature"
          subtitle="Requires premium"
          value={false}
          onValueChange={mockOnValueChange}
          isLocked={true}
          onLockPress={mockOnLockPress}
        />
      );
      fireEvent.press(getByTestId('preference-item'));
      expect(mockOnLockPress).toHaveBeenCalled();
      expect(mockOnValueChange).not.toHaveBeenCalled();
    });
  });
});
