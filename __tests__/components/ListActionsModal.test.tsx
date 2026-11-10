import ListActionsModal, {
  type ListAction,
  type ListActionsModalRef,
} from '@/src/components/ListActionsModal';
import { act, fireEvent, render } from '@testing-library/react-native';
import React, { createRef } from 'react';

const calls: string[] = [];
let resolveDismiss: () => void = () => {};
const mockSheetDismiss = jest.fn(() => {
  calls.push('dismiss');
  return new Promise<void>((resolve) => {
    resolveDismiss = resolve;
  });
});

jest.mock('@lodev09/react-native-true-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const TrueSheet = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      present: jest.fn(async () => {}),
      dismiss: mockSheetDismiss,
    }));
    return <View>{props.children}</View>;
  });
  return { TrueSheet };
});

jest.mock('react-native-gesture-handler', () => {
  const { Pressable, View } = require('react-native');
  return {
    GestureHandlerRootView: ({ children }: any) => <View>{children}</View>,
    Pressable,
  };
});

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('@/src/styles/iconBadgeStyles', () => ({
  useIconBadgeStyles: () => ({ badge: {} }),
}));

const icon = [] as unknown as ListAction['icon'];

const renderActions = async (actions: ListAction[]) => {
  const ref = createRef<ListActionsModalRef>();
  const utils = render(<ListActionsModal ref={ref} actions={actions} title="Dramas" />);
  await act(async () => {
    await ref.current?.present();
  });
  return { ...utils, ref };
};

describe('ListActionsModal', () => {
  beforeEach(() => {
    calls.length = 0;
    jest.clearAllMocks();
  });

  it('runs an action, then closes', async () => {
    const { getByLabelText } = await renderActions([
      { id: 'share', icon, label: 'Share', onPress: () => calls.push('share') },
    ]);

    fireEvent.press(getByLabelText('Share'));

    expect(calls).toEqual(['share', 'dismiss']);
  });

  it('waits until it has closed before running an action that opens another sheet', async () => {
    const { getByLabelText } = await renderActions([
      {
        id: 'filter',
        icon,
        label: 'Filter',
        opensSheet: true,
        onPress: () => calls.push('filter'),
      },
    ]);

    fireEvent.press(getByLabelText('Filter'));
    expect(calls).toEqual(['dismiss']);

    await act(async () => resolveDismiss());
    expect(calls).toEqual(['dismiss', 'filter']);
  });

  it('shows the optional title', async () => {
    const { getByText } = await renderActions([]);
    expect(getByText('Dramas')).toBeTruthy();
  });

  it('never dismisses when it is not open, so it cannot get stuck', async () => {
    // Multi-select mode closes the menu even when it is already closed.
    const ref = createRef<ListActionsModalRef>();
    render(<ListActionsModal ref={ref} actions={[]} />);

    await act(async () => {
      await ref.current?.dismiss();
    });
    expect(mockSheetDismiss).not.toHaveBeenCalled();
  });

  it('runs an action that opens a sheet straight away when already closed', async () => {
    const { getByLabelText, ref } = await renderActions([
      {
        id: 'filter',
        icon,
        label: 'Filter',
        opensSheet: true,
        onPress: () => calls.push('filter'),
      },
    ]);
    // Closed by a swipe before the tap lands.
    await act(async () => {
      const dismissing = ref.current?.dismiss();
      resolveDismiss();
      await dismissing;
    });
    calls.length = 0;

    await act(async () => {
      fireEvent.press(getByLabelText('Filter'));
    });
    expect(calls).toEqual(['filter']);
  });
});
