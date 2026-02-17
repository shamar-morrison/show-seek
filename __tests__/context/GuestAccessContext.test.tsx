import { GuestAccessProvider, useGuestAccess } from '@/src/context/GuestAccessContext';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert, Modal, Pressable, Text } from 'react-native';

const mockSignOut = jest.fn();

const mockAuthState = {
  user: { uid: 'guest-user', isAnonymous: true },
  signOut: mockSignOut,
};

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

function GuardProbe() {
  const { requireAccount } = useGuestAccess();
  return (
    <Pressable testID="guard-probe-trigger" onPress={() => requireAccount()}>
      <Text>Trigger guard</Text>
    </Pressable>
  );
}

describe('GuestAccessContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { uid: 'guest-user', isAnonymous: true };
  });

  it('fails closed when useGuestAccess is used without provider', () => {
    const { result } = renderHook(() => useGuestAccess());

    expect(result.current.requireAccount()).toBe(false);
  });

  it('closes modal after successful primary action', async () => {
    mockSignOut.mockResolvedValue(undefined);

    const { getByTestId, getByText, UNSAFE_getByType } = render(
      <GuestAccessProvider>
        <GuardProbe />
      </GuestAccessProvider>
    );

    fireEvent.press(getByTestId('guard-probe-trigger'));

    expect(getByText('You need an account to do that. Please sign in.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByText("Ok let's go"));
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(UNSAFE_getByType(Modal).props.visible).toBe(false);
    });
  });

  it('keeps modal open and surfaces error when primary action fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockSignOut.mockRejectedValueOnce(new Error('sign out failed'));

    const { getByTestId, getByText, UNSAFE_getByType } = render(
      <GuestAccessProvider>
        <GuardProbe />
      </GuestAccessProvider>
    );

    fireEvent.press(getByTestId('guard-probe-trigger'));

    await act(async () => {
      fireEvent.press(getByText("Ok let's go"));
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    expect(alertSpy).toHaveBeenCalledWith('Error', 'Sign out failed. Please try again.');
    expect(UNSAFE_getByType(Modal).props.visible).toBe(true);
    expect(getByText('You need an account to do that. Please sign in.')).toBeTruthy();

    alertSpy.mockRestore();
  });
});
