import { ExitIntentModal } from '@/src/components/ExitIntentModal';
import { fireEvent, render } from '@testing-library/react-native';
import React from 'react';

jest.mock('@/src/components/ui/ModalBackground', () => ({
  ModalBackground: () => null,
}));

describe('ExitIntentModal', () => {
  it('renders correctly when visible', () => {
    const { getByText } = render(
      <ExitIntentModal
        visible={true}
        variant="a"
        onContinue={jest.fn()}
        onExit={jest.fn()}
      />
    );

    expect(getByText("You're almost there!")).toBeTruthy();
    expect(
      getByText('Just a few more steps and your personalized movie & TV experience will be ready.')
    ).toBeTruthy();
    expect(getByText('Continue Setup')).toBeTruthy();
    expect(getByText('Exit Anyway')).toBeTruthy();
  });

  it('calls onContinue when the Continue button is pressed', () => {
    const onContinue = jest.fn();
    const onExit = jest.fn();

    const { getByText } = render(
      <ExitIntentModal
        visible={true}
        variant="a"
        onContinue={onContinue}
        onExit={onExit}
      />
    );

    fireEvent.press(getByText('Continue Setup'));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
  });

  it('calls onExit when the Exit button is pressed', () => {
    const onContinue = jest.fn();
    const onExit = jest.fn();

    const { getByText } = render(
      <ExitIntentModal
        visible={true}
        variant="a"
        onContinue={onContinue}
        onExit={onExit}
      />
    );

    fireEvent.press(getByText('Exit Anyway'));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('invokes onExit on Modal onRequestClose (hardware back press while modal is open)', () => {
    const onContinue = jest.fn();
    const onExit = jest.fn();

    const { UNSAFE_getByType } = render(
      <ExitIntentModal
        visible={true}
        variant="a"
        onContinue={onContinue}
        onExit={onExit}
      />
    );

    const { Modal } = require('react-native');
    const modal = UNSAFE_getByType(Modal);
    modal.props.onRequestClose();

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });
});
