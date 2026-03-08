import { MultiSelectActionBar } from '@/src/components/library/MultiSelectActionBar';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

describe('MultiSelectActionBar', () => {
  it('renders top row buttons and remove button below', () => {
    const onAddToList = jest.fn();
    const onCancel = jest.fn();
    const onRemoveItems = jest.fn();

    const { getByTestId, getByText } = render(
      <MultiSelectActionBar
        selectedCount={3}
        bulkPrimaryLabel="Copy to lists"
        onAddToList={onAddToList}
        onCancel={onCancel}
        onRemoveItems={onRemoveItems}
      />
    );

    expect(getByTestId('multi-select-top-row')).toBeTruthy();
    expect(getByTestId('multi-select-cancel-button')).toBeTruthy();
    expect(getByTestId('multi-select-primary-button')).toBeTruthy();
    expect(getByTestId('multi-select-remove-button')).toBeTruthy();
    expect(getByText('Copy to lists')).toBeTruthy();
    expect(getByText('Remove items')).toBeTruthy();
  });

  it('fires cancel, primary, and remove handlers', () => {
    const onAddToList = jest.fn();
    const onCancel = jest.fn();
    const onRemoveItems = jest.fn();

    const { getByTestId } = render(
      <MultiSelectActionBar
        selectedCount={2}
        bulkPrimaryLabel="Move to lists"
        onAddToList={onAddToList}
        onCancel={onCancel}
        onRemoveItems={onRemoveItems}
      />
    );

    fireEvent.press(getByTestId('multi-select-cancel-button'));
    fireEvent.press(getByTestId('multi-select-primary-button'));
    fireEvent.press(getByTestId('multi-select-remove-button'));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAddToList).toHaveBeenCalledTimes(1);
    expect(onRemoveItems).toHaveBeenCalledTimes(1);
  });

  it('renders only cancel and remove when the primary action is omitted', () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <MultiSelectActionBar selectedCount={2} onCancel={jest.fn()} onRemoveItems={jest.fn()} />
    );

    expect(getByTestId('multi-select-top-row')).toBeTruthy();
    expect(getByTestId('multi-select-cancel-button')).toBeTruthy();
    expect(getByTestId('multi-select-remove-button')).toBeTruthy();
    expect(queryByTestId('multi-select-primary-button')).toBeNull();
    expect(getByText('Remove items')).toBeTruthy();
  });

  it('uses a custom remove label when provided', () => {
    const { getByText } = render(
      <MultiSelectActionBar
        selectedCount={1}
        onCancel={jest.fn()}
        onRemoveItems={jest.fn()}
        removeLabel="Remove ratings"
      />
    );

    expect(getByText('Remove ratings')).toBeTruthy();
  });

  it('reports rendered height when layout changes', () => {
    const onHeightChange = jest.fn();

    const { getByTestId } = render(
      <MultiSelectActionBar
        selectedCount={1}
        bulkPrimaryLabel="Move to lists"
        onAddToList={jest.fn()}
        onCancel={jest.fn()}
        onRemoveItems={jest.fn()}
        onHeightChange={onHeightChange}
      />
    );

    fireEvent(getByTestId('multi-select-action-bar'), 'layout', {
      nativeEvent: {
        layout: {
          x: 0,
          y: 0,
          width: 360,
          height: 212,
        },
      },
    });

    expect(onHeightChange).toHaveBeenCalledWith(212);
  });
});
