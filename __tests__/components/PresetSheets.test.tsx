import ManagePresetsSheet, {
  type ManagePresetsSheetRef,
} from '@/src/components/filters/ManagePresetsSheet';
import PresetNameSheet, { type PresetNameSheetRef } from '@/src/components/filters/PresetNameSheet';
import { DEFAULT_WATCH_STATUS_FILTERS } from '@/src/utils/listFilters';
import type { ListFilterPreset, PresetNameError } from '@/src/utils/filterPresets';
import { act, fireEvent, render } from '@testing-library/react-native';
import React, { createRef } from 'react';

const mockSheetDismiss = jest.fn(async () => {});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options ? `${key}:${options.count}` : key,
  }),
}));

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
  notificationAsync: jest.fn(),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff5500' }),
}));

const isDisabled = (node: any) => node.props.accessibilityState?.disabled === true;

describe('PresetNameSheet', () => {
  beforeEach(() => jest.clearAllMocks());

  const setup = (validateName: (name: string) => PresetNameError | null = jest.fn(() => null)) => {
    const onSubmit = jest.fn();
    const ref = createRef<PresetNameSheetRef>();
    const utils = render(
      <PresetNameSheet ref={ref} validateName={validateName} onSubmit={onSubmit} />
    );
    return { ...utils, ref, onSubmit, validateName };
  };

  it('saves a trimmed name and shows what is being saved', async () => {
    const { getByTestId, getByText, ref, onSubmit } = setup();
    await act(async () => {
      await ref.current?.present({ mode: 'create', summary: 'Horror · Netflix' });
    });

    expect(getByText('filterPresets.saveTitle')).toBeTruthy();
    expect(getByTestId('preset-name-summary').props.children).toBe('Horror · Netflix');
    expect(isDisabled(getByTestId('preset-name-save'))).toBe(true);

    fireEvent.changeText(getByTestId('preset-name-input'), '  Late   night  ');
    fireEvent.press(getByTestId('preset-name-save'));

    expect(onSubmit).toHaveBeenCalledWith('Late night');
    expect(mockSheetDismiss).toHaveBeenCalled();
  });

  it('shows why a name is refused and stays open', async () => {
    const { getByTestId, ref, onSubmit } = setup(jest.fn(() => 'duplicate' as const));
    await act(async () => {
      await ref.current?.present({ mode: 'create', summary: '' });
    });

    fireEvent.changeText(getByTestId('preset-name-input'), 'Taken');
    fireEvent.press(getByTestId('preset-name-save'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(getByTestId('preset-name-error').props.children).toBe('filterPresets.errors.duplicate');
    expect(mockSheetDismiss).not.toHaveBeenCalled();
  });

  it('starts a rename on the current name and waits for a change', async () => {
    const { getByTestId, getByText, ref } = setup();
    await act(async () => {
      await ref.current?.present({ mode: 'rename', name: 'Dramas', summary: 'Drama' });
    });

    expect(getByText('filterPresets.renameTitle')).toBeTruthy();
    expect(getByTestId('preset-name-input').props.value).toBe('Dramas');
    expect(isDisabled(getByTestId('preset-name-save'))).toBe(true);

    fireEvent.changeText(getByTestId('preset-name-input'), 'Old dramas');
    expect(isDisabled(getByTestId('preset-name-save'))).toBe(false);
  });
});

describe('ManagePresetsSheet', () => {
  const preset: ListFilterPreset = {
    id: 'p1',
    scope: 'list',
    name: 'Dramas',
    filters: { ...DEFAULT_WATCH_STATUS_FILTERS, genres: [18] },
    createdAt: new Date(2026, 0, 1),
  };

  const setup = (presets: ListFilterPreset[] = [preset], hiddenCount = 0) => {
    const handlers = { onApply: jest.fn(), onRename: jest.fn(), onDelete: jest.fn() };
    const ref = createRef<ManagePresetsSheetRef>();
    const utils = render(
      <ManagePresetsSheet
        ref={ref}
        presets={presets}
        hiddenCount={hiddenCount}
        describePreset={() => 'Drama · 7+ stars'}
        {...handlers}
      />
    );
    return { ...utils, ...handlers };
  };

  it('lists each preset with its summary; tap applies, buttons rename and delete', () => {
    const { getByTestId, getByText, onApply, onRename, onDelete } = setup();

    expect(getByText('Dramas')).toBeTruthy();
    expect(getByText('Drama · 7+ stars')).toBeTruthy();

    fireEvent.press(getByTestId('manage-presets-row-p1'));
    expect(onApply).toHaveBeenCalledWith(preset);

    fireEvent.press(getByTestId('manage-presets-rename-p1'));
    expect(onRename).toHaveBeenCalledWith(preset);

    fireEvent.press(getByTestId('manage-presets-delete-p1'));
    expect(onDelete).toHaveBeenCalledWith(preset);
  });

  it('says when there are none, and how many do not apply here', () => {
    const { getByTestId } = setup([], 2);
    expect(getByTestId('manage-presets-empty')).toBeTruthy();
    expect(getByTestId('manage-presets-hidden').props.children).toBe('filterPresets.hiddenCount:2');
  });
});
