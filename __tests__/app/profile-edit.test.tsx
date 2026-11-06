import EditProfileScreen from '@/app/(tabs)/profile/edit-profile';
import { updateUserProfile } from '@/src/services/ProfileService';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { Alert } from 'react-native';

const mockBack = jest.fn();
const mockRefreshProfile = jest.fn();
const mockAuth = {
  user: null as unknown,
  isGuest: false,
  refreshProfile: mockRefreshProfile,
};

jest.mock('@hugeicons/react-native', () => ({ HugeiconsIcon: () => null }));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text testID="redirect">{href}</Text>;
  },
}));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/src/context/auth', () => ({ useAuth: () => mockAuth }));
jest.mock('@/src/services/ProfileService', () => ({
  DISPLAY_NAME_MAX_LENGTH: 50,
  updateUserProfile: jest.fn(() => Promise.resolve()),
}));

const isDisabled = (utils: ReturnType<typeof render>, testID: string) =>
  utils.getByTestId(testID).props.accessibilityState?.disabled === true;

const pickPhoto = (uri: string) =>
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri }],
  });

describe('EditProfileScreen', () => {
  beforeEach(() => {
    mockAuth.isGuest = false;
    mockAuth.user = {
      uid: 'user-1',
      displayName: 'Sam Rivera',
      email: 'sam@example.com',
      photoURL: 'https://example.com/me.jpg',
    };
  });

  it.each([
    ['guests', () => (mockAuth.isGuest = true)],
    ['signed-out users', () => (mockAuth.user = null)],
  ])('sends %s back to the account screen', (_label, arrange) => {
    arrange();
    const utils = render(<EditProfileScreen />);

    expect(utils.getByTestId('redirect')).toHaveTextContent('/(tabs)/profile/account');
    expect(utils.queryByTestId('edit-profile-save')).toBeNull();
  });

  it('starts with the current name and nothing to save', () => {
    const utils = render(<EditProfileScreen />);

    expect(utils.getByTestId('edit-profile-name').props.value).toBe('Sam Rivera');
    expect(isDisabled(utils, 'edit-profile-save')).toBe(true);
  });

  it('limits the name to 50 characters', () => {
    const utils = render(<EditProfileScreen />);

    expect(utils.getByTestId('edit-profile-name').props.maxLength).toBe(50);
  });

  it('does not allow a blank name', () => {
    const utils = render(<EditProfileScreen />);
    fireEvent.changeText(utils.getByTestId('edit-profile-name'), '   ');

    expect(isDisabled(utils, 'edit-profile-save')).toBe(true);
  });

  it('does not treat surrounding spaces as a change', () => {
    const utils = render(<EditProfileScreen />);
    fireEvent.changeText(utils.getByTestId('edit-profile-name'), '  Sam Rivera ');

    expect(isDisabled(utils, 'edit-profile-save')).toBe(true);
  });

  it('saves a trimmed name, refreshes the app and goes back', async () => {
    const utils = render(<EditProfileScreen />);
    fireEvent.changeText(utils.getByTestId('edit-profile-name'), '  Sam R ');

    await act(async () => {
      fireEvent.press(utils.getByTestId('edit-profile-save'));
    });

    expect(updateUserProfile).toHaveBeenCalledWith(mockAuth.user, {
      displayName: 'Sam R',
      photo: { type: 'keep' },
    });
    expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('opens a circle-cropping image picker and saves the chosen photo', async () => {
    pickPhoto('file:///picked.jpg');
    const utils = render(<EditProfileScreen />);

    await act(async () => {
      fireEvent.press(utils.getByTestId('edit-profile-change-photo'));
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        shape: 'oval',
      })
    );
    expect(updateUserProfile).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(utils.getByTestId('edit-profile-save'));
    });

    expect(updateUserProfile).toHaveBeenCalledWith(mockAuth.user, {
      displayName: 'Sam Rivera',
      photo: { type: 'replace', uri: 'file:///picked.jpg' },
    });
  });

  it('also opens the picker from the avatar', async () => {
    pickPhoto('file:///picked.jpg');
    const utils = render(<EditProfileScreen />);

    await act(async () => {
      fireEvent.press(utils.getByTestId('edit-profile-avatar'));
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
  });

  it('changes nothing when the picker is cancelled', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValueOnce({
      canceled: true,
      assets: null,
    });
    const utils = render(<EditProfileScreen />);

    await act(async () => {
      fireEvent.press(utils.getByTestId('edit-profile-change-photo'));
    });

    expect(isDisabled(utils, 'edit-profile-save')).toBe(true);
  });

  it('can remove the photo, which then offers adding one instead', async () => {
    const utils = render(<EditProfileScreen />);

    fireEvent.press(utils.getByTestId('edit-profile-remove-photo'));

    expect(utils.queryByTestId('edit-profile-remove-photo')).toBeNull();
    expect(utils.getByText('Add photo')).toBeTruthy();

    await act(async () => {
      fireEvent.press(utils.getByTestId('edit-profile-save'));
    });

    expect(updateUserProfile).toHaveBeenCalledWith(mockAuth.user, {
      displayName: 'Sam Rivera',
      photo: { type: 'remove' },
    });
  });

  it('does not offer removal when there is no photo', () => {
    mockAuth.user = { uid: 'user-1', displayName: 'Sam', email: '', photoURL: null };
    const utils = render(<EditProfileScreen />);

    expect(utils.queryByTestId('edit-profile-remove-photo')).toBeNull();
  });

  it('stays on the screen with the edits and warns when saving fails', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    jest.spyOn(console, 'error').mockImplementation(() => {});
    (updateUserProfile as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    const utils = render(<EditProfileScreen />);
    fireEvent.changeText(utils.getByTestId('edit-profile-name'), 'Sam R');

    await act(async () => {
      fireEvent.press(utils.getByTestId('edit-profile-save'));
    });

    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockRefreshProfile).not.toHaveBeenCalled();
    expect(utils.getByTestId('edit-profile-name').props.value).toBe('Sam R');
    expect(isDisabled(utils, 'edit-profile-save')).toBe(false);
  });
});
