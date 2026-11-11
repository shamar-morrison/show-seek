import { MediaActionButtons } from '@/src/components/detail/MediaActionButtons';
import { render } from '@testing-library/react-native';
import React from 'react';

let mockOrder = ['list', 'rating', 'reminder', 'note', 'shareCard'];

jest.mock('@/src/hooks/useDetailActionOrder', () => ({
  useDetailActionOrder: () => mockOrder,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff5500' }),
}));

jest.mock('@/src/components/RatingButton', () => () => null);
jest.mock('@/src/components/ReminderButton', () => () => null);

const baseProps = {
  onAddToList: jest.fn(),
  onRate: jest.fn(),
  onNote: jest.fn(),
  onTrailer: jest.fn(),
  isInAnyList: false,
  isLoadingLists: false,
  userRating: 0,
  isLoadingRating: false,
  hasNote: false,
  isLoadingNote: false,
  hasTrailer: true,
};

const renderedOrder = (getAllByTestId: (id: RegExp) => { props: { testID: string } }[]) =>
  getAllByTestId(/^detail-action-/).map((node) => node.props.testID.replace('detail-action-', ''));

describe('MediaActionButtons', () => {
  it('shows the buttons in the order chosen in Settings', () => {
    mockOrder = ['note', 'shareCard', 'rating', 'reminder', 'list'];
    const { getAllByTestId } = render(
      <MediaActionButtons {...baseProps} onReminder={jest.fn()} onShareCard={jest.fn()} />
    );
    expect(renderedOrder(getAllByTestId)).toEqual(mockOrder);
  });

  it('skips buttons that do not apply, keeping the rest in order', () => {
    mockOrder = ['note', 'reminder', 'rating', 'shareCard', 'list'];
    const { getAllByTestId } = render(<MediaActionButtons {...baseProps} />);
    expect(renderedOrder(getAllByTestId)).toEqual(['note', 'rating', 'list']);
  });
});
