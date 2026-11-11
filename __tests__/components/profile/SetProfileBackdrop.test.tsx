import { SetProfileBackdrop } from '@/src/components/profile/SetProfileBackdrop';
import { act, render } from '@testing-library/react-native';
import React from 'react';

const mockSetProfileBackground = jest.fn();
let capturedPositioner: any = null;

jest.mock('@/src/hooks/useProfileBackground', () => ({
  useProfileBackground: () => ({ setProfileBackground: mockSetProfileBackground }),
}));
jest.mock('@/src/components/profile/ProfileBackdropPositioner', () => ({
  ProfileBackdropPositioner: (props: any) => {
    capturedPositioner = props;
    return null;
  },
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

const poster = { path: '/poster.jpg', kind: 'poster' as const };

describe('SetProfileBackdrop', () => {
  const onClose = jest.fn();
  const onShowToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    capturedPositioner = null;
    mockSetProfileBackground.mockResolvedValue(undefined);
  });

  const renderStep = () =>
    render(<SetProfileBackdrop image={poster} onClose={onClose} onShowToast={onShowToast} />);

  it('positions the image with a Save button', () => {
    renderStep();
    expect(capturedPositioner.background).toEqual(poster);
    expect(capturedPositioner.confirmLabel).toBe('Save');
  });

  it('saves the image with the chosen part and closes with a message', async () => {
    renderStep();

    await act(async () => {
      await capturedPositioner.onConfirm({ x: 0.5, y: 0.3 });
    });

    expect(mockSetProfileBackground).toHaveBeenCalledWith({ ...poster, focus: { x: 0.5, y: 0.3 } });
    expect(onClose).toHaveBeenCalledWith('Set as your profile backdrop');
  });

  it('stays open and says so when saving fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSetProfileBackground.mockRejectedValue(new Error('offline'));
    renderStep();

    await act(async () => {
      await capturedPositioner.onConfirm({ x: 0.5, y: 0.3 });
    });

    expect(onShowToast).toHaveBeenCalledWith("Couldn't set your profile backdrop");
    expect(onClose).not.toHaveBeenCalled();
    expect(capturedPositioner.isSaving).toBe(false);
  });

  it('closes without a message on cancel', () => {
    renderStep();
    capturedPositioner.onCancel();
    expect(onClose).toHaveBeenCalledWith();
  });
});
