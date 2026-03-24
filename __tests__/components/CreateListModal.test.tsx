import CreateListModal, { CreateListModalRef } from '@/src/components/CreateListModal';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React, { createRef } from 'react';

const mockSheetPresent = jest.fn(async () => {});
const mockSheetDismiss = jest.fn(async () => {});
const mockUseLists = jest.fn();
const mockCreateListMutateAsync = jest.fn();
const mockRequireAccount = jest.fn();
const mockPush = jest.fn();

jest.mock('@lodev09/react-native-true-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');

  const TrueSheet = React.forwardRef(({ children, onDidDismiss }: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: mockSheetPresent,
      dismiss: async () => {
        await mockSheetDismiss();
        onDidDismiss?.();
      },
    }));

    return <View>{children}</View>;
  });

  return {
    TrueSheet,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View, Pressable } = require('react-native');

  return {
    GestureHandlerRootView: ({ children }: any) => <View>{children}</View>,
    Pressable,
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(),
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user-id' },
    isGuest: false,
  }),
}));

jest.mock('@/src/context/GuestAccessContext', () => ({
  useGuestAccess: () => ({
    requireAccount: mockRequireAccount,
  }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({
    isPremium: true,
    isLoading: false,
  }),
}));

jest.mock('@/src/hooks/useLists', () => ({
  PremiumLimitError: class PremiumLimitError extends Error {},
  useLists: (...args: any[]) => mockUseLists(...args),
  useCreateList: () => ({
    mutateAsync: mockCreateListMutateAsync,
    isPending: false,
  }),
}));

describe('CreateListModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLists.mockReturnValue({
      data: [
        {
          id: 'watchlist',
          name: 'Watchlist',
          items: {},
          createdAt: 1,
        },
      ],
      isLoading: false,
    });
    mockCreateListMutateAsync.mockResolvedValue('custom-list-id');
  });

  it('uses list-management reads and still creates a list in premium-only mode', async () => {
    const ref = createRef<CreateListModalRef>();
    const onSuccess = jest.fn();
    const { getByPlaceholderText, getByText } = render(
      <CreateListModal ref={ref} onSuccess={onSuccess} />
    );

    await act(async () => {
      await ref.current?.present();
    });

    expect(mockUseLists).toHaveBeenCalledWith({ accessScope: 'list-management' });

    fireEvent.changeText(getByPlaceholderText('List Name'), 'My New List');
    fireEvent.changeText(getByPlaceholderText('Description (optional)'), 'Weekend picks');

    await act(async () => {
      fireEvent.press(getByText('Create'));
    });

    await waitFor(() => {
      expect(mockCreateListMutateAsync).toHaveBeenCalledWith({
        name: 'My New List',
        description: 'Weekend picks',
      });
      expect(onSuccess).toHaveBeenCalledWith('custom-list-id', 'My New List');
    });
  });
});
