import { BulkRemoveProgressModal } from '@/src/components/library/BulkRemoveProgressModal';
import { render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/src/components/ui/ModalBackground', () => ({
  ModalBackground: () => null,
}));

describe('BulkRemoveProgressModal', () => {
  it('renders title and progress text', () => {
    const { getByText } = render(<BulkRemoveProgressModal visible={true} current={2} total={6} />);

    expect(getByText('Removing items')).toBeTruthy();
    expect(getByText('Removing items 2 of 6.')).toBeTruthy();
  });

  it('renders caller-provided title and progress text overrides', () => {
    const { getByText } = render(
      <BulkRemoveProgressModal
        visible={true}
        current={1}
        total={3}
        title="Removing ratings"
        progressText="Removing ratings 1 of 3."
      />
    );

    expect(getByText('Removing ratings')).toBeTruthy();
    expect(getByText('Removing ratings 1 of 3.')).toBeTruthy();
  });
});
