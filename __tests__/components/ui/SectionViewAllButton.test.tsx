import { SectionViewAllButton } from '@/src/components/ui/SectionViewAllButton';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#E50914' }),
}));

describe('SectionViewAllButton', () => {
  it('renders a chevron button with the accent background', () => {
    const { getByTestId } = render(<SectionViewAllButton onPress={jest.fn()} />);

    const button = getByTestId('section-view-all-button');
    expect(button).toBeTruthy();
    expect(button.props.accessibilityRole).toBe('button');
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<SectionViewAllButton onPress={onPress} />);

    fireEvent.press(getByTestId('section-view-all-button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('supports a custom testID', () => {
    const { getByTestId } = render(
      <SectionViewAllButton onPress={jest.fn()} testID="custom-view-all" />
    );

    expect(getByTestId('custom-view-all')).toBeTruthy();
  });
});
