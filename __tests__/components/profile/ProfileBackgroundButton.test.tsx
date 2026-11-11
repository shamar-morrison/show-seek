import { ProfileBackgroundButton } from '@/src/components/profile/ProfileBackgroundButton';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockSetProfileBackground = jest.fn();
const mockIsAccountRequired = jest.fn();
let mockProfileBackground: { path: string; kind: 'backdrop' | 'poster' } | null = null;

jest.mock('@/src/hooks/useProfileBackground', () => ({
  useProfileBackground: () => ({
    profileBackground: mockProfileBackground,
    setProfileBackground: mockSetProfileBackground,
    isSaving: false,
  }),
}));
jest.mock('@/src/hooks/useAccountRequired', () => ({
  useAccountRequired: () => mockIsAccountRequired,
}));
jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#E50914' }),
}));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success' },
}));

const backdrop = { path: '/backdrop.jpg', kind: 'backdrop' as const };

describe('ProfileBackgroundButton', () => {
  const onShowToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockProfileBackground = null;
    mockIsAccountRequired.mockReturnValue(false);
    mockSetProfileBackground.mockResolvedValue(undefined);
  });

  const renderButton = () =>
    render(<ProfileBackgroundButton image={backdrop} onShowToast={onShowToast} />);

  it('sets the image as the profile background and says so', async () => {
    const { getByTestId } = renderButton();

    fireEvent.press(getByTestId('image-lightbox-profile-background-button'));

    await waitFor(() => expect(onShowToast).toHaveBeenCalledWith('Set as your profile backdrop'));
    expect(mockSetProfileBackground).toHaveBeenCalledWith(backdrop);
  });

  it('asks guests to sign in instead', () => {
    mockIsAccountRequired.mockReturnValue(true);
    const { getByTestId } = renderButton();

    fireEvent.press(getByTestId('image-lightbox-profile-background-button'));

    expect(mockSetProfileBackground).not.toHaveBeenCalled();
    expect(onShowToast).not.toHaveBeenCalled();
  });

  it('says when saving fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSetProfileBackground.mockRejectedValue(new Error('offline'));
    const { getByTestId } = renderButton();

    fireEvent.press(getByTestId('image-lightbox-profile-background-button'));

    await waitFor(() =>
      expect(onShowToast).toHaveBeenCalledWith("Couldn't set your profile backdrop")
    );
  });

  it('is labelled "Set as profile backdrop"', () => {
    const { getByText, getByTestId } = renderButton();
    expect(getByText('Set as profile backdrop')).toBeTruthy();
    expect(getByTestId('image-lightbox-profile-background-button').props.accessibilityLabel).toBe(
      'Set as profile backdrop'
    );
  });

  it('marks the image that is already the background', () => {
    expect(
      renderButton().getByTestId('image-lightbox-profile-background-button').props
        .accessibilityState
    ).toEqual(expect.objectContaining({ selected: false }));

    mockProfileBackground = backdrop;
    expect(
      renderButton().getByTestId('image-lightbox-profile-background-button').props
        .accessibilityState
    ).toEqual(expect.objectContaining({ selected: true }));
  });
});
