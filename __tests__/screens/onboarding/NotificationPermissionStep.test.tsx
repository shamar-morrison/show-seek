import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockRequestPermission = jest.fn();

jest.mock('@/src/hooks/useNotificationPermissions', () => ({
  useNotificationPermissions: () => ({
    requestPermission: mockRequestPermission,
  }),
}));

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    default: {
      View: ({ children, ...props }: any) => React.createElement(View, props, children),
    },
    FadeInDown: {
      duration: () => ({ delay: () => ({}) }),
    },
  };
});

import NotificationPermissionStep from '@/src/screens/onboarding/NotificationPermissionStep';

describe('NotificationPermissionStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title, subtitle, and enable button', () => {
    const { getByText } = render(
      <NotificationPermissionStep onPermissionGranted={jest.fn()} accentColor="#E50914" />
    );

    expect(getByText('Never miss a release')).toBeTruthy();
    expect(
      getByText('Get notified when your favorite movies hit theaters and new episodes drop.')
    ).toBeTruthy();
    expect(getByText('Enable Notifications')).toBeTruthy();
  });

  it('calls requestPermission and advances via onPermissionGranted when button pressed', async () => {
    mockRequestPermission.mockResolvedValue(true);
    const onPermissionGranted = jest.fn();

    const { getByText } = render(
      <NotificationPermissionStep
        onPermissionGranted={onPermissionGranted}
        accentColor="#E50914"
      />
    );

    fireEvent.press(getByText('Enable Notifications'));

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
      expect(onPermissionGranted).toHaveBeenCalledTimes(1);
    });
  });

  it('advances via onPermissionGranted even when requestPermission throws', async () => {
    mockRequestPermission.mockRejectedValue(new Error('Permission error'));
    const onPermissionGranted = jest.fn();

    const { getByText } = render(
      <NotificationPermissionStep
        onPermissionGranted={onPermissionGranted}
        accentColor="#E50914"
      />
    );

    fireEvent.press(getByText('Enable Notifications'));

    await waitFor(() => {
      expect(mockRequestPermission).toHaveBeenCalledTimes(1);
      expect(onPermissionGranted).toHaveBeenCalledTimes(1);
    });
  });
});
