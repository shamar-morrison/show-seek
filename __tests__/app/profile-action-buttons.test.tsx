import { act, fireEvent, render } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';

let mockSavedOrder = ['list', 'rating', 'reminder', 'note', 'shareCard'];
const mockMutate = jest.fn();
let mockGridProps: any;

jest.mock('@/src/hooks/useDetailActionOrder', () => ({
  useDetailActionOrder: () => mockSavedOrder,
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  useUpdatePreference: () => ({ mutate: mockMutate }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff5500' }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});

// The drag library is replaced by a plain list; tests call onDragEnd as a drop would.
jest.mock('react-native-sortables', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Grid = (props: any) => {
    mockGridProps = props;
    return (
      <View testID="sortable-grid">
        {props.data.map((item: string, index: number) => (
          <React.Fragment key={props.keyExtractor(item)}>
            {props.renderItem({ item, index })}
          </React.Fragment>
        ))}
      </View>
    );
  };
  const Handle = ({ children }: any) => children;
  return { __esModule: true, default: { Grid, Handle } };
});

import ActionButtonsScreen from '@/app/(tabs)/profile/action-buttons';

const rowOrder = (getAllByTestId: (id: RegExp) => { props: { testID: string } }[]) =>
  getAllByTestId(/^action-button-row-/).map((n) =>
    n.props.testID.replace('action-button-row-', '')
  );

describe('ActionButtonsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSavedOrder = ['list', 'rating', 'reminder', 'note', 'shareCard'];
  });

  it('lists the buttons in the saved order with drag handles and positions', () => {
    mockSavedOrder = ['note', 'list', 'rating', 'reminder', 'shareCard'];
    const { getAllByTestId, getByTestId, getByText } = render(<ActionButtonsScreen />);

    expect(rowOrder(getAllByTestId)).toEqual(mockSavedOrder);
    expect(getByTestId('action-button-handle-note')).toBeTruthy();
    expect(getByText('actionButtons.reminderHint')).toBeTruthy();
    expect(mockGridProps.customHandle).toBe(true);
    expect(mockGridProps.columns).toBe(1);
    // The handle drags straight away; with the default 200ms wait a normal drag never started.
    expect(mockGridProps.dragActivationDelay).toBe(0);
    // Rows sit flush against each other.
    expect(mockGridProps.rowGap).toBe(0);
  });

  it('saves the new order when a button is dropped', () => {
    const { getAllByTestId } = render(<ActionButtonsScreen />);
    const next = ['rating', 'list', 'reminder', 'note', 'shareCard'];

    act(() => mockGridProps.onDragEnd({ data: next }));

    expect(rowOrder(getAllByTestId)).toEqual(next);
    expect(mockMutate).toHaveBeenCalledWith(
      { key: 'detailActionOrder', value: next },
      expect.any(Object)
    );
  });

  it('does not save when a button is dropped back where it was', () => {
    render(<ActionButtonsScreen />);
    act(() => mockGridProps.onDragEnd({ data: [...mockSavedOrder] }));
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('puts the order back and says so when saving fails', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockMutate.mockImplementation((_vars, { onError }) => onError(new Error('offline')));
    const { getAllByTestId } = render(<ActionButtonsScreen />);

    act(() =>
      mockGridProps.onDragEnd({ data: ['shareCard', 'list', 'rating', 'reminder', 'note'] })
    );

    expect(rowOrder(getAllByTestId)).toEqual(mockSavedOrder);
    expect(alertSpy).toHaveBeenCalledWith('common.errorTitle', 'actionButtons.saveFailed');
    mockMutate.mockReset();
  });

  it('resets to the default order, and is disabled when already default', () => {
    const { getByTestId, rerender } = render(<ActionButtonsScreen />);
    expect(getByTestId('action-buttons-reset').props.accessibilityState).toEqual({
      disabled: true,
    });

    mockSavedOrder = ['note', 'list', 'rating', 'reminder', 'shareCard'];
    rerender(<ActionButtonsScreen />);
    fireEvent.press(getByTestId('action-buttons-reset'));

    expect(mockMutate).toHaveBeenCalledWith(
      { key: 'detailActionOrder', value: ['list', 'rating', 'reminder', 'note', 'shareCard'] },
      expect.any(Object)
    );
  });
});
