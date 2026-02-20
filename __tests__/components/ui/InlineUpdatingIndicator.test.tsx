import { InlineUpdatingIndicator } from '@/src/components/ui/InlineUpdatingIndicator';
import { render } from '@testing-library/react-native';
import React from 'react';

describe('InlineUpdatingIndicator', () => {
  it('renders the provided message', () => {
    const { getByText } = render(<InlineUpdatingIndicator message="Updating watch progress..." />);

    expect(getByText('Updating watch progress...')).toBeTruthy();
  });

  it('applies testID when provided', () => {
    const { getByTestId } = render(
      <InlineUpdatingIndicator message="Updating watch progress..." testID="inline-updating-indicator" />
    );

    expect(getByTestId('inline-updating-indicator')).toBeTruthy();
  });
});
